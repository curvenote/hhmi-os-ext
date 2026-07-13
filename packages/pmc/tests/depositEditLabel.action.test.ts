import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionFunctionArgs } from 'react-router';
import {
  DUPLICATE_SLOT_LABEL_MESSAGE,
  DuplicateSlotLabelError,
} from '../src/common/fileMappings.js';

const mockWithSecureWorkContext = vi.fn();
const mockSafeWorkVersionJsonUpdate = vi.fn();
const mockDbGetWorkVersion = vi.fn();

vi.mock('@curvenote/scms-server', () => ({
  withSecureWorkContext: (...args: unknown[]) => mockWithSecureWorkContext(...args),
  safeWorkVersionJsonUpdate: (...args: unknown[]) => mockSafeWorkVersionJsonUpdate(...args),
}));

vi.mock('../src/backend/db.server.js', () => ({
  dbGetWorkVersion: (...args: unknown[]) => mockDbGetWorkVersion(...args),
  dbGetLatestNonDraftSubmissionVersionId: vi.fn(),
  dbGetNumSubmissionVersions: vi.fn(),
  dbGetSubmissionVersion: vi.fn(),
}));

const { action } = await import('../src/routes/$workId.pmc.deposit.$submissionVersionId.js');

function makeEditLabelRequest(path: string, value: string) {
  const formData = new FormData();
  formData.set('intent', 'edit-label');
  formData.set('path', path);
  formData.set('value', value);
  return new Request('http://localhost/deposit', { method: 'POST', body: formData });
}

describe('PMC deposit edit-label action', () => {
  const ctx = {
    work: { id: 'work-1' },
    $config: { app: { extensions: { pmc: true } } },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWithSecureWorkContext.mockResolvedValue(ctx);
    mockDbGetWorkVersion.mockResolvedValue({
      id: 'wv-1',
      cdn: 'cdn-key',
      metadata: {},
    });
  });

  it('returns 400 validation when safeWorkVersionJsonUpdate throws DuplicateSlotLabelError', async () => {
    mockSafeWorkVersionJsonUpdate.mockRejectedValue(new DuplicateSlotLabelError());

    const result = await action({
      request: makeEditLabelRequest('cdn-key/pmc/native.docx', 'taken'),
      params: {},
      context: {},
    } as ActionFunctionArgs);

    expect(result.init?.status).toBe(400);
    expect(result.data).toEqual({
      error: { type: 'validation', message: DUPLICATE_SLOT_LABEL_MESSAGE },
    });
  });

  it('returns logged 500 when safeWorkVersionJsonUpdate throws a generic error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockSafeWorkVersionJsonUpdate.mockRejectedValue(new Error('connection refused'));

    const result = await action({
      request: makeEditLabelRequest('cdn-key/pmc/native.docx', 'renamed'),
      params: {},
      context: {},
    } as ActionFunctionArgs);

    expect(result.init?.status).toBe(500);
    expect(result.data).toEqual({
      error: { type: 'general', message: 'Failed to update label' },
    });
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to update native file label:',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
