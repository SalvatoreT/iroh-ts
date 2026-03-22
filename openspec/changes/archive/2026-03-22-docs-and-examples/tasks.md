## 1. README

- [x] 1.1 Write library overview section (what iroh-ts is, what it enables)
- [x] 1.2 Write install section (pnpm/npm/yarn)
- [x] 1.3 Write API reference section with every exported class and method (Endpoint, EndpointAddr, Connection, BiStream, SendStream, RecvStream, BlobStore, DocEngine, Doc)
- [x] 1.4 Write minimal two-node example (create two endpoints, connect, exchange a message)
- [x] 1.5 Write build-from-source section (Rust toolchain, wasm-pack, LLVM requirements)

## 2. Examples Workspace Setup

- [x] 2.1 Create `examples/chat/package.json` with iroh dependency, vite, and wrangler
- [x] 2.2 Create `examples/chat/vite.config.ts` configured for WASM bundler target
- [x] 2.3 Create `examples/chat/wrangler.toml` for Cloudflare Workers static site deployment
- [x] 2.4 Create `examples/poker/package.json` with iroh, vite, wrangler, and `poker-card-element` dependencies
- [x] 2.5 Create `examples/poker/vite.config.ts` configured for WASM bundler target
- [x] 2.6 Create `examples/poker/wrangler.toml` for Cloudflare Workers static site deployment
- [x] 2.7 Create root `wrangler.toml` pointing to examples
- [x] 2.8 Add `examples/` to `pnpm-workspace.yaml`

## 3. Chat Example

- [x] 3.1 Create `examples/chat/index.html` with chat UI (message list, input field, join URL display)
- [x] 3.2 Create `examples/chat/src/main.ts` — Endpoint creation, online wait, join URL generation
- [x] 3.3 Implement host mode: accept connections, relay messages to all connected peers
- [x] 3.4 Implement join mode: parse `?ticket=` query param, connect to host, send/receive messages
- [x] 3.5 Wire up UI: message display, input handling, connection status

## 4. Poker Example

- [x] 4.1 Create `examples/poker/index.html` with poker table UI (cards area, action buttons, player list)
- [x] 4.2 Create `examples/poker/src/protocol.ts` — message types for game actions and state sync
- [x] 4.3 Create `examples/poker/src/game.ts` — simplified poker game logic (deck, deal, hand ranking, betting)
- [x] 4.4 Create `examples/poker/src/main.ts` — Endpoint creation, host/join flow, game state broadcasting
- [x] 4.5 Integrate `poker-card-element` (`<playing-card>`) web component for card rendering
- [x] 4.6 Wire up UI: player actions (bet, fold, check), game state display, winner announcement
