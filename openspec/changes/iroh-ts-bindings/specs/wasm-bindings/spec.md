## ADDED Requirements

### Requirement: wasm-bindgen Rust crate structure
The system SHALL include a Rust crate in `crate/` with `wasm-bindgen` annotations that compile to a WASM module usable in both Node.js and browser environments.

#### Scenario: Successful WASM build
- **WHEN** `pnpm build:wasm` is run on a system with Rust toolchain and `wasm-pack` installed
- **THEN** a `.wasm` binary and JS/TS glue code are produced in the build output directory

### Requirement: TypeScript type definitions
The system SHALL generate TypeScript type definition files from the `wasm-bindgen` annotations during the build process.

#### Scenario: Type definitions generated
- **WHEN** the WASM build completes
- **THEN** TypeScript definition files are produced that export types for all `#[wasm_bindgen]` annotated structs and functions

### Requirement: Node.js and browser targets
The system SHALL support building for both Node.js (`--target nodejs`) and bundler (`--target bundler`) targets via `wasm-pack`.

#### Scenario: Node.js target build
- **WHEN** `wasm-pack build --target nodejs` is run
- **THEN** CommonJS glue code is generated that loads the WASM module using Node.js APIs

#### Scenario: Bundler target build
- **WHEN** `wasm-pack build --target bundler` is run
- **THEN** ESM glue code is generated that integrates with bundlers (webpack, vite, esbuild)

### Requirement: Unified API across environments
The system SHALL expose the same TypeScript API in both Node.js and browser environments, with environment-specific features throwing descriptive errors when unavailable.

#### Scenario: Node-only feature in browser
- **WHEN** `node.blobs().addFromPath(filePath)` is called in a browser environment
- **THEN** a descriptive error is thrown indicating this feature is only available in Node.js
