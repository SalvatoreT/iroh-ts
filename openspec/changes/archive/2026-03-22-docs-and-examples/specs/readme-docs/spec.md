## ADDED Requirements

### Requirement: README contains library overview
The README SHALL begin with a one-paragraph description of what iroh-ts is and what it enables (p2p networking in JS/TS via WASM).

#### Scenario: Developer reads the README
- **WHEN** a developer opens `README.md`
- **THEN** the first section explains that iroh-ts provides peer-to-peer connections, content-addressable blobs, and replicated documents compiled from Rust to WASM

### Requirement: README contains install instructions
The README SHALL include a section showing how to add iroh-ts as a dependency via pnpm/npm/yarn.

#### Scenario: Developer installs the package
- **WHEN** a developer reads the Install section
- **THEN** they see `pnpm add iroh` (and npm/yarn equivalents)

### Requirement: README contains API reference
The README SHALL list every exported class and its methods with type signatures and one-line descriptions. Methods SHALL be grouped by class.

#### Scenario: Developer looks up a method
- **WHEN** a developer searches for `openBi` in the README
- **THEN** they find it under the `Connection` class with its signature and a brief description

### Requirement: README contains minimal two-node example
The README SHALL include a complete, runnable code example showing two Endpoints connecting and exchanging a message via bidirectional streams.

#### Scenario: Developer copies the example
- **WHEN** a developer copies the two-node example code
- **THEN** the code runs without modification in a Node.js project with iroh-ts installed

### Requirement: README is LLM-readable
The README SHALL use structured markdown (headers, code blocks, tables) over prose paragraphs. Each API method SHALL have its TypeScript signature in a code block.

#### Scenario: LLM parses the README
- **WHEN** an LLM is given the README as context
- **THEN** it can correctly identify all exported classes, their methods, and parameter types
