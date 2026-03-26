## Context

iroh-ts has Node.js and browser WASM targets with conditional exports. Existing examples (chat, poker) are browser-only Cloudflare Workers apps. The library needs a server-to-browser example and a zero-deploy local browser-to-browser example. Both should be runnable with a single command.

## Goals / Non-Goals

**Goals:**
- Echo server: Node.js process that creates an iroh endpoint, prints a URL, accepts browser connections, and echoes messages back — demonstrating server-to-browser communication
- P2P browser chat: two browser tabs connecting directly via iroh, runnable locally with `pnpm dev`
- The echo server should be launchable via `npx` from any machine with Node.js (after the package is published)
- Both examples should work without any cloud deployment

**Non-Goals:**
- Replacing the existing Cloudflare Workers examples
- Production-grade server architecture (load balancing, persistence)
- Publishing the demo package to npm in this change (just wiring up the bin entry)

## Decisions

### 1. Echo server as a Node.js CLI script

**Choice:** `examples/echo-server/` contains a Node.js script that creates an Endpoint, waits for connections, and echoes messages. It prints a URL that can be opened in a browser.

**Rationale:** This is the simplest way to demonstrate server-to-browser. The Node.js target of iroh-ts is already built. A CLI script with no framework dependencies keeps it minimal.

### 2. Echo server includes a tiny embedded HTML client

**Choice:** The echo server serves a small HTML page (via a simple HTTP server on localhost) that loads the iroh browser WASM and connects to the server's endpoint. Alternatively, the server just prints the endpoint ID and the user opens a separate Vite-served client page.

**Decision:** The echo server prints the endpoint ID and instructions. A companion `examples/echo-server/client/` directory has a Vite-based browser app that takes the endpoint ID as a query param. This keeps the server purely Node.js and the client purely browser.

**Rationale:** Separation of concerns. The server demonstrates Node.js usage; the client demonstrates browser usage. Users see both sides clearly.

### 3. P2P browser chat as standalone Vite project

**Choice:** `examples/p2p-chat/` is a Vite project nearly identical to the existing chat example but simplified — no reconnection logic, no Cloudflare config, just the minimum to connect two tabs.

**Rationale:** Shows browser-to-browser in the simplest possible form. Users run `pnpm dev`, open two tabs, paste a link, and chat. No deployment needed.

### 4. npx support via bin field

**Choice:** Add a `bin` field to `examples/echo-server/package.json` pointing to the server entry point. The root `package.json` gets a `demo` script that runs the echo server.

**Rationale:** `npx` resolves the `bin` field automatically. After publish, `npx @salvatoret/iroh-demo` would work. For local dev, `pnpm demo` from root works immediately.

### 5. Project structure

```
examples/
├── echo-server/
│   ├── package.json          # bin entry, depends on @salvatoret/iroh
│   ├── server.ts             # Node.js echo server (creates endpoint, accepts, echoes)
│   ├── client/
│   │   ├── index.html        # Browser client UI
│   │   ├── main.ts           # Browser client (connects to server endpoint, sends/receives)
│   │   ├── vite.config.ts
│   │   └── package.json
├── p2p-chat/
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       └── main.ts           # Minimal browser-to-browser chat
├── chat/                     # (existing)
└── poker/                    # (existing)
```

## Risks / Trade-offs

- **[Two processes for echo-server]** → User must start the Node.js server and the Vite client separately. Mitigation: clear instructions in terminal output; could add a `concurrently` script later.
- **[WASM build required first]** → All examples need `pnpm build` at root first. Mitigation: document this clearly; existing examples have the same requirement.
- **[npx won't work until published]** → The `npx` flow only works after the demo package is on npm. Mitigation: local `pnpm demo` works immediately; publishing is a separate concern.
