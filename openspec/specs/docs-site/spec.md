## ADDED Requirements

### Requirement: Docs site has a landing page
The docs site SHALL have an `index.html` at the root with a project overview, install instructions, and navigation to API reference and live examples.

#### Scenario: Developer visits the docs site
- **WHEN** a developer opens `https://salvatoret.github.io/iroh-ts/`
- **THEN** they see the project name, description, install command, and links to examples

### Requirement: Docs site links to live examples
The landing page SHALL include links to the hosted chat and poker examples.

#### Scenario: Developer clicks an example link
- **WHEN** a developer clicks the "Chat" link on the docs site
- **THEN** they are navigated to `/iroh-ts/chat/` which loads the live chat example

### Requirement: Docs site includes API reference
The docs site SHALL include the API reference content (classes, methods, signatures) from the README.

#### Scenario: Developer reads API docs
- **WHEN** a developer navigates to the API section of the docs site
- **THEN** they see all exported classes with method signatures and descriptions
