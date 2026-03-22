## 1. Project Scaffolding

- [x] 1.1 Initialize pnpm project with `package.json` (name, version, description, license, exports, scripts)
- [x] 1.2 Create `tsconfig.json` targeting ES2022, ESM output, strict mode, declaration generation
- [x] 1.3 Scaffold the Rust crate in `crate/` with `Cargo.toml` depending on `iroh`, `wasm-bindgen`, `wasm-bindgen-futures`, and `js-sys`
- [x] 1.4 Create `crate/src/lib.rs` entry point with `wasm-bindgen` setup
- [x] 1.5 Install TypeScript, `vitest`, and other dev dependencies via pnpm
- [x] 1.6 Add `pnpm build:wasm` script invoking `wasm-pack build` for nodejs target

## 2. WASM Bindings — Endpoint Identity

- [x] 2.1 Implement `Endpoint` struct with `create()`, `endpointId()`, `endpointAddr()`, `close()`, `online()`
- [x] 2.2 Implement `EndpointAddr` struct with `fromEndpointId()`, `endpointId()`, `relayUrl()`
- [x] 2.3 Wire up modules in `crate/src/lib.rs`

## 3. WASM Bindings — Connections

- [x] 3.1 Implement `connect(addr, alpn)` on `Endpoint` returning a `Connection` wrapper
- [x] 3.2 Implement `accept()` on `Endpoint` and `setAlpns()` for incoming connections
- [x] 3.3 Implement `Connection` with `openBi()`, `acceptBi()`, `openUni()`, `acceptUni()`, datagrams, `close()`
- [x] 3.4 Implement `BiStream`, `SendStream`, `RecvStream` with read/write/finish methods

## 4. WASM Bindings — Blobs

- [ ] 4.1 Add `iroh-blobs` dependency and implement blob client accessor
- [ ] 4.2 Implement `addBytes(data)`, `readToBytes(hash)` on `BlobClient`
- [ ] 4.3 Implement `download(hash, nodeAddr)` and `list()` on `BlobClient`
- [ ] 4.4 Add blob exports to `crate/src/lib.rs`

## 5. WASM Bindings — Documents

- [ ] 5.1 Add `iroh-docs` dependency and implement docs client accessor
- [ ] 5.2 Implement `create()` and `join(ticket)` on `DocClient` returning a `Doc` wrapper
- [ ] 5.3 Implement `set(key, value)`, `get(key)`, `entries()`, `share(mode)` on `Doc`
- [ ] 5.4 Add document exports to `crate/src/lib.rs`

## 6. TypeScript Wrapper Layer

- [x] 6.1 Create `ts/index.ts` re-exporting the public API surface from WASM bindings

## 7. Build & Package Configuration

- [x] 7.1 Configure `pnpm build` to run wasm-pack build + TypeScript compilation
- [x] 7.2 Configure `pnpm build:ts` to compile TypeScript wrappers to `dist/`
- [x] 7.3 Configure `package.json` exports
- [x] 7.4 wasm-opt is run automatically by wasm-pack in release mode

## 8. Testing

- [x] 8.1 Write integration tests for endpoint creation, identity access, address info, and shutdown
- [x] 8.2 Write integration tests for peer-to-peer connections and bidirectional streaming
- [ ] 8.3 Write integration tests for blob add, read, download, and list operations
- [ ] 8.4 Write integration tests for document create, set/get, join, entries, and share
- [x] 8.5 Configure `pnpm test` to run vitest with the compiled WASM module
