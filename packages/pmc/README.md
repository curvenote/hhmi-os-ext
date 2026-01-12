# PMC Extension

An extension module for the HHMI Workspace that provides integration with PubMed Central (PMC) for deposit submissions, metadata management, and workflow automation.

## Purpose

The PMC Extension streamlines the process of submitting research publications to PubMed Central, which is required for NIH-funded research and supports broader open access goals. It automates metadata collection, validation, and submission workflows to reduce administrative burden on researchers and institutions.

## Overview

The PMC Extension provides comprehensive PMC integration capabilities:

- **Deposit Workflows**: Guided workflows for submitting manuscripts and associated files to PMC
- **Metadata Management**: Tools for collecting, validating, and managing publication metadata required for PMC submissions
- **Journal Search**: Integration with NIH journal databases to identify appropriate journals and validate submission requirements
- **Email Processing**: Automated processing of email-based submissions and notifications from PMC
- **Workflow Tracking**: Visual status tracking for submissions through the PMC review and deposit process

The extension integrates with Google Cloud Pub/Sub for asynchronous processing, Airtable for data management, and provides a user-friendly interface for managing the entire PMC submission lifecycle.

## Advantages

- **Streamlined Submissions**: Reduces the complexity and time required for PMC submissions through guided workflows
- **Automated Validation**: Validates metadata and file requirements before submission to reduce errors and rejections
- **Workflow Automation**: Automates repetitive tasks and provides status tracking throughout the submission process
- **Integration**: Works seamlessly with the Compliance Extension to provide an entry point to PMC deposits when recommended by the Compliance Wizard
- **Email Integration**: Processes PMC notifications and submission requests automatically via email

## Use Cases

- **NIH Compliance**: Submit NIH-funded research to PMC to meet public access policy requirements
- **Open Access Deposits**: Deposit publications to PMC as part of open access compliance strategies
- **Institutional Workflows**: Support institutional processes for managing PMC submissions across multiple researchers
- **Metadata Management**: Collect and validate publication metadata in a centralized system

## Related

- [HHMI Workspace README](../../README.md) - Overview of the complete workspace
- [Compliance Extension](../compliance/README.md) - Compliance tracking and reporting tools
