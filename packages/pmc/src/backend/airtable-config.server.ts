import { getConfig, fetchRecordsByFieldValue } from '@curvenote/scms-server';

// ==============================
// PMC Airtable Configuration Types
// ==============================

interface PMCAirtableConfig {
  apiKey: string;
  baseId: string;
  tables: {
    pmcSubmissions: {
      id: string;
      fields: {
        nihmsId: string;
      };
    };
    scientists: {
      id: string;
      viewId?: string;
      fields: {
        grantId: string;
        orcid: string;
        fullName: string;
        firstNamePreferred: string;
        firstNamePrimary: string;
        lastNamePreferred: string;
        email: string;
      };
    };
  };
}

// ==============================
// Configuration Access
// ==============================

/**
 * Get the complete PMC Airtable configuration
 */
async function getPMCAirtableConfig(): Promise<PMCAirtableConfig> {
  const config = await getConfig();
  const airtableConfig = config.app.extensions?.['pmc']?.airtable;

  if (!airtableConfig) {
    throw new Error('PMC Airtable configuration is missing. Please update the app-config.');
  }

  if (!airtableConfig.apiKey) {
    throw new Error('PMC Airtable API key is missing. Please update the app-config.');
  }

  if (!airtableConfig.baseId) {
    throw new Error('PMC Airtable base ID is missing. Please update the app-config.');
  }

  if (!airtableConfig.tables?.pmcSubmissions?.id) {
    throw new Error(
      'PMC Airtable PMC submissions table ID is missing. Please update the app-config.',
    );
  }

  if (!airtableConfig.tables?.pmcSubmissions?.fields?.nihmsId) {
    throw new Error(
      'PMC Airtable PMC submissions NIHMSID field ID is missing. Please update the app-config.',
    );
  }

  if (!airtableConfig.tables?.scientists?.id) {
    throw new Error('PMC Airtable scientists table ID is missing. Please update the app-config.');
  }

  if (!airtableConfig.tables?.scientists?.fields?.grantId) {
    throw new Error(
      'PMC Airtable scientists grant ID field ID is missing. Please update the app-config.',
    );
  }

  if (!airtableConfig.tables?.scientists?.fields?.orcid) {
    throw new Error(
      'PMC Airtable scientists ORCID field ID is missing. Please update the app-config.',
    );
  }

  if (!airtableConfig.tables?.scientists?.fields?.fullName) {
    throw new Error(
      'PMC Airtable scientists full name field ID is missing. Please update the app-config.',
    );
  }

  if (!airtableConfig.tables?.scientists?.fields?.firstNamePreferred) {
    throw new Error(
      'PMC Airtable scientists first name (preferred) field ID is missing. Please update the app-config.',
    );
  }

  if (!airtableConfig.tables?.scientists?.fields?.firstNamePrimary) {
    throw new Error(
      'PMC Airtable scientists first name (primary) field ID is missing. Please update the app-config.',
    );
  }

  if (!airtableConfig.tables?.scientists?.fields?.lastNamePreferred) {
    throw new Error(
      'PMC Airtable scientists last name (preferred) field ID is missing. Please update the app-config.',
    );
  }

  if (!airtableConfig.tables?.scientists?.fields?.email) {
    throw new Error(
      'PMC Airtable scientists email field ID is missing. Please update the app-config.',
    );
  }

  return airtableConfig as PMCAirtableConfig;
}

// ==============================
// Individual Getters (Maintains API Compatibility)
// ==============================

export async function getAirtableApiKey(): Promise<string> {
  const config = await getPMCAirtableConfig();
  return config.apiKey;
}

export async function getAirtableBaseId(): Promise<string> {
  const config = await getPMCAirtableConfig();
  return config.baseId;
}

export async function getAirtablePmcSubmissionsTableId(): Promise<string> {
  const config = await getPMCAirtableConfig();
  return config.tables.pmcSubmissions.id;
}

export async function getAirtablePmcSubmissionsNihmsIdFieldId(): Promise<string> {
  const config = await getPMCAirtableConfig();
  return config.tables.pmcSubmissions.fields.nihmsId;
}

export async function getAirtableScientistsTableId(): Promise<string> {
  const config = await getPMCAirtableConfig();
  return config.tables.scientists.id;
}

export async function getAirtableScientistsGrantIdFieldId(): Promise<string> {
  const config = await getPMCAirtableConfig();
  return config.tables.scientists.fields.grantId;
}

export async function getAirtableScientistsOrcidFieldId(): Promise<string> {
  const config = await getPMCAirtableConfig();
  return config.tables.scientists.fields.orcid;
}

export async function getAirtableScientistsFullNameFieldId(): Promise<string> {
  const config = await getPMCAirtableConfig();
  return config.tables.scientists.fields.fullName;
}

export async function getAirtableScientistsFirstNamePreferredFieldId(): Promise<string> {
  const config = await getPMCAirtableConfig();
  return config.tables.scientists.fields.firstNamePreferred;
}

export async function getAirtableScientistsFirstNamePrimaryFieldId(): Promise<string> {
  const config = await getPMCAirtableConfig();
  return config.tables.scientists.fields.firstNamePrimary;
}

export async function getAirtableScientistsLastNamePreferredFieldId(): Promise<string> {
  const config = await getPMCAirtableConfig();
  return config.tables.scientists.fields.lastNamePreferred;
}

export async function getAirtableScientistsEmailFieldId(): Promise<string> {
  const config = await getPMCAirtableConfig();
  return config.tables.scientists.fields.email;
}

export async function getAirtableScientistsViewId(): Promise<string | undefined> {
  const config = await getPMCAirtableConfig();
  return config.tables.scientists.viewId;
}

// ==============================
// Legacy Functions (for backward compatibility during transition)
// ==============================

/**
 * @deprecated Use getAirtablePmcSubmissionsTableId() instead
 */
export async function getAirtableTableId(): Promise<string> {
  return getAirtablePmcSubmissionsTableId();
}

/**
 * @deprecated Use getAirtablePmcSubmissionsNihmsIdFieldId() instead
 */
export async function getAirtableFieldId(): Promise<string> {
  return getAirtablePmcSubmissionsNihmsIdFieldId();
}

// ==============================
// Data Fetching Functions
// ==============================

export async function fetchRecordsByManuscriptIds(manuscriptIds: string[]) {
  return fetchRecordsByFieldValue(manuscriptIds, {
    apiKey: await getAirtableApiKey(),
    baseId: await getAirtableBaseId(),
    tableId: await getAirtablePmcSubmissionsTableId(),
    fieldId: await getAirtablePmcSubmissionsNihmsIdFieldId(),
    fieldName: 'NIHMSID',
  });
}
