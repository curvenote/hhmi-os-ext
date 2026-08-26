// @vitest-environment jsdom
// eslint-disable-next-line import/no-extraneous-dependencies
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  TextIntegrityPdfReportStatus,
  type TextIntegrityPdfReportStatusProps,
} from './TextIntegrityPdfReportStatus.js';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const routerMocks = vi.hoisted(() => {
  const RESTART_FETCHER_KEY = 'text-integrity-restart-pdf';
  const REFRESH_FETCHER_KEY = 'text-integrity-refresh-status';
  const restartFetcher = {
    state: 'idle' as 'idle' | 'submitting' | 'loading',
    data: undefined as { success?: boolean; error?: { message?: string } } | undefined,
    submit: vi.fn(),
  };
  const refreshFetcher = {
    state: 'idle' as 'idle' | 'submitting' | 'loading',
    data: undefined as
      | {
          success?: boolean;
          error?: { message?: string };
          recovery?: { ok: false; message: string; status: number };
        }
      | undefined,
    submit: vi.fn(),
  };
  return {
    RESTART_FETCHER_KEY,
    REFRESH_FETCHER_KEY,
    restartFetcher,
    refreshFetcher,
    revalidate: vi.fn(),
  };
});

const uiMocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

const maintenanceMocks = vi.hoisted(() => ({
  blocked: false,
  message: undefined as string | undefined,
}));

vi.mock('react-router', () => ({
  useFetcher: (opts?: { key?: string }) => {
    if (opts?.key === routerMocks.RESTART_FETCHER_KEY) return routerMocks.restartFetcher;
    if (opts?.key === routerMocks.REFRESH_FETCHER_KEY) return routerMocks.refreshFetcher;
    throw new Error(`unexpected useFetcher key: ${String(opts?.key)}`);
  },
  useRevalidator: () => ({ revalidate: routerMocks.revalidate }),
}));

const RELAY_STATUS_INTENT = 'checks-text-integrity:relay-status';

vi.mock('@curvenote/scms-core', () => ({
  ui: {
    Button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
      <button {...props}>{children}</button>
    ),
    StatefulButton: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      variant?: string;
      busy?: boolean;
      overlayBusy?: boolean;
    }) => <button {...props}>{children}</button>,
    MaintenanceTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Menu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    MenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    MenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    MenuItem: ({
      children,
      onSelect,
      disabled,
    }: {
      children: React.ReactNode;
      onSelect?: (event: { preventDefault: () => void }) => void;
      disabled?: boolean;
    }) => (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect?.({ preventDefault: () => {} })}
      >
        {children}
      </button>
    ),
    toastError: uiMocks.toastError,
    toastWarning: uiMocks.toastWarning,
  },
  useCheckMaintenanceBlocked: () => ({
    blocked: maintenanceMocks.blocked,
    message: maintenanceMocks.message,
  }),
}));

vi.mock('./TextIntegrityEulaDialog.js', () => ({
  TextIntegrityEulaDialog: () => null,
}));

vi.mock('./useTextIntegrityEulaEnable.js', () => ({
  useTextIntegrityEulaEnable: () => ({
    dialogOpen: false,
    setDialogOpen: vi.fn(),
    eulaPresentation: undefined,
    requestEnable: (fn: () => void) => fn(),
    acceptEula: vi.fn(),
    busy: false,
  }),
}));

function defaultProps(): TextIntegrityPdfReportStatusProps {
  return {
    reportGenerationComplete: true,
    reportGenerationFailed: false,
    waitingForReport: false,
    similarityReportPdfInvalidated: true,
    reportPdfAvailable: false,
    checkRunId: 'run-1',
    workVersionId: 'wv-1',
    actionPath: '/actions',
    includeRemoteRefresh: true,
  };
}

/** No PDF chrome — only remote Refresh should render. */
function refreshOnlyProps(): Partial<TextIntegrityPdfReportStatusProps> {
  return {
    reportGenerationComplete: false,
    reportGenerationFailed: false,
    waitingForReport: false,
    similarityReportPdfInvalidated: false,
    reportPdfAvailable: false,
    includeRemoteRefresh: true,
  };
}

