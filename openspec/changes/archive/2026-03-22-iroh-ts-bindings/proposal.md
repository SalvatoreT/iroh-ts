## Why

Iroh is a powerful modular networking stack written in Rust that provides peer-to-peer connectivity, content-addressable data transfer, and relay-based NAT traversal. Currently, there is no first-class way for TypeScript/JavaScript developers to use Iroh in browser or Node.js projects. By compiling Iroh to WASM via `wasm-pack`, we unlock Iroh's networking primitives for the entire JS ecosystem with a single build target that works everywhere.

## What Changes

- Create a `wasm-pack`-based WASM module that wraps Iroh's Rust crate for both Node.js and browser environments
- Expose an idiomatic TypeScript API surface covering Iroh's core networking primitives (node identity, connections, document sync, blob transfer)
- Set up pnpm as the package manager with build scripts for WASM compilation and TypeScript generation
- Include TypeScript type definitions wrapping the `wasm-bindgen` generated bindings
- Publish as a single `iroh` npm package that works in both Node.js and browser environments

## Capabilities

### New Capabilities
- `node-identity`: Create and manage Iroh node identities (keypairs, node IDs, secret keys)
- `connections`: Establish peer-to-peer connections between nodes using QUIC, with relay fallback
- `blobs`: Transfer content-addressable blobs (binary large objects) between peers
- `documents`: Replicate and sync mutable key-value documents across peers
- `wasm-bindings`: wasm-pack/wasm-bindgen bridge layer that compiles Iroh Rust code to WASM for both Node.js and browser
- `package-config`: pnpm workspace, build scripts, conditional exports, and CI configuration

### Modified Capabilities
<!-- No existing capabilities to modify — this is a greenfield project. -->

## Impact

- **Dependencies**: Adds `iroh` Rust crate, `wasm-pack`, `wasm-bindgen`, and TypeScript build tooling
- **APIs**: Introduces a new public TypeScript API for Iroh networking primitives
- **Build system**: Requires Rust toolchain (stable) with `wasm32-unknown-unknown` target and pnpm; ships a prebuilt `.wasm` binary so consumers don't need Rust
- **Platforms**: Targets Node.js ≥18 and modern browsers (Chrome, Firefox, Safari) — single WASM binary works on all OS/arch combinations
