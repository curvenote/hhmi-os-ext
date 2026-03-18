import { useFetcher } from 'react-router';
import { primitives, ui, cn, InviteUserDialog, useDeploymentConfig } from '@curvenote/scms-core';
import { useRef, useState, useCallback, useEffect } from 'react';
import type { GeneralError } from '@curvenote/scms-core';

interface RequestDashboardFormProps {
  actionUrl?: string;
  compact?: boolean;
  onSuccess?: () => void;
  description?: string;
}

export function RequestDashboardForm({
  actionUrl,
  compact = false,
  onSuccess,
  description,
}: RequestDashboardFormProps = {}) {
  const form = useRef<HTMLFormElement>(null);
  const fetcher = useFetcher<{
    success?: boolean;
    error?: GeneralError | string;
  }>();
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const config = useDeploymentConfig();
  const platformName = config.branding?.title || config.name || 'the workspace';

  // Handle toast notifications
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      if (fetcher.data.error) {
        // Handle error with toaster
        let errorMessage: string;
        if (typeof fetcher.data.error === 'string') {
          errorMessage = fetcher.data.error;
        } else if (
          fetcher.data.error &&
          typeof fetcher.data.error === 'object' &&
          'message' in fetcher.data.error
        ) {
          errorMessage = fetcher.data.error.message;
        } else {
          errorMessage = 'An unknown error occurred';
        }
        ui.toastError(errorMessage);
      } else if (fetcher.data.success) {
        // Handle success case
        ui.toastSuccess(
          'Request sent successfully. The user will receive an email with instructions on how to share their compliance dashboard.',
        );
        // Reset form on success
        setSelectedUser('');
        form.current?.reset();
        // Call onSuccess callback if provided
        onSuccess?.();
      }
    }
  }, [fetcher.state, fetcher.data, onSuccess]);

  // Search function for AsyncComboBox using plain fetch
  const searchUsers = useCallback(async (query: string): Promise<ui.ComboBoxOption[]> => {
    if (query.length < 3) {
      return [];
    }

    try {
      const formData = new FormData();
      formData.append('query', query);

      const response = await fetch('/app/search/users', {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        console.error('Search request failed:', response.status, response.statusText);
        return [];
      }

      const data = await response.json();

      if (data.error) {
        console.error('User search failed:', data.error.message);
        return [];
      }

      if (data.searchResults && Array.isArray(data.searchResults)) {
        return data.searchResults.map((user: any) => ({
          value: user.id,
          label: user.display_name || 'Unknown User',
          description: user.email,
          metadata: {
            email: user.email,
            date_created: user.date_created,
          },
        }));
      }

      return [];
    } catch (error) {
      console.error('User search failed:', error);
      return [];
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      ui.toastError('Please select a user');
      return;
    }

    const formData = new FormData();
    formData.append('intent', 'request-dashboard');
    formData.append('recipientUserId', selectedUser);

    fetcher.submit(formData, { method: 'POST', ...(actionUrl ? { action: actionUrl } : {}) });
  };

  const defaultDescription =
    description ||
    'Search and select a user to request access to their compliance dashboard. They will receive an email with a link to share their dashboard with you.';

  const emptyMessage = (
    <div className="flex flex-col gap-2 items-center py-2">
      <span>No users found.</span>
      <ui.Button
        variant="link"
        size="sm"
        onClick={() => setInviteDialogOpen(true)}
        className="p-0 h-auto"
      >
        Invite Someone
      </ui.Button>
    </div>
  );

  return (
    <>
      <primitives.Card className={cn(compact ? 'p-4 pb-2' : 'p-6 pb-4', !compact && 'max-w-2xl')}>
        <form
          ref={form}
          className={cn('flex flex-col', compact ? 'gap-3' : 'gap-4')}
          onSubmit={handleSubmit}
        >
          <div className="flex gap-2 items-center">
            <h3 className={cn('font-medium', compact ? 'text-sm' : 'text-md')}>
              Request Access to a Dashboard
            </h3>
          </div>

          {/* Single row layout on md+ breakpoints */}
          <div
            className={cn('flex flex-col', compact ? 'gap-3' : 'gap-4', 'md:flex-row md:items-end')}
          >
            <div className="flex-1">
              <label
                className={cn(
                  'block mb-1 font-medium text-gray-700 dark:text-gray-300',
                  compact ? 'text-xs' : 'text-sm',
                )}
              >
                Search (by name or email)
              </label>
              <ui.AsyncComboBox
                boxed
                value={selectedUser}
                onValueChange={setSelectedUser}
                onSearch={searchUsers}
                placeholder="Select a user..."
                searchPlaceholder="Search users by name or email..."
                emptyMessage={emptyMessage}
                loadingMessage="Searching users..."
                minSearchLength={3}
                disabled={fetcher.state !== 'idle'}
              />
            </div>

            <div className="flex-none">
              <ui.StatefulButton
                type="submit"
                overlayBusy
                busy={fetcher.state !== 'idle'}
                disabled={fetcher.state !== 'idle' || !selectedUser}
              >
                Send Request
              </ui.StatefulButton>
            </div>
          </div>

          {!compact && <p className="text-sm text-muted-foreground">{defaultDescription}</p>}

          {/* Invite button at bottom-right */}
          <div className="flex justify-end">
            <ui.Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setInviteDialogOpen(true)}
              className="text-sm"
            >
              Invite someone to {platformName}
            </ui.Button>
          </div>
        </form>
      </primitives.Card>

      <InviteUserDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        actionUrl={actionUrl}
        platformName={platformName}
        title={`Invite Someone to ${platformName}`}
        description="Send an invitation email to someone who should join the workspace. Once they join, you can request access to their compliance dashboard."
        successMessage="Invitation sent successfully. They will receive an email with instructions to join."
      />
    </>
  );
}
