import type { ui } from '@curvenote/scms-core';

export function truncateWorkTitle(title?: string | null): string {
  if (!title) return 'Untitled Work';
  return title.length > 32 ? `${title.substring(0, 32)}...` : title;
}

export function buildPmcDepositFormBreadcrumbs(args: {
  workId: string;
  workTitle?: string | null;
  isNewVersion: boolean;
  parentSubmissionVersionId?: string | null;
  currentPageLabel?: string;
  newVersionCurrentPageLabel?: string;
}): ui.BreadcrumbItemConfig[] {
  const currentPageLabel = args.currentPageLabel ?? 'Deposit Form';

  if (!args.isNewVersion) {
    return [
      { label: 'Home', href: '/app/dashboard' },
      { label: currentPageLabel, isCurrentPage: true },
    ];
  }

  const breadcrumbs: ui.BreadcrumbItemConfig[] = [
    { label: 'My Works', href: '/app/works' },
    { label: truncateWorkTitle(args.workTitle), href: `/app/works/${args.workId}` },
  ];

  if (args.parentSubmissionVersionId) {
    breadcrumbs.push({
      label: 'PMC Deposit',
      href: `/app/works/${args.workId}/site/pmc/submission/${args.parentSubmissionVersionId}`,
    });
  }

  breadcrumbs.push({
    label: args.newVersionCurrentPageLabel ?? 'New Deposit Form',
    isCurrentPage: true,
  });
  return breadcrumbs;
}
