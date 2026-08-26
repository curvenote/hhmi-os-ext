// @vitest-environment jsdom
// eslint-disable-next-line import/no-extraneous-dependencies
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HOLDING_BUSY_TIMEOUT_MS, useHoldingBusy } from './useHoldingBusy.js';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function HoldingBusyProbe({
  fetcher,
  releaseWhen,
  onSettledError,
}: {
  fetcher: { state: string; data: unknown };
  releaseWhen?: boolean;
  onSettledError?: (message: string) => void;
}) {
  const holdingBusy = useHoldingBusy({ fetcher, releaseWhen, onSettledError });
  return <span data-testid="holding">{holdingBusy ? 'busy' : 'idle'}</span>;
}

describe('useHoldingBusy', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  function renderProbe(props: React.ComponentProps<typeof HoldingBusyProbe>) {
    act(() => {
      root.render(<HoldingBusyProbe {...props} />);
    });
  }

  function holdingText() {
    return container.querySelector('[data-testid="holding"]')?.textContent;
  }

  it('keeps holding on empty settle until timeout', () => {
    const fetcher = { state: 'submitting', data: undefined as unknown };
    renderProbe({ fetcher });

    act(() => {
      fetcher.state = 'idle';
      root.render(<HoldingBusyProbe fetcher={fetcher} />);
    });
    expect(holdingText()).toBe('busy');

    act(() => {
      vi.advanceTimersByTime(HOLDING_BUSY_TIMEOUT_MS);
    });
    expect(holdingText()).toBe('idle');
  });

  it('releases on structured error settle', () => {
    const onSettledError = vi.fn();
    const fetcher = { state: 'submitting', data: undefined as unknown };
    renderProbe({ fetcher, onSettledError });

    act(() => {
      fetcher.state = 'idle';
      fetcher.data = { error: { message: 'blocked by EULA' } };
      root.render(<HoldingBusyProbe fetcher={fetcher} onSettledError={onSettledError} />);
    });

    expect(holdingText()).toBe('idle');
    expect(onSettledError).toHaveBeenCalledWith('blocked by EULA');
  });

  it('releases when releaseWhen becomes true', () => {
    const fetcher = { state: 'submitting', data: undefined as unknown };
    renderProbe({ fetcher, releaseWhen: false });

    act(() => {
      fetcher.state = 'idle';
      fetcher.data = { success: true };
      root.render(<HoldingBusyProbe fetcher={fetcher} releaseWhen={true} />);
    });

    expect(holdingText()).toBe('idle');
  });
});
