// Email type system
export { pmcEmailProcessorRegistry, EmailProcessorRegistry } from './types.server.js';
export type {
  InboundEmailHandler,
  EmailValidationResult,
  ProcessingResult,
  EmailProcessorConfig,
} from './types.server.js';

// Bulk submission specific types and parsing
export type { ParsedEmailResult, PackageResult } from './handlers/bulk-submission-parser.server.js';
export {
  parseEmailContent,
  extractPackageId,
  determineMessageType,
  extractMessage,
  isDirectSubmissionOnlyError,
} from './handlers/bulk-submission-parser.server.js';

// Shared email parsing utilities
export { extractManuscriptId } from './handlers/email-parsing-utils.server.js';

// Registry management
export {
  initializeEmailProcessorRegistry,
  getDefaultEmailProcessorConfigs,
  getEmailProcessorConfig,
} from './registry.server.js';

// Email handlers
export { bulkSubmissionHandler, bulkSubmissionConfig } from './handlers/bulk-submission.server.js';
export {
  nihmsFilesRequestHandler,
  nihmsFilesRequestConfig,
} from './handlers/nihms-files-request.server.js';

// Email validation functions (legacy)
export {
  validateEmail,
  validateEmailSender,
  validateEmailSubject,
  validateDKIM,
} from './email-validation.server.js';

// Database operations
export {
  createMessageRecord,
  updateMessageStatus,
  updateSubmissionVersionMetadata,
} from './email-db.server.js';

// Main processing function
export { processInboundEmail } from './email-processor.server.js';
