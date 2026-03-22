## Context

iroh-ts has a working WASM build with Endpoint, Connection, Stream, BlobStore, and DocEngine APIs. There are 11 passing integration tests but no README or example applications. The library targets both Node.js and browser environments via conditional package exports.

## Goals / Non-Goals

**Goals:**
- README that serves as both human docs and an LLM-consumable API reference
- Two browser examples that demonstrate real iroh-ts usage and deploy to Cloudflare Workers
- Chat example: simplest possible real-time p2p app (proves connections + streams work)
- Poker example: richer app showing game state sync over iroh connections

**Non-Goals:**
- API reference docs site (rustdoc, typedoc) — README is sufficient for now
- Node.js CLI examples — browser-first to show WASM working
- Production-grade game logic — poker is a demo, not a full poker engine
- Persistent storage — all examples use in-memory state

## Decisions

### 1. README structure optimized for LLM readability

**Choice:** Use clear section headers, code-first examples, explicit type signatures, and avoid prose-heavy paragraphs. Every API method gets a one-liner plus code snippet.

**Rationale:** LLMs parse structured content (headers, code blocks, tables) better than flowing prose. Developers scanning docs also prefer this format.

### 2. Examples as Cloudflare Workers with Vite

**Choice:** Each example is a Vite project that builds to static assets served by a Cloudflare Worker.

**Rationale:**
- Vite handles the bundler target WASM loading automatically
- Cloudflare Workers Pages serves static sites with zero config
- Each example gets its own `wrangler.toml` in its directory
- A root `wrangler.toml` is not needed — each example deploys independently

### 3. Chat room: connection string via URL query parameter

**Choice:** When a user creates a chat room, the app generates a join URL like `?ticket=<base64-encoded-endpoint-addr>`. The joiner opens this URL and auto-connects.

**Rationale:** Simplest possible UX for sharing connections — just copy/paste a URL. The "ticket" encodes the endpoint address (ID + relay URL) needed to connect.

### 4. Poker room: game state over bidirectional streams

**Choice:** Use iroh bidirectional streams for game actions. Each player opens a stream to the host. The host broadcasts game state updates to all connected players. Cards rendered with `<playing-card>` web component from `poker-card-element`.

**Rationale:** Demonstrates a more complex protocol over iroh streams. The `poker-card-element` package provides ready-made card SVG rendering so we focus on networking, not UI.

### 5. Project structure

```
iroh-ts/
├── README.md                    # Rewritten docs
├── examples/
│   ├── chat/
│   │   ├── package.json
│   │   ├── wrangler.toml
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/
│   │       └── main.ts
│   └── poker/
│       ├── package.json
│       ├── wrangler.toml
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.ts
│           ├── game.ts          # Poker game logic
│           └── protocol.ts      # Message types over iroh streams
└── wrangler.toml                # Root wrangler pointing to examples
```

## Risks / Trade-offs

- **[Relay latency in examples]** → Both examples go through iroh relays. Users may notice latency. Mitigation: Expected for browser-to-browser; document this.

- **[poker-card-element maintenance]** → Small npm package (v0.1.1). Mitigation: It's a rendering-only web component with no logic dependencies; easy to replace or inline.

- **[WASM binary size]** → The iroh WASM binary is ~2.4MB. Mitigation: Acceptable for demo apps; production optimization (tree-shaking, feature flags) is future work.
