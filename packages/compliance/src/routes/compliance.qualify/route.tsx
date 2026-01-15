import { withAppContext, withValidFormData } from '@curvenote/scms-server';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';
import type { ComplianceUserMetadataSection } from '../../backend/types.js';
import { PageFrame } from '@curvenote/scms-core';
import { User, Users } from 'lucide-react';
import { updateUserComplianceMetadata } from '../../backend/actionHelpers.server.js';
import { HHMITrackEvent } from '../../analytics/events.js';
import { z } from 'zod';
import { zfd } from 'zod-form-data';
import { RoleSelectionCard } from './RoleSelectionCard.js';
import { userHasScopes } from '@curvenote/scms-server';
import { hhmi } from '../../backend/scopes.js';

export async function loader(args: LoaderFunctionArgs) {
  const ctx = await withAppContext(args);
  const userData = (ctx.user.data as ComplianceUserMetadataSection) || { compliance: {} };
  const role = userData.compliance?.role;

  // If role is already set, redirect to appropriate page
  if (role === 'scientist') {
    throw redirect('/app/compliance/reports/me');
  }
  if (role === 'lab-manager') {
    if (userHasScopes(ctx.user, [hhmi.compliance.admin])) {
      throw redirect('/app/compliance/scientists');
    }
    throw redirect('/app/compliance/shared');
  }

  return {};
}

/**
 * Schema for role selection
 */
const RoleSelectionSchema = zfd.formData({
  role: z.enum(['scientist', 'lab-manager']),
});

export async function action(args: ActionFunctionArgs) {
  const ctx = await withAppContext(args);
  const formData = await args.request.formData();

  return withValidFormData(
    RoleSelectionSchema,
    formData,
    async (payload: z.infer<typeof RoleSelectionSchema>) => {
      await updateUserComplianceMetadata(ctx.user.id, { role: payload.role });

      // Track role qualification
      await ctx.trackEvent(HHMITrackEvent.HHMI_COMPLIANCE_ROLE_QUALIFIED, {
        role: payload.role,
        userId: ctx.user.id,
        autoSet: false,
      });

      // Redirect based on role
      if (payload.role === 'scientist') {
        return redirect('/app/compliance/reports/me');
      } else {
        if (userHasScopes(ctx.user, [hhmi.compliance.admin])) {
          return redirect('/app/compliance/scientists');
        }
        return redirect('/app/compliance/shared');
      }
    },
  );
}

export default function QualifyUserPage() {
  const breadcrumbs = [
    { label: 'Compliance', href: '/app/compliance' },
    { label: 'Confirm your role', isCurrentPage: true },
  ];

  return (
    <PageFrame
      title="Welcome to HHMI Compliance Dashboards"
      className="mx-auto max-w-screen-lg"
      description="Before we begin, let's confirm what you are here to do. Please choose the role that best describes how HHMI Compliance applies to you."
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-8">
        <div className="grid grid-cols-1 gap-6 mx-auto max-w-3xl md:grid-cols-2">
          <RoleSelectionCard
            role="scientist"
            title="View My Compliance Information"
            description="I am a Lab Head or HHMI Investigator. I want to view my own compliance information and/or give access to others."
            icon={User}
          />

          <RoleSelectionCard
            role="lab-manager"
            title="Manage Compliance for Others"
            description="I am a Lab Manager, a Lab Administrator or in a role where I want to help someone else with compliance."
            icon={Users}
          />
        </div>
      </div>
    </PageFrame>
  );
}
