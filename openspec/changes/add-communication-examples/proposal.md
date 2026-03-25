## Why

The existing iroh-ts examples (chat, poker) are both browser-to-browser apps deployed to Cloudflare Workers. There's no example showing server-to-browser communication (Node.js backend + browser frontend), and no way to try the library without deploying to a cloud platform. Developers want to run `npx` and see iroh working locally in seconds.

## What Changes

- Create an `examples/echo-server/` example: a Node.js CLI server that accepts browser connections, echoes messages back, and demonstrates server-to-browser communication over iroh
- Create an `examples/p2p-chat/` example: a minimal browser-to-browser chat that runs locally via Vite dev server (no Cloudflare dependency)
- Add a `bin/` entry point so the echo server demo can be run via `npx @salvatoret/iroh-demo` or `pnpm --filter iroh-echo-server start`
- Add a root-level npm script `pnpm demo` to quickly launch the server demo

## Capabilities

### New Capabilities
- `echo-server`: Node.js CLI server using iroh's Node.js target — accepts connections from browser clients, echoes messages back with timestamp. Runnable via `npx` or `node`.
- `p2p-browser-chat`: Standalone browser-to-browser chat using Vite dev server locally. No Cloudflare dependency — just `pnpm dev` and open two tabs.

### Modified Capabilities
- Root `package.json`: adds `demo` script for quick launch

## Impact

- **Files**: new `examples/echo-server/` and `examples/p2p-chat/` directories
- **Dependencies**: minimal — the echo server uses only `@salvatoret/iroh` (Node.js target); the p2p chat reuses the same Vite+WASM setup as existing examples
- **Build**: Examples are standalone workspace projects; no changes to core library build
- **No changes** to the core library code, Rust crate, or existing tests
