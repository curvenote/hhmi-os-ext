import { useState, useEffect, useRef } from 'react';
import { useFetcher, useRevalidator } from 'react-router';
import { withAppScopedContext } from '@curvenote/scms-server';
import {
  LoadingSpinner,
  MainWrapper,
  PageFrame,
  getBrandingFromMetaMatches,
  joinPageTitle,
  ui,
  scopes,
  useRevalidateOnInterval,
  WorkFileUpload,
} from '@curvenote/scms-core';
import { loadProofigCheckServiceRuns } from './loadRuns.server.js';
import { getDraftForManuscriptChecks } from './getDraft.server.js';
import { handleProofigAction } from '../../server/actions.js';
import { extension as proofigServerExtension } from '../../server.js';
import { PROOFIG_CHECKS_ACTION_PATH } from '../../client.js';
import { MANUSCRIPT_UPLOAD_CONFIG } from './uploadConfig.js';
import { SimplifiedRunCard } from '../../simplified/index.js';
import proofigLogo from '../../assets/proofig-logo.svg';
import type { CheckServiceRunWithVersion } from './loadRuns.server.js';

type LoaderData = { runs: CheckServiceRunWithVersion[] };
type DraftData = {
  success: boolean;
  error?: string;
  workId?: string;
  workVersionId?: string;
  cdnKey?: string;
  title?: string;
  metadata?: unknown;
};

export const meta = ({
  matches,
}: {
  matches: Parameters<typeof getBrandingFromMetaMatches>[0];
}) => {
  const branding = getBrandingFromMetaMatches(matches);
  return [{ key: 'title', title: joinPageTitle('Manuscript checks', branding.title) }];
};

// TODO: tie in to extension config
const ext = { scopes: { app: { integrity: 'ext:app:integrity' } } };

export async function loader(args: Parameters<typeof withAppScopedContext>[0]) {
  const ctx = await withAppScopedContext(args, [scopes.app.works.upload, ext.scopes.app.integrity]);
  const runs = await loadProofigCheckServiceRuns(ctx);
  return { runs };
}

export async function action(args: Parameters<typeof withAppScopedContext>[0]) {
  const ctx = await withAppScopedContext(args, [scopes.app.works.upload, ext.scopes.app.integrity]);
  const formData = await args.request.formData();
  const intent = formData.get('intent');
  if (
    intent === 'fetch-remote-status' ||
    intent === 'apply-notify-payload' ||
    intent === 'refresh-report-url'
  ) {
    const workVersionId = formData.get('workVersionId')?.toString();
    if (!workVersionId) {
      return {
        error: { type: 'general', message: 'workVersionId is required' },
        status: 400,
      };
    }
    return handleProofigAction({
      intent: intent as string,
      workVersionId,
      formData,
      ctx,
      serverExtensions: [proofigServerExtension],
    });
  }
  if (intent !== 'get-draft') {
    return { success: false, error: 'Invalid intent' };
  }
  const result = await getDraftForManuscriptChecks(ctx);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return {
    success: true,
    workId: result.workId,
    workVersionId: result.workVersionId,
    cdnKey: result.cdnKey,
    title: result.title,
    metadata: result.metadata,
  };
}

export function shouldRevalidate({
  formData,
  defaultShouldRevalidate,
}: {
  formData: FormData | null;
  defaultShouldRevalidate: boolean;
}) {
  const intent = formData?.get('intent');
  if (
    intent === 'get-draft' ||
    intent === 'fetch-remote-status' ||
    intent === 'refresh-report-url'
  ) {
    return false;
  }
  return defaultShouldRevalidate;
}

const PROOFIG_CHECK_NAME = 'proofig';

/** How long to keep polling after user starts a new check (to pick up the new run and its status). */
const POLL_AFTER_SUBMIT_MS = 30_000;

