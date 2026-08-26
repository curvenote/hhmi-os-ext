// @vitest-environment jsdom
// eslint-disable-next-line import/no-extraneous-dependencies
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { KnownState, MINIMAL_PROOFIG_SERVICE_DATA, type ProofigDataSchema } from '../schema.js';
import { PROOFIG_PDF_GENERATING_STALE_MS } from '../proofigReportFiles.js';
import { ProofigReportPdfActions } from './ProofigReportPdfActions.js';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type MockFetcher = {
  state: 'idle' | 'submitting' | 'loading';
  data: { success?: boolean; error?: { message?: string } } | undefined;
  formData: FormData | undefined;
  submit: ReturnType<typeof vi.fn>;
};

function createMockFetcher(): MockFetcher {
  const fetcher: MockFetcher = {
    state: 'idle',
    data: undefined,
    formData: undefined,
    submit: vi.fn((target: FormData | HTMLFormElement) => {
      fetcher.formData = target instanceof FormData ? target : new FormData();
      fetcher.state = 'submitting';
    }),
  };
  return fetcher;
}

const routerMocks = vi.hoisted(() => {
  const regenerateFetchers = new Map<string, MockFetcher>();
  const refreshFetchers = new Map<string, MockFetcher>();

  function getRegenerateFetcher(key: string): MockFetcher {
    let fetcher = regenerateFetchers.get(key);
    if (!fetcher) {
      fetcher = createMockFetcher();
      regenerateFetchers.set(key, fetcher);
    }
    return fetcher;
  }

  function getRefreshFetcher(key: string): MockFetcher {
    let fetcher = refreshFetchers.get(key);
    if (!fetcher) {
      fetcher = createMockFetcher();
      refreshFetchers.set(key, fetcher);
    }
    return fetcher;
  }

  return {
    fetcherKeys: [] as string[],
    regenerateFetchers,
    refreshFetchers,
    getRegenerateFetcher,
    getRefreshFetcher,
    regenerateFetcherList: () => [...regenerateFetchers.values()],
    regenerateFetcherKeys: () => [...regenerateFetchers.keys()],
    refreshFetcherList: () => [...refreshFetchers.values()],
    revalidate: vi.fn(),
    reset: () => {
      regenerateFetchers.clear();
      refreshFetchers.clear();
    },
  };
});

const domClientMocks = vi.hoisted(() => ({
  createRoot: vi.fn(),
}));

vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<{
    createRoot: typeof createRoot;
    hydrateRoot: typeof hydrateRoot;
  }>();
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      domClientMocks.createRoot(...args);
      return actual.createRoot(...args);
    },
  };
});

vi.mock('react-router', () => ({
  useFetcher: ({ key }: { key?: string } = {}) => {
    if (!key) throw new Error('Expected useFetcher to receive a key');
    routerMocks.fetcherKeys.push(key);
    const regeneratePrefix = 'proofig-pdf-regenerate:';
    const refreshPrefix = 'proofig-pdf-refresh:';
    if (key.startsWith(regeneratePrefix) && key.length > regeneratePrefix.length) {
      return routerMocks.getRegenerateFetcher(key);
    }
    if (key.startsWith(refreshPrefix) && key.length > refreshPrefix.length) {
      return routerMocks.getRefreshFetcher(key);
    }
    throw new Error(`Unexpected useFetcher key: ${key}`);
  },
  useFetchers: () => {
    const fetchers: Array<MockFetcher & { key: string }> = [];
    for (const [key, fetcher] of routerMocks.regenerateFetchers) {
      fetchers.push({ key, ...fetcher });
    }
    for (const [key, fetcher] of routerMocks.refreshFetchers) {
      fetchers.push({ key, ...fetcher });
    }
    return fetchers;
  },
  useRevalidator: () => ({ revalidate: routerMocks.revalidate }),
}));

vi.mock('@curvenote/scms-core', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('@curvenote/scms-core')>();
  return {
    ...actual,
    ui: {
      ...actual.ui,
      Button: ({
        children,
        ...props
      }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
        <button {...props}>{children}</button>
      ),
      MaintenanceTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
      SimpleTooltip: ({ children, title }: { children: React.ReactNode; title: string }) => (
        <span title={title}>{children}</span>
      ),
      toastError: vi.fn(),
      toastInfo: vi.fn(),
      toastSuccess: vi.fn(),
    },
    useCheckMaintenanceBlocked: () => ({ blocked: false, message: undefined }),
  };
});

