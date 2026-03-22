## Context

This is a greenfield project. The iroh-ts repository currently contains only project scaffolding (README, LICENSE, .gitignore) and OpenSpec/Claude configuration. There is no source code, no package.json, and no Cargo.toml.

Iroh is a Rust networking library providing peer-to-peer connectivity over QUIC with relay-based NAT traversal, content-addressable blob transfer, and replicated document sync. We need to bridge this into the TypeScript ecosystem for both Node.js and browser runtimes.

**Constraints:**
- Must use pnpm as the package manager
- Must support Node.js (≥18) and modern browsers
- Must provide idiomatic TypeScript APIs, not raw FFI calls
- Iroh's Rust API is the source of truth for capabilities

## Goals / Non-Goals

**Goals:**
- Compile Iroh to WASM via `wasm-pack` for use in both Node.js and browser
- Expose a clean, idiomatic TypeScript API surface with full type definitions
- Single npm package that works everywhere — no platform-specific builds
- pnpm-based build system with simple scripts

**Non-Goals:**
- Native (non-WASM) bindings via NAPI-RS — may be added later if perf demands it
- Custom protocol implementations beyond what Iroh provides out of the box
- GUI or CLI tools — this is a library only
- Mobile platform support (React Native, Capacitor) — future work
- Streaming/real-time document sync UI — consumers build their own
- Supporting Node.js < 18

## Decisions

### 1. Use wasm-pack for all targets

**Choice:** `wasm-pack` + `wasm-bindgen` for both Node.js and browser, instead of NAPI-RS for Node.js.

**Rationale:**
- Single build target eliminates cross-platform prebuilt binary distribution (the hardest part of native addons)
- One WASM binary works on every OS and architecture — no CI matrix for macOS/Linux/Windows × x86_64/aarch64
- One Rust binding layer to maintain instead of two (NAPI + WASM)
- For a networking library, the bottleneck is I/O, not CPU — WASM overhead is negligible
- Iroh already has WASM support via feature flags
- Dramatically simpler build and publish workflow

**Alternatives considered:**
- NAPI-RS for Node.js + wasm-pack for browser: better raw performance in Node.js but doubles the binding surface area and requires platform-specific binary distribution. Can be added later if profiling shows WASM is a bottleneck.
- `neon`: similar to NAPI-RS drawbacks, less mature ecosystem

**Build targets:**
- `wasm-pack build --target nodejs` for Node.js (generates CommonJS glue)
- `wasm-pack build --target bundler` for browser (generates ESM glue for webpack/vite/esbuild)

### 2. Single package, single entry point

**Choice:** Ship one `iroh` npm package. Use `package.json` `exports` to select the right glue code (Node.js vs bundler), but both load the same `.wasm` binary.

**Rationale:**
- Simpler for consumers — one `npm install iroh`
- The WASM binary is identical; only the JS glue for loading it differs
- No conditional native/WASM selection logic needed

### 3. Wrapper classes over raw bindings

**Choice:** Create TypeScript wrapper classes (`IrohNode`, `Connection`, `BlobClient`, `DocClient`) that wrap the raw `wasm-bindgen` exports.

**Rationale:**
- Raw wasm-bindgen exports use Rust naming conventions and return opaque handles
- Wrapper layer provides idiomatic async/await, proper TypeScript types, and error handling
- Allows the public API to remain stable even if the Rust binding layer changes

### 4. Project structure

```
iroh-ts/
├── package.json            # pnpm config, scripts, exports
├── pnpm-lock.yaml
├── tsconfig.json
├── crate/
│   ├── Cargo.toml          # Rust crate for wasm-bindgen
│   └── src/
│       ├── lib.rs           # wasm-bindgen entry point
│       ├── node.rs          # Iroh node bindings
│       ├── connection.rs    # Connection bindings
│       ├── blob.rs          # Blob transfer bindings
│       └── document.rs      # Document sync bindings
├── ts/
│   ├── index.ts            # Main entry point, re-exports
│   ├── node.ts             # IrohNode wrapper class
│   ├── connection.ts       # Connection wrapper
│   ├── blob.ts             # BlobClient wrapper
│   ├── document.ts         # DocClient wrapper
│   └── types.ts            # Shared TypeScript types
├── __test__/
│   └── index.spec.ts       # Integration tests
└── dist/                   # Build output (wasm + compiled TS)
```

## Risks / Trade-offs

- **[WASM performance ceiling]** → WASM has overhead vs native for CPU-bound work (memory copies, no direct syscalls). Mitigation: Networking is I/O-bound; WASM overhead is negligible. If profiling shows issues, NAPI-RS can be added as an optional native path later.

- **[Iroh WASM maturity]** → Iroh's WASM support may not cover all features (e.g., direct QUIC connections require raw UDP sockets). Mitigation: Use relay-based connections. Document any feature gaps clearly.

- **[WASM binary size]** → The `.wasm` file may be large depending on how much of Iroh is compiled in. Mitigation: Use `wasm-opt` for size optimization, enable LTO, and consider feature flags to exclude unused Iroh subsystems.

- **[API surface size]** → Iroh has a large API. Wrapping everything is impractical for v1. Mitigation: Start with core primitives (node, connections, blobs, documents) and expand based on demand.

- **[Version coupling]** → Binding to a specific Iroh crate version creates upgrade burden. Mitigation: Pin to a stable Iroh release, document the version mapping, and keep the wrapper layer thin.
