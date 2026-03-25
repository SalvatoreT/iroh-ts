# iroh P2P Chat

A minimal browser-to-browser peer-to-peer chat. Two browser tabs connect directly over iroh — no server required.

## Prerequisites

Build the iroh-ts library from the repo root:

```bash
pnpm install
pnpm build
```

## Running

```bash
cd examples/p2p-chat
pnpm install
pnpm dev
```

1. Open the URL shown by Vite (usually `http://localhost:5173`) in **Tab 1** — this is the host
2. Copy the share link displayed at the top
3. Open that link in **Tab 2** — this is the joiner
4. Start chatting!

Both peers communicate directly over iroh relay servers. No cloud deployment needed.