export default function ManuscriptChecksPage({ loaderData }: { loaderData: LoaderData }) {
  const { runs } = loaderData;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [runCheckLoading, setRunCheckLoading] = useState(false);
  const [recentlySubmitted, setRecentlySubmitted] = useState(false);
  const submittedForOpen = useRef(false);
  const draftFetcher = useFetcher<DraftData>();
  const titleFetcher = useFetcher();
  const revalidator = useRevalidator();

  const hasActiveRuns = runs.some((run: CheckServiceRunWithVersion) => {
    const d = run.data as {
      status?: string;
      serviceData?: { stages?: Record<string, { status?: string }> };
    } | null;
    if (!d?.serviceData?.stages) return true;
    const stages = d.serviceData.stages;
    const terminal = ['completed', 'error'];
    return Object.values(stages).some((s) => s && !terminal.includes(s.status ?? ''));
  });

  // Poll when any run is in progress, or for a short period after starting a new check
  const shouldPoll = hasActiveRuns || recentlySubmitted;
  useRevalidateOnInterval({
    enabled: shouldPoll,
    interval: recentlySubmitted ? 1000 : 3000,
  });

  // Clear "recently submitted" after a delay so we stop aggressive polling
  useEffect(() => {
    if (!recentlySubmitted) return;
    const t = setTimeout(() => setRecentlySubmitted(false), POLL_AFTER_SUBMIT_MS);
    return () => clearTimeout(t);
  }, [recentlySubmitted]);

  const draftData = draftFetcher.data;
  const draftReady =
    draftData?.success && draftData.workId && draftData.workVersionId && draftData.cdnKey;
  const uploadActionUrl = draftReady
    ? `/app/works/${draftData.workId}/upload/${draftData.workVersionId}`
    : undefined;

  // When dialog opens, request draft (existing or new) once per open
  useEffect(() => {
    if (!dialogOpen) {
      submittedForOpen.current = false;
      return;
    }
    if (submittedForOpen.current || draftFetcher.state !== 'idle') return;
    submittedForOpen.current = true;
    const fd = new FormData();
    fd.set('intent', 'get-draft');
    draftFetcher.submit(fd, { method: 'post' });
  }, [dialogOpen, draftFetcher.state]);

  // Sync title from draft when draft loads
  useEffect(() => {
    if (draftData?.success && draftData.title !== undefined) {
      setTitle(draftData.title);
    }
  }, [draftData?.success, draftData?.title]);

  const saveTitle = () => {
    if (!uploadActionUrl) return;
    const fd = new FormData();
    fd.set('intent', 'update-title');
    fd.set('title', title);
    titleFetcher.submit(fd, { method: 'post', action: uploadActionUrl });
  };

  // Run check = update title, enable Proofig, then confirm-work (reuses upload route action)
  const runCheck = async () => {
    if (!draftData?.workId || !uploadActionUrl) return;
    setRunCheckLoading(true);
    try {
      await fetch(uploadActionUrl, {
        method: 'POST',
        body: (() => {
          const fd = new FormData();
          fd.set('intent', 'update-title');
          fd.set('title', title);
          return fd;
        })(),
        redirect: 'manual',
        credentials: 'same-origin',
      });
      await fetch(uploadActionUrl, {
        method: 'POST',
        body: (() => {
          const fd = new FormData();
          fd.set('intent', 'toggle-check');
          fd.set('title', title);
          fd.set('checkName', PROOFIG_CHECK_NAME);
          fd.set('checked', 'true');
          return fd;
        })(),
        redirect: 'manual',
        credentials: 'same-origin',
      });
      const confirmRes = await fetch(uploadActionUrl, {
        method: 'POST',
        body: (() => {
          const fd = new FormData();
          fd.set('intent', 'confirm-work');
          fd.set('title', title);
          fd.set('redirect', 'false');
          return fd;
        })(),
        redirect: 'manual',
        credentials: 'same-origin',
      });
      const confirmed = confirmRes.ok;
      if (!confirmed) {
        const text = await confirmRes.text();
        let msg = confirmRes.statusText;
        try {
          const json = JSON.parse(text) as {
            error?: { message?: string };
            data?: { error?: { message?: string } };
          };
          msg = json?.error?.message ?? json?.data?.error?.message ?? msg;
        } catch {
          if (text) msg = text.slice(0, 200);
        }
        ui.toastError(msg || 'Failed to finalize work');
        return;
      }
      setDialogOpen(false);
      setRecentlySubmitted(true);
      revalidator.revalidate();
    } finally {
      setRunCheckLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setDialogOpen(false);
  };

  return (
    <MainWrapper>
      <PageFrame hasSecondaryNav={false} className="max-w-[1600px]">
        <div className="space-y-6">
          <div className="flex gap-4 justify-between items-center">
            <h1 className="text-2xl font-semibold">Integrity Checks</h1>
            <ui.Button onClick={() => setDialogOpen(true)}>Run Check</ui.Button>
          </div>

          <ui.Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
            <ui.DialogContent className="max-w-2xl">
              <div className="pb-2">
                <img src={proofigLogo} alt="Proofig" className="w-auto h-8" loading="lazy" />
              </div>
              <ui.DialogHeader>
                <div className="space-y-1">
                  <ui.DialogTitle>Start new check</ui.DialogTitle>
                  <ui.DialogDescription>
                    Set the article title, upload a single PDF (max 50MB), then run check to
                    finalize the work and start the Proofig check.
                  </ui.DialogDescription>
                </div>
              </ui.DialogHeader>
              <div className="space-y-4">
                {draftFetcher.state === 'submitting' || draftFetcher.state === 'loading' ? (
                  <p className="flex justify-between items-center gap-3 text-sm text-muted-foreground">
                    <span>Preparing upload…</span>
                    <LoadingSpinner
                      className="shrink-0 text-muted-foreground"
                      size={22}
                      thickness={3}
                    />
                  </p>
                ) : draftData && !draftData.success && draftData.error ? (
                  <ui.SimpleAlert type="error" message={draftData.error} />
                ) : draftReady && uploadActionUrl ? (
                  <>
                    <div>
                      <label htmlFor="manuscript-checks-title" className="text-sm font-medium">
                        Article title
                      </label>
                      <ui.Input
                        id="manuscript-checks-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={saveTitle}
                        placeholder="Enter the article title"
                        className="mt-1"
                      />
                      {titleFetcher.state !== 'idle' && (
                        <p className="mt-1 text-xs text-muted-foreground">Saving…</p>
                      )}
                    </div>
                    <WorkFileUpload
                      cdnKey={draftData.cdnKey!}
                      config={MANUSCRIPT_UPLOAD_CONFIG}
                      loadedFileMetadata={(draftData.metadata ?? null) as any}
                      action={uploadActionUrl}
                    />
                    <div className="flex gap-2 justify-end pt-2">
                      <ui.Button
                        type="button"
                        variant="outline"
                        onClick={() => setDialogOpen(false)}
                      >
                        Cancel
                      </ui.Button>
                      <ui.Button type="button" onClick={runCheck} disabled={runCheckLoading}>
                        {runCheckLoading ? 'Finalizing…' : 'Run check'}
                      </ui.Button>
                    </div>
                  </>
                ) : null}
              </div>
            </ui.DialogContent>
          </ui.Dialog>

          <div className="flex flex-col gap-4">
            {runs.length === 0 ? (
              <p className="text-muted-foreground">No check runs yet.</p>
            ) : (
              runs.map((run: CheckServiceRunWithVersion) => (
                <SimplifiedRunCard
                  key={run.id}
                  run={run}
                  remoteStatusActionPath={PROOFIG_CHECKS_ACTION_PATH}
                />
              ))
            )}
          </div>
        </div>
      </PageFrame>
    </MainWrapper>
  );
}