vi.mock('@hhmi/checks-shared/ActionOverflow', () => ({
  ActionOverflow: ({
    primary,
    menuItems,
  }: {
    primary: React.ReactNode;
    menuItems: Array<{
      id: string;
      label: string;
      disabled?: boolean;
      onSelect: () => void;
    }>;
  }) => (
    <div>
      {primary}
      {menuItems.map((item) => (
        <button key={item.id} type="button" disabled={item.disabled} onClick={item.onSelect}>
          {item.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./ProofigRefreshRemoteStatusButton.js', () => ({
  ProofigRefreshRemoteStatusButton: () => null,
}));

const GENERATED_PATH = 'cdn/generated/run-1/proofig-report.pdf';

function finalData(overrides: Partial<ProofigDataSchema> = {}): ProofigDataSchema {
  return {
    ...MINIMAL_PROOFIG_SERVICE_DATA,
    reportId: 'report-1',
    reportUrl: 'https://proofig.example/report/1',
    summary: {
      state: KnownState.ReportClean,
      receivedAt: '2025-01-01T00:00:00Z',
    },
    stages: {
      ...MINIMAL_PROOFIG_SERVICE_DATA.stages,
      resultsReview: {
        status: 'completed',
        history: [],
        timestamp: '2025-01-01T00:00:00Z',
        outcome: 'clean',
      },
    },
    ...overrides,
  };
}

function storedData(overrides: Partial<ProofigDataSchema> = {}): ProofigDataSchema {
  return finalData({
    proofigReportStored: true,
    storedReportId: 'report-1',
    files: {
      [GENERATED_PATH]: {
        name: 'proofig-report.pdf',
        path: GENERATED_PATH,
        size: 10,
        type: 'application/pdf',
        md5: 'abc',
        slot: 'generated',
        uploadDate: '2025-01-01T00:00:00Z',
        label: 'Proofig report',
      },
    },
    ...overrides,
  });
}

describe('ProofigReportPdfActions', () => {
  let container: HTMLDivElement;
  let root: Root | undefined;
  let hydrated = false;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-01T12:00:00Z'));
    root = undefined;
    hydrated = false;
    domClientMocks.createRoot.mockReset();
    routerMocks.fetcherKeys.length = 0;
    routerMocks.reset();
    routerMocks.revalidate.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    const currentRoot = root;
    root = undefined;
    hydrated = false;
    if (currentRoot) act(() => currentRoot.unmount());
    container.remove();
    vi.useRealTimers();
  });

  function actions(proofigData: ProofigDataSchema) {
    return (
      <ProofigReportPdfActions
        proofigData={proofigData}
        workVersionId="wv-1"
        checkRunId="run-1"
        actionPath="/actions"
      />
    );
  }

  function renderActions(proofigData: ProofigDataSchema) {
    if (hydrated) {
      throw new Error('Cannot render actions with a hydration root');
    }
    act(() => {
      root ??= createRoot(container);
      root.render(actions(proofigData));
    });
  }

  function renderTwoClientInstances(
    proofigData: ProofigDataSchema,
    options: { firstCheckRunId?: string; secondCheckRunId?: string } = {},
  ) {
    if (hydrated) {
      throw new Error('Cannot render actions with a hydration root');
    }
    const firstCheckRunId = options.firstCheckRunId ?? 'run-1';
    const secondCheckRunId = options.secondCheckRunId ?? 'run-1';
    act(() => {
      root ??= createRoot(container);
      root.render(
        <>
          <div data-testid="proofig-pdf-actions-first">
            <ProofigReportPdfActions
              proofigData={proofigData}
              workVersionId="wv-1"
              checkRunId={firstCheckRunId}
              actionPath="/actions"
            />
          </div>
          <div data-testid="proofig-pdf-actions-second">
            <ProofigReportPdfActions
              proofigData={proofigData}
              workVersionId="wv-1"
              checkRunId={secondCheckRunId}
              actionPath="/actions"
            />
          </div>
        </>,
      );
    });
  }

  function secondInstanceRoot() {
    const node = container.querySelector('[data-testid="proofig-pdf-actions-second"]');
    if (!node) throw new Error('Expected second ProofigReportPdfActions instance');
    return node;
  }

  function buttonsWithText(mountRoot: ParentNode, label: string) {
    return [...mountRoot.querySelectorAll('button')].filter(
      (button) => button.textContent === label,
    );
  }

  function text() {
    return container.textContent ?? '';
  }

  function serverMarkup(proofigData: ProofigDataSchema) {
    return renderToString(actions(proofigData));
  }

  function hydrateActions(
    proofigData: ProofigDataSchema,
    onRecoverableError: (error: unknown) => void,
  ) {
    if (root) {
      throw new Error('Cannot hydrate actions with an existing root');
    }
    act(() => {
      root = hydrateRoot(container, actions(proofigData), { onRecoverableError });
      hydrated = true;
    });
  }

  function buttonWithText(label: string) {
    return [...container.querySelectorAll('button')].find((button) => button.textContent === label);
  }

  it('uses conservative generating markup for a fresh stamped request during SSR', () => {
    const markup = serverMarkup(
      storedData({
        proofigReportPdfRequestedAt: '2025-03-01T11:59:00Z',
      }),
    );

    expect(markup).toContain('Generating Report PDF');
    expect(markup).not.toContain('Download PDF report');
    expect(markup).not.toContain('>Generate PDF<');
  });

  it('gives each mounted instance its own fetcher keys even with the same checkRunId', () => {
    renderToString(
      <>
        <ProofigReportPdfActions
          proofigData={finalData()}
          workVersionId="wv-1"
          checkRunId="run:with:colons"
          actionPath="/actions"
        />
        <ProofigReportPdfActions
          proofigData={finalData()}
          workVersionId="wv-1"
          checkRunId="run:with:colons"
          actionPath="/actions"
        />
      </>,
    );

    const regenerateKeys = routerMocks.fetcherKeys.filter((key) =>
      key.startsWith('proofig-pdf-regenerate:'),
    );
    const refreshKeys = routerMocks.fetcherKeys.filter((key) =>
      key.startsWith('proofig-pdf-refresh:'),
    );

    expect(regenerateKeys).toHaveLength(2);
    expect(refreshKeys).toHaveLength(2);
    expect(regenerateKeys[0]).not.toBe(regenerateKeys[1]);
    expect(refreshKeys[0]).not.toBe(refreshKeys[1]);
    expect(regenerateKeys[0]?.replace('proofig-pdf-regenerate:', '')).toBe(
      refreshKeys[0]?.replace('proofig-pdf-refresh:', ''),
    );
    expect(routerMocks.fetcherKeys.join(' ')).not.toContain('unscoped');
    expect(routerMocks.fetcherKeys.join(' ')).not.toContain('run:with:colons');
  });

  it('keeps regenerate and refresh keys paired for a single instance', () => {
    renderToString(
      <ProofigReportPdfActions
        proofigData={finalData()}
        workVersionId="wv-1"
        checkRunId="run-1"
        actionPath="/actions"
      />,
    );

    const [regenerateKey, refreshKey] = routerMocks.fetcherKeys;
    expect(regenerateKey).toMatch(/^proofig-pdf-regenerate:.+/);
    expect(refreshKey).toMatch(/^proofig-pdf-refresh:.+/);
    expect(regenerateKey?.replace('proofig-pdf-regenerate:', '')).toBe(
      refreshKey?.replace('proofig-pdf-refresh:', ''),
    );
  });

  it('keeps the same instance fetcher scope across re-renders', () => {
    const keyPrefixes = (keys: string[]) => keys.map((key) => key.split(':')[0]);
    const scopes = (keys: string[]) =>
      new Set(keys.map((key) => key.replace(/^proofig-pdf-(regenerate|refresh):/, '')));

    renderActions(finalData());
    expect(keyPrefixes(routerMocks.fetcherKeys)).toEqual([
      'proofig-pdf-regenerate',
      'proofig-pdf-refresh',
    ]);
    const firstScopes = scopes(routerMocks.fetcherKeys);
    expect(firstScopes.size).toBe(1);
    expect([...firstScopes][0]).not.toBe('run-1');

    routerMocks.fetcherKeys.length = 0;
    renderActions(storedData());

    expect(keyPrefixes(routerMocks.fetcherKeys)).toEqual([
      'proofig-pdf-regenerate',
      'proofig-pdf-refresh',
    ]);
    const secondScopes = scopes(routerMocks.fetcherKeys);
    expect(secondScopes.size).toBe(1);
    expect(secondScopes).toEqual(firstScopes);
  });

  it('hydrates conservative stale SSR markup then restores stored report actions', () => {
    const data = storedData({
      proofigReportPdfRequestedAt: '2025-03-01T11:44:59Z',
    });
    const onRecoverableError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const markup = serverMarkup(data);
      expect(markup).toContain('Generating Report PDF');
      expect(markup).not.toContain('Download PDF report');
      expect(markup).not.toContain('>Generate PDF<');

      container.innerHTML = markup;
      hydrateActions(data, onRecoverableError);

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(consoleError.mock.calls).toEqual([]);
      expect(text()).not.toContain('Generating Report PDF');
      expect(text()).toContain('Download PDF report');
      expect(buttonWithText('Regenerate PDF')).toBeDefined();
      expect(buttonWithText('Regenerate PDF')?.disabled).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('makes an aged request recoverable and stops the generating state', () => {
    renderActions(
      finalData({
        proofigReportPdfRequestedAt: '2025-03-01T11:59:00Z',
      }),
    );
    expect(text()).toContain('Generating Report PDF');

    act(() => {
      vi.advanceTimersByTime(PROOFIG_PDF_GENERATING_STALE_MS);
    });

    expect(text()).not.toContain('Generating Report PDF');
    expect(text()).toContain('Generate PDF');
    expect(buttonWithText('Generate PDF')?.disabled).toBe(false);
  });

  it('reuses its client root when rendering actions repeatedly', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      renderActions(finalData());
      renderActions(storedData());

      expect(text()).toContain('Download PDF report');
      expect(domClientMocks.createRoot).toHaveBeenCalledTimes(1);
      expect(container.childElementCount).toBe(1);
      expect(consoleError.mock.calls).toEqual([]);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('keeps Download and surfaces Retry with an error after failed regeneration', () => {
    renderActions(
      storedData({
        proofigReportPdfError: 'render failed',
        proofigReportPdfFailedReportId: 'report-1',
      }),
    );

    expect(text()).toContain('Download PDF report');
    expect(text()).toContain('Retry PDF generation');
    expect(container.querySelector('[title="render failed"]')).toBeTruthy();
  });

  it('does not show an old report failure for the current report', () => {
    renderActions(
      finalData({
        reportId: 'report-2',
        proofigReportPdfError: 'old render failed',
        proofigReportPdfFailedReportId: 'report-1',
      }),
    );

    expect(text()).toContain('Generate PDF');
    expect(text()).not.toContain('PDF Generation Failed');
    expect(text()).not.toContain('Retry PDF generation');
  });

  it('lets a busy regenerate fetcher override failure state', () => {
    renderActions(
      finalData({
        proofigReportPdfError: 'render failed',
        proofigReportPdfFailedReportId: 'report-1',
      }),
    );
    const [fetcher] = routerMocks.regenerateFetcherList();
    fetcher!.state = 'submitting';
    act(() => {
      root?.render(
        actions(
          finalData({
            proofigReportPdfError: 'render failed',
            proofigReportPdfFailedReportId: 'report-1',
          }),
        ),
      );
    });

    expect(text()).toContain('Generating Report PDF');
    expect(text()).not.toContain('PDF Generation Failed');
  });

  it('shows run-scoped generating on the second instance when the first is submitting regenerate', () => {
    const data = finalData();
    renderTwoClientInstances(data);

    const [firstKey, secondKey] = routerMocks.regenerateFetcherKeys();
    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(firstKey).not.toBe(secondKey);

    const firstFetcher = routerMocks.getRegenerateFetcher(firstKey!);
    const fd = new FormData();
    fd.set('intent', 'regenerate-pdf');
    fd.set('workVersionId', 'wv-1');
    fd.set('checkRunId', 'run-1');
    firstFetcher.formData = fd;
    firstFetcher.state = 'submitting';

    act(() => {
      root?.render(
        <>
          <div data-testid="proofig-pdf-actions-first">{actions(data)}</div>
          <div data-testid="proofig-pdf-actions-second">{actions(data)}</div>
        </>,
      );
    });

    const secondRoot = secondInstanceRoot();
    expect(secondRoot.textContent).toContain('Generating Report PDF');

    const generateButtons = buttonsWithText(secondRoot, 'Generate PDF');
    expect(generateButtons).toHaveLength(1);
    expect(generateButtons[0]?.disabled).toBe(true);
  });

  it('does not block a different checkRunId when another instance is submitting regenerate', () => {
    const data = finalData();
    renderTwoClientInstances(data, { firstCheckRunId: 'run-1', secondCheckRunId: 'run-2' });

    const [firstKey, secondKey] = routerMocks.regenerateFetcherKeys();
    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();

    const firstFetcher = routerMocks.getRegenerateFetcher(firstKey!);
    const secondFetcher = routerMocks.getRegenerateFetcher(secondKey!);
    const fd = new FormData();
    fd.set('intent', 'regenerate-pdf');
    fd.set('workVersionId', 'wv-1');
    fd.set('checkRunId', 'run-1');
    firstFetcher.formData = fd;
    firstFetcher.state = 'submitting';

    act(() => {
      root?.render(
        <>
          <div data-testid="proofig-pdf-actions-first">
            <ProofigReportPdfActions
              proofigData={data}
              workVersionId="wv-1"
              checkRunId="run-1"
              actionPath="/actions"
            />
          </div>
          <div data-testid="proofig-pdf-actions-second">
            <ProofigReportPdfActions
              proofigData={data}
              workVersionId="wv-1"
              checkRunId="run-2"
              actionPath="/actions"
            />
          </div>
        </>,
      );
    });

    const secondRoot = secondInstanceRoot();
    expect(secondRoot.textContent).not.toContain('Generating Report PDF');

    const generateButtons = buttonsWithText(secondRoot, 'Generate PDF');
    expect(generateButtons).toHaveLength(1);
    expect(generateButtons[0]?.disabled).toBe(false);

    secondFetcher.submit.mockClear();
    act(() => {
      generateButtons[0]!.click();
    });
    expect(secondFetcher.submit).toHaveBeenCalledTimes(1);
  });

  it('does not show generating when a peer refresh fetcher is submitting', () => {
    const data = finalData();
    renderTwoClientInstances(data);

    const refreshKeys = routerMocks.fetcherKeys.filter((key) =>
      key.startsWith('proofig-pdf-refresh:'),
    );
    expect(refreshKeys).toHaveLength(2);
    const firstRefreshFetcher = routerMocks.getRefreshFetcher(refreshKeys[0]!);
    const fd = new FormData();
    fd.set('intent', 'refresh-remote-status');
    fd.set('workVersionId', 'wv-1');
    fd.set('checkRunId', 'run-1');
    firstRefreshFetcher.formData = fd;
    firstRefreshFetcher.state = 'submitting';

    act(() => {
      root?.render(
        <>
          <div data-testid="proofig-pdf-actions-first">{actions(data)}</div>
          <div data-testid="proofig-pdf-actions-second">{actions(data)}</div>
        </>,
      );
    });

    const secondRoot = secondInstanceRoot();
    expect(secondRoot.textContent).not.toContain('Generating Report PDF');
    const generateButtons = buttonsWithText(secondRoot, 'Generate PDF');
    expect(generateButtons).toHaveLength(1);
    expect(generateButtons[0]?.disabled).toBe(false);
  });

  it('fires toast and revalidate once when only one concurrent instance settles regenerate', async () => {
    const { ui } = await import('@curvenote/scms-core');
    const data = finalData();

    renderTwoClientInstances(data);

    const [firstKey] = routerMocks.regenerateFetcherKeys();
    const firstFetcher = routerMocks.getRegenerateFetcher(firstKey!);
    firstFetcher.state = 'idle';
    firstFetcher.data = { success: true };

    act(() => {
      root?.render(
        <>
          <div data-testid="proofig-pdf-actions-first">{actions(data)}</div>
          <div data-testid="proofig-pdf-actions-second">{actions(data)}</div>
        </>,
      );
    });

    expect(ui.toastSuccess).toHaveBeenCalledTimes(1);
    expect(routerMocks.revalidate).toHaveBeenCalledTimes(1);
  });
});