describe('TextIntegrityPdfReportStatus', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    maintenanceMocks.blocked = false;
    maintenanceMocks.message = undefined;
    routerMocks.restartFetcher.state = 'idle';
    routerMocks.restartFetcher.data = undefined;
    routerMocks.restartFetcher.submit.mockReset();
    routerMocks.refreshFetcher.state = 'idle';
    routerMocks.refreshFetcher.data = undefined;
    routerMocks.refreshFetcher.submit.mockReset();
    routerMocks.revalidate.mockReset();
    uiMocks.toastError.mockReset();
    uiMocks.toastWarning.mockReset();
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

  function renderStatus(props: Partial<TextIntegrityPdfReportStatusProps> = {}) {
    act(() => {
      root.render(<TextIntegrityPdfReportStatus {...defaultProps()} {...props} />);
    });
  }

  function text() {
    return container.textContent ?? '';
  }

  function clickButtonNamed(label: string) {
    const button = Array.from(container.querySelectorAll('button')).find(
      (el) => el.textContent?.trim() === label,
    );
    expect(button).toBeTruthy();
    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  function buttonNamed(label: string) {
    return Array.from(container.querySelectorAll('button')).find(
      (el) => el.textContent?.trim() === label,
    );
  }

  describe('retry latch', () => {
    it('keeps regenerate hidden during the race before waiting state arrives, then resets after failure', () => {
      renderStatus();
      expect(text()).toContain('Regenerate PDF');
      expect(text()).toContain('Refresh');

      routerMocks.restartFetcher.data = { success: true };
      renderStatus();

      expect(routerMocks.revalidate).toHaveBeenCalledTimes(1);
      expect(text()).toContain('Waiting for PDF Report');
      expect(buttonNamed('Regenerate PDF')?.disabled).toBe(true);

      renderStatus({ waitingForReport: true });
      expect(text()).toContain('Waiting for PDF Report');
      expect(buttonNamed('Regenerate PDF')?.disabled).toBe(true);

      renderStatus({
        reportGenerationComplete: false,
        reportGenerationFailed: true,
        waitingForReport: false,
        similarityReportPdfInvalidated: false,
      });

      expect(text()).toContain('PDF Generation Failed');
      expect(text()).toContain('Retry PDF generation');
      expect(text()).not.toContain('Waiting for PDF Report');
    });

    it('arms and resets for invalidated regeneration once loader data reports waiting', () => {
      renderStatus();

      routerMocks.restartFetcher.data = { success: true };
      renderStatus();

      expect(text()).toContain('Waiting for PDF Report');
      expect(buttonNamed('Regenerate PDF')?.disabled).toBe(true);

      renderStatus({ waitingForReport: true, similarityReportPdfInvalidated: true });
      expect(text()).toContain('Waiting for PDF Report');
      expect(buttonNamed('Regenerate PDF')?.disabled).toBe(true);

      renderStatus({
        waitingForReport: false,
        similarityReportPdfInvalidated: false,
        reportGenerationComplete: true,
        reportPdfAvailable: true,
      });

      expect(text()).toContain('Download PDF report');
      expect(text()).toContain('Refresh');
      expect(text()).toContain('Regenerate PDF');
      expect(buttonNamed('Regenerate PDF')?.disabled).toBe(false);
      expect(text()).not.toContain('Waiting for PDF Report');
    });
  });

  describe('remote refresh', () => {
    it('submits relay-status from the kebab Refresh item', () => {
      renderStatus({
        similarityReportPdfInvalidated: false,
        reportPdfAvailable: true,
      });

      clickButtonNamed('Refresh');

      expect(routerMocks.refreshFetcher.submit).toHaveBeenCalledTimes(1);
      const [formData, opts] = routerMocks.refreshFetcher.submit.mock.calls[0] as [
        FormData,
        { method: string; action: string },
      ];
      expect(formData.get('intent')).toBe(RELAY_STATUS_INTENT);
      expect(formData.get('workVersionId')).toBe('wv-1');
      expect(formData.get('checkRunId')).toBe('run-1');
      expect(opts).toEqual({ method: 'post', action: '/actions' });
      expect(routerMocks.restartFetcher.submit).not.toHaveBeenCalled();
    });

    it('allows Regenerate PDF from the kebab when the PDF is not stale', () => {
      renderStatus({
        similarityReportPdfInvalidated: false,
        reportPdfAvailable: true,
      });

      expect(text()).toContain('Download PDF report');
      expect(text()).toContain('Regenerate PDF');
      expect(buttonNamed('Regenerate PDF')?.disabled).toBe(false);

      clickButtonNamed('Regenerate PDF');
      expect(routerMocks.restartFetcher.submit).toHaveBeenCalledTimes(1);
      const [formData] = routerMocks.restartFetcher.submit.mock.calls[0] as [FormData];
      expect(formData.get('intent')).toBe('restart-similarity-pdf');
    });

    it('disables Regenerate PDF in the kebab while waiting for a PDF', () => {
      renderStatus({
        similarityReportPdfInvalidated: false,
        reportPdfAvailable: true,
        waitingForReport: true,
      });

      expect(text()).toContain('Waiting for PDF Report');
      expect(buttonNamed('Regenerate PDF')?.disabled).toBe(true);

      clickButtonNamed('Regenerate PDF');
      expect(routerMocks.restartFetcher.submit).not.toHaveBeenCalled();
    });

    it('keeps PDF failure chrome during maintenance with Retry disabled', () => {
      maintenanceMocks.blocked = true;
      maintenanceMocks.message = 'Maintenance';

      renderStatus({
        reportGenerationComplete: false,
        reportGenerationFailed: true,
        waitingForReport: false,
        similarityReportPdfInvalidated: false,
        reportPdfAvailable: false,
      });

      expect(text()).toContain('PDF Generation Failed');
      expect(text()).toContain('Retry PDF generation');
      expect(buttonNamed('Retry PDF generation')?.disabled).toBe(true);
      expect(buttonNamed('Refresh')?.disabled).toBe(true);

      clickButtonNamed('Retry PDF generation');
      expect(routerMocks.restartFetcher.submit).not.toHaveBeenCalled();
    });

    it('enables Regenerate PDF in the kebab when stale and download is still the primary', () => {
      // Defensive: if download+stale ever coexist, regenerate stays in menu and is enabled.
      renderStatus({
        similarityReportPdfInvalidated: true,
        reportPdfAvailable: true,
        reportGenerationFailed: false,
      });

      expect(text()).toContain('Download PDF report');
      const regen = buttonNamed('Regenerate PDF');
      expect(regen?.disabled).toBe(false);

      clickButtonNamed('Regenerate PDF');
      expect(routerMocks.restartFetcher.submit).toHaveBeenCalledTimes(1);
      const [formData] = routerMocks.restartFetcher.submit.mock.calls[0] as [FormData];
      expect(formData.get('intent')).toBe('restart-similarity-pdf');
    });

    it('revalidates and toastWarns when refresh succeeds with recovery.ok === false', () => {
      renderStatus({
        similarityReportPdfInvalidated: false,
        reportPdfAvailable: true,
      });

      routerMocks.refreshFetcher.data = {
        success: true,
        recovery: { ok: false, message: 'lease held', status: 409 },
      };
      renderStatus({
        similarityReportPdfInvalidated: false,
        reportPdfAvailable: true,
      });

      expect(routerMocks.revalidate).toHaveBeenCalledTimes(1);
      expect(uiMocks.toastWarning).toHaveBeenCalledWith(
        'Status refreshed, but recovery did not start',
        { description: 'lease held' },
      );
      expect(uiMocks.toastError).not.toHaveBeenCalled();
    });

    it('renders a standalone Refresh button when only canRefresh is true and submits relay-status', () => {
      renderStatus(refreshOnlyProps());

      expect(text()).toBe('Refresh');
      expect(text()).not.toContain('Regenerate PDF');
      expect(text()).not.toContain('Download PDF report');
      expect(text()).not.toContain('Waiting for PDF Report');

      clickButtonNamed('Refresh');

      expect(routerMocks.refreshFetcher.submit).toHaveBeenCalledTimes(1);
      const [formData, opts] = routerMocks.refreshFetcher.submit.mock.calls[0] as [
        FormData,
        { method: string; action: string },
      ];
      expect(formData.get('intent')).toBe(RELAY_STATUS_INTENT);
      expect(opts).toEqual({ method: 'post', action: '/actions' });
    });
  });
});
