// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from 'vitest';
import { buildPmcDepositFormBreadcrumbs } from '../src/common/depositBreadcrumbs.js';

describe('buildPmcDepositFormBreadcrumbs', () => {
  it('uses Home breadcrumb for first deposit version', () => {
    expect(
      buildPmcDepositFormBreadcrumbs({
        workId: 'work-1',
        workTitle: 'Example manuscript',
        isNewVersion: false,
      }),
    ).toEqual([
      { label: 'Home', href: '/app/dashboard' },
      { label: 'Deposit Form', isCurrentPage: true },
    ]);
  });

  it('uses work hierarchy breadcrumb for new deposit versions', () => {
    expect(
      buildPmcDepositFormBreadcrumbs({
        workId: 'work-1',
        workTitle: 'Example manuscript',
        isNewVersion: true,
        parentSubmissionVersionId: 'submission-version-1',
      }),
    ).toEqual([
      { label: 'My Works', href: '/app/works' },
      { label: 'Example manuscript', href: '/app/works/work-1' },
      {
        label: 'PMC Deposit',
        href: '/app/works/work-1/site/pmc/submission/submission-version-1',
      },
      { label: 'New Deposit Form', isCurrentPage: true },
    ]);
  });

  it('truncates long work titles in new-version breadcrumbs', () => {
    const breadcrumbs = buildPmcDepositFormBreadcrumbs({
      workId: 'work-1',
      workTitle: 'A very long manuscript title that should be truncated for breadcrumbs',
      isNewVersion: true,
      parentSubmissionVersionId: 'submission-version-1',
    });

    expect(breadcrumbs[1]).toEqual({
      label: 'A very long manuscript title tha...',
      href: '/app/works/work-1',
    });
  });

  it('omits PMC Deposit crumb when no non-draft parent submission version exists', () => {
    expect(
      buildPmcDepositFormBreadcrumbs({
        workId: 'work-1',
        workTitle: 'Example manuscript',
        isNewVersion: true,
        parentSubmissionVersionId: null,
      }),
    ).toEqual([
      { label: 'My Works', href: '/app/works' },
      { label: 'Example manuscript', href: '/app/works/work-1' },
      { label: 'New Deposit Form', isCurrentPage: true },
    ]);
  });
});
