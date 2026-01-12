# HHMI Workspace

A Research Communication Workspace built on Curvenote SCMS, providing integrated tools and services for the HHMI Research Community.

## What is HHMI Workspace?

The HHMI Workspace is a customized deployment of the Curvenote Scientific Content Management System (SCMS), designed to help researchers navigate compliance with publishing policies and strengthen the integrity of their work. It provides an integrated platform for compliance support and research communication, combining modular extension modules that work together to deliver a complete workspace solution.

## Extension Modules

The workspace is built from extension modules that provide specialized functionality. Each module can be configured independently and works seamlessly with the others to deliver a complete solution.

### Compliance Extension

The Compliance Extension provides tools and workflows for managing open science compliance requirements. It helps researchers and institutions navigate  open access policy requirements primarily from HHMI but also where applicable, NIH.

See [@hhmi/compliance/README.md](packages/compliance/README.md) for details.

### PMC Extension

The PMC Extension streamlines the process of submitting research publications to PubMed Central, which is required for NIH-funded research and supports broader open access goals.

See [@hhmi/pmc](packages/pmc/README.md) for details.

Additional extension modules will be added in the future to expand the workspace's capabilities.

## Open Source

This repository is open source, permissively licensed under the MIT License. The open source nature of the HHMI Workspace provides several key benefits:

- **Transparency**: Full visibility into how the workspace operates and processes data
- **Extensibility**: The modular architecture allows institutions to customize and extend functionality to meet their specific needs
- **Community**: Open source enables collaboration, contributions, and shared improvements across the research community
- **Independence**: Institutions can deploy, maintain, and modify the extension modules freely

Both the HHMI Workspace and the underlying [Curvenote SCMS Core Platform](https://github.com/curvenote/curvenote) are open source, ensuring complete transparency and freedom to use the infrastructure.

## Built on Curvenote SCMS

The HHMI Workspace is built on [Curvenote SCMS](https://github.com/curvenote/curvenote), an open source Scientific Content Management System. Curvenote SCMS provides the core platform for organizing, accessing, and publishing scientific content, with a modular extension system that allows for specialized functionality to be added as needed.

## Architecture

The HHMI Workspace is implemented as a collection of extension modules. Each extension module provides specific functionality and can be configured independently.

The platform's extensible architecture allows institutions to customize and extend the workspace to meet their specific needs. Extension modules can:

- Register new routes and navigation items
- Add custom workflows and task cards
- Integrate with external services and APIs
- Define custom data models and database schemas
- Provide specialized UI components and interfaces

To add additional extensions, developers can create new extension modules following the same structure as the existing compliance and PMC extensions. Each extension module is a self-contained package that exports an extension configuration, which the Curvenote SCMS platform loads at runtime. Extensions can be developed independently and are integrated into the workspace through configuration.

## Branding

The `branding/` folder contains HHMI-specific branding assets and configuration. **This folder is excluded from the MIT license** and contains materials copyrighted by HHMI. Please refer to HHMI for terms of use regarding any assets or information in the branding folder.

## License

The code in this repository is licensed under the MIT License. See [LICENSE](LICENSE) for details.

**Note**: The `branding/` folder is excluded from the MIT license and contains HHMI copyright materials. See the [Branding](#branding) section above for more information.
