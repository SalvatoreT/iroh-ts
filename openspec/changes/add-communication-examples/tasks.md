## 1. Echo Server (Server-to-Browser)

- [ ] 1.1 Create `examples/echo-server/package.json` with `@salvatoret/iroh` dependency, `tsx` for running TypeScript, and `bin` entry pointing to `server.ts`
- [ ] 1.2 Create `examples/echo-server/server.ts` — Node.js script that creates an Endpoint, goes online, sets ALPN, prints endpoint ID and instructions, then runs an accept loop that echoes messages back with a timestamp prefix
- [ ] 1.3 Create `examples/echo-server/tsconfig.json` for Node.js ESM target
- [ ] 1.4 Create `examples/echo-server/client/package.json` with `@salvatoret/iroh`, `vite`, `vite-plugin-wasm`, `vite-plugin-top-level-await`
- [ ] 1.5 Create `examples/echo-server/client/index.html` — minimal UI with endpoint ID input, message input, and message display area
- [ ] 1.6 Create `examples/echo-server/client/main.ts` — browser script that takes endpoint ID from input or `?server=` query param, connects, sends messages, displays echoed responses
- [ ] 1.7 Create `examples/echo-server/client/vite.config.ts` with WASM plugins

## 2. P2P Browser Chat (Browser-to-Browser)

- [ ] 2.1 Create `examples/p2p-chat/package.json` with `@salvatoret/iroh`, `vite`, WASM plugins
- [ ] 2.2 Create `examples/p2p-chat/index.html` — clean chat UI with status bar, messages area, and input
- [ ] 2.3 Create `examples/p2p-chat/src/main.ts` — minimal browser-to-browser chat: create endpoint, host generates join link, joiner connects via `?ticket=` param, bidirectional stream messaging with length-prefixed protocol
- [ ] 2.4 Create `examples/p2p-chat/vite.config.ts` with WASM plugins

## 3. Integration

- [ ] 3.1 Add `examples/echo-server/client` to `pnpm-workspace.yaml` if needed (or ensure glob `examples/*` covers it)
- [ ] 3.2 Add `demo` script to root `package.json` that runs the echo server
- [ ] 3.3 Add README.md to `examples/echo-server/` with usage instructions (run server, open client, paste ID)
- [ ] 3.4 Add README.md to `examples/p2p-chat/` with usage instructions (pnpm dev, open two tabs)
