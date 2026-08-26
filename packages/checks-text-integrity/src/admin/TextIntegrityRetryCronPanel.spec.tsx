// @vitest-environment jsdom
// eslint-disable-next-line import/no-extraneous-dependencies
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TextIntegrityRetryCronPanel } from './TextIntegrityRetryCronPanel.js';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type FetcherMock = {
  state: string;
  data:
    | {
        success?: boolean;
        retryCron?: {
          installed: boolean;
          cronJob?: {
            id: string;
            name: string;
            schedule: string;
            enabled: boolean;
            targetUrl: string | null;
            targetScope: string | null;
            lastRunAt: string | null;
            lastStatus: string | null;
            nextRunAt: string | null;
          };
        };
        error?: { message?: string };
      }
    | undefined;
  submit: ReturnType<typeof vi.fn>;
  Form: ({ children }: { children: React.ReactNode }) => React.JSX.Element;
};

const routerMocks = vi.hoisted(() => {
  const makeFetcher = (): FetcherMock => ({
    state: 'idle',
    data: undefined,
    submit: vi.fn(),
    Form: ({ children }: { children: React.ReactNode }) => <form>{children}</form>,
  });

  return {
    status: makeFetcher(),
    install: makeFetcher(),
    useFetcher: vi.fn(),
  };
});

vi.mock('react-router', () => ({
  useFetcher: (...args: unknown[]) => routerMocks.useFetcher(...args),
}));

vi.mock('@curvenote/scms-core', () => ({
  ui: {
    StatefulButton: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) => (
      <button {...props}>{children}</button>
    ),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
  },
}));

const installedCronJob = {
  id: 'text-integrity-retry-sweep',
  name: 'Text Integrity retry sweep',
  schedule: '*/5 * * * *',
  enabled: true,
  targetUrl: 'https://example.test/retry-sweep',
  targetScope: 'text-integrity.retry-sweep',
  lastRunAt: null,
  lastStatus: null,
  nextRunAt: '2026-07-01T12:00:00.000Z',
};

const installSuccessData = {
  success: true,
  retryCron: { installed: true, cronJob: installedCronJob },
};

describe('TextIntegrityRetryCronPanel install/status precedence', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    routerMocks.status.state = 'idle';
    routerMocks.status.data = { success: true, retryCron: { installed: false } };
    routerMocks.status.submit.mockReset();
    routerMocks.install.state = 'idle';
    routerMocks.install.data = undefined;
    routerMocks.install.submit.mockReset();
    routerMocks.useFetcher.mockReset();
    routerMocks.useFetcher.mockImplementation(() => {
      const call = routerMocks.useFetcher.mock.calls.length;
      return call % 2 === 1 ? routerMocks.status : routerMocks.install;
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function renderPanel() {
    act(() => {
      root.render(<TextIntegrityRetryCronPanel />);
    });
  }

  function text() {
    return container.textContent ?? '';
  }

  function completePostInstallStatusRefresh(statusData: NonNullable<FetcherMock['data']>) {
    routerMocks.status.state = 'submitting';
    renderPanel();
    routerMocks.status.state = 'idle';
    routerMocks.status.data = statusData;
    renderPanel();
  }

  it('shows install snapshot on the first render after install success', () => {
    renderPanel();
    expect(text()).toContain('Install retry cron job');

    routerMocks.install.data = installSuccessData;
    renderPanel();

    expect(text()).toContain('Installed (enabled)');
    expect(text()).not.toContain('Install retry cron job');
  });

  it('uses refreshed status after post-install load completes', () => {
    renderPanel();

    routerMocks.install.data = installSuccessData;
    renderPanel();
    expect(text()).toContain('Installed (enabled)');

    completePostInstallStatusRefresh({
      success: true,
      retryCron: {
        installed: true,
        cronJob: { ...installedCronJob, enabled: false, schedule: '0 * * * *' },
      },
    });

    expect(text()).toContain('Installed (disabled)');
    expect(text()).toContain('0 * * * *');
  });

  it('reflects later manual refresh updates from status fetcher', () => {
    renderPanel();

    routerMocks.status.data = {
      success: true,
      retryCron: { installed: true, cronJob: installedCronJob },
    };
    routerMocks.install.data = installSuccessData;
    completePostInstallStatusRefresh({
      success: true,
      retryCron: { installed: true, cronJob: installedCronJob },
    });
    expect(text()).toContain('Installed (enabled)');

    routerMocks.status.data = {
      success: true,
      retryCron: {
        installed: true,
        cronJob: { ...installedCronJob, schedule: '15 * * * *' },
      },
    };
    renderPanel();

    expect(text()).toContain('15 * * * *');
  });

  it('shows not registered after refresh when cron was removed externally', () => {
    renderPanel();

    routerMocks.install.data = installSuccessData;
    completePostInstallStatusRefresh({
      success: true,
      retryCron: { installed: true, cronJob: installedCronJob },
    });
    expect(text()).toContain('Installed (enabled)');

    routerMocks.status.data = { success: true, retryCron: { installed: false } };
    renderPanel();

    expect(text()).toContain('not registered');
    expect(text()).not.toContain('Installed (enabled)');
  });
});
