## Why

The iroh-ts library has a working WASM build, TypeScript API, and passing tests — but no documentation or examples. Developers discovering the project have no README explaining what it does, how to install it, or how to use the API. Concrete examples (especially browser-based ones) are the fastest way to demonstrate value and make the library adoptable.

## What Changes

- Rewrite `README.md` with library overview, install instructions, API reference, and a minimal two-node example — structured for both human and LLM readability
- Create an `examples/` directory with a pnpm workspace containing two Cloudflare Workers browser apps:
  - **Chat room**: real-time peer-to-peer chat using iroh connections, joinable via URL query parameter
  - **Poker room**: multiplayer poker table using `poker-card-element` web components over iroh connections
- Add a `wrangler.toml` at the project root pointing to the examples workspace
- All examples deploy to Cloudflare Workers (browser WASM target)

## Capabilities

### New Capabilities
- `readme-docs`: Comprehensive README with install, API reference, and minimal usage example
- `chat-example`: Browser-based peer-to-peer chat room example deployed via Cloudflare Workers
- `poker-example`: Browser-based multiplayer poker room example using `poker-card-element` web components

### Modified Capabilities

## Impact

- **Files**: `README.md` (rewrite), new `examples/` directory, new `wrangler.toml`
- **Dependencies**: `poker-card-element` npm package in the poker example
- **Build**: Examples are standalone pnpm workspace projects with their own Wrangler configs
- **No changes** to the core library code, Rust crate, or existing tests
