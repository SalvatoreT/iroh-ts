## ADDED Requirements

### Requirement: pnpm project configuration
The system SHALL use pnpm as the package manager with a properly configured `package.json` including build scripts, dependencies, and metadata.

#### Scenario: Install dependencies
- **WHEN** `pnpm install` is run in the project root
- **THEN** all JavaScript/TypeScript dependencies are installed successfully

### Requirement: Build scripts
The system SHALL provide the following pnpm scripts: `build` (wasm-pack + TypeScript compilation), `build:wasm` (WASM compilation only), `build:ts` (TypeScript wrapper compilation), and `test`.

#### Scenario: Full build
- **WHEN** `pnpm build` is run
- **THEN** the WASM module is compiled, TypeScript wrappers are compiled, and all outputs are ready for use

#### Scenario: Run tests
- **WHEN** `pnpm test` is run
- **THEN** the test suite executes using the compiled WASM module and reports results

### Requirement: Package exports
The system SHALL configure `package.json` `exports` with conditions for `node` (wasm-pack nodejs target) and `default`/`browser` (wasm-pack bundler target).

#### Scenario: Node.js import
- **WHEN** a Node.js project imports `"iroh"`
- **THEN** the Node.js wasm-pack glue entry point is resolved

#### Scenario: Browser import
- **WHEN** a browser bundler imports `"iroh"`
- **THEN** the bundler wasm-pack glue entry point is resolved

### Requirement: TypeScript configuration
The system SHALL include a `tsconfig.json` configured for ES2022 target, ESM module output, strict mode, and declaration file generation.

#### Scenario: TypeScript compilation
- **WHEN** `pnpm build:ts` is run
- **THEN** TypeScript files in `ts/` are compiled to JavaScript in `dist/` with `.d.ts` declaration files
