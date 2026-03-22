## 1. Project Scaffolding

- [x] 1.1 Initialize pnpm project with `package.json` (name, version, description, license, exports, scripts)
- [x] 1.2 Create `tsconfig.json` targeting ES2022, ESM output, strict mode, declaration generation
- [x] 1.3 Scaffold the Rust crate in `crate/` with `Cargo.toml` depending on `iroh`, `wasm-bindgen`, `wasm-bindgen-futures`, and `js-sys`
- [x] 1.4 Create `crate/src/lib.rs` entry point with `wasm-bindgen` setup
- [x] 1.5 Install TypeScript, `vitest`, and other dev dependencies via pnpm
- [x] 1.6 Add `pnpm build:wasm` script invoking `wasm-pack build` for nodejs and bundler targets

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

- [x] 4.1 Add `iroh-blobs` dependency and implement `BlobStore` with in-memory store
- [x] 4.2 Implement `addBytes(data)`, `getBytes(hash)`, `has(hash)` on `BlobStore`
- [x] 4.3 Implement `list()` on `BlobStore`
- [x] 4.4 Add blob exports to `crate/src/lib.rs` and `ts/index.ts`

## 5. WASM Bindings — Documents

- [x] 5.1 Add `iroh-docs` and `iroh-gossip` dependencies; implement `DocEngine` wrapping Endpoint + Gossip + BlobStore + Engine + Router
- [x] 5.2 Implement `createDoc()`, `authorDefault()`, `authorCreate()` on `DocEngine`
- [x] 5.3 Implement `setBytes(author, key, value)`, `getExact(author, key)`, `del(author, prefix)`, `close()` on `Doc`
- [x] 5.4 Add document exports to `crate/src/lib.rs` and TypeScript entry points

## 6. TypeScript Wrapper Layer

- [x] 6.1 Create `ts/node.ts` re-exporting from nodejs wasm-pack target
- [x] 6.2 Create `ts/browser.ts` re-exporting from bundler wasm-pack target

## 7. Build & Package Configuration

- [x] 7.1 Configure `pnpm build` to run wasm-pack build (both targets) + TypeScript compilation
- [x] 7.2 Configure `pnpm build:ts` to compile TypeScript wrappers to `dist/`
- [x] 7.3 Configure `package.json` conditional exports (`node` → nodejs target, `browser`/`default` → bundler target)
- [x] 7.4 wasm-opt is run automatically by wasm-pack in release mode

## 8. Testing

- [x] 8.1 Write integration tests for endpoint creation, identity access, address info, and shutdown
- [x] 8.2 Write integration tests for peer-to-peer connections and bidirectional streaming
- [x] 8.3 Write integration tests for blob add, read, has, and list operations
- [x] 8.4 Write integration tests for document create, set/get, del operations
- [x] 8.5 Configure `pnpm test` to run vitest with the compiled WASM module
