# iroh-ts

TypeScript bindings for [iroh](https://iroh.computer), the peer-to-peer networking stack. Connect nodes, transfer data, and sync documents — in Node.js or the browser — powered by WASM.

Built on iroh v0.97 (Rust → WASM via `wasm-pack`). One `npm install`, zero native dependencies.

## Install

```bash
pnpm add @salvatoret/iroh
# or
npm install @salvatoret/iroh
# or
yarn add @salvatoret/iroh
```

## Quick Start

Two nodes connect and exchange a message:

```ts
import { Endpoint } from "@salvatoret/iroh";

const ALPN = new TextEncoder().encode("my-app/1");

// --- Node A: accept a connection ---
const nodeA = await Endpoint.create();
await nodeA.online();
nodeA.setAlpns([ALPN]);

// Share this address with Node B (e.g. via URL, QR code, clipboard)
const addr = nodeA.endpointAddr();
console.log("Node A id:", addr.endpointId());
console.log("Node A relay:", addr.relayUrl());

// Accept a connection (start before Node B connects)
const acceptPromise = nodeA.accept();

// --- Node B: connect and send ---
const nodeB = await Endpoint.create();
await nodeB.online();

const conn = await nodeB.connect(addr, ALPN);
const stream = await conn.openBi();
await stream.send.writeAll(new TextEncoder().encode("hello from B"));
stream.send.finish();

// --- Node A: receive ---
const accepted = await acceptPromise;
// acceptBi resolves after the opener writes (QUIC requirement)
const incoming = await accepted!.acceptBi();
const data = await incoming.recv.readToEnd(65536);
console.log(new TextDecoder().decode(data)); // "hello from B"

// Cleanup
conn.close(0, new Uint8Array());
await nodeA.close();
await nodeB.close();
```

> **Note:** `acceptBi()` won't resolve until the opener writes to its `SendStream`. Always write before awaiting the accept side.

## API Reference

### `Endpoint`

The main entry point. Creates a QUIC endpoint with relay connectivity for NAT traversal.

```ts
static create(): Promise<Endpoint>
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `create` | `static create(): Promise<Endpoint>` | Create endpoint with default n0 relay settings |
| `endpointId` | `endpointId(): string` | Hex-encoded Ed25519 public key (64 chars) |
| `endpointAddr` | `endpointAddr(): EndpointAddr` | Full address info (id + relay URL) |
| `online` | `online(): Promise<void>` | Wait until connected to a relay server |
| `connect` | `connect(addr: EndpointAddr, alpn: Uint8Array): Promise<Connection>` | Connect to a remote peer |
| `accept` | `accept(): Promise<Connection \| undefined>` | Accept an incoming connection |
| `setAlpns` | `setAlpns(alpns: Uint8Array[]): void` | Set accepted ALPN protocols |
| `close` | `close(): Promise<void>` | Gracefully shut down |

### `EndpointAddr`

Address information for reaching an endpoint (ID + relay URL + direct addresses).

| Method | Signature | Description |
|--------|-----------|-------------|
| `fromEndpointId` | `static fromEndpointId(id: string): EndpointAddr` | Create from hex endpoint ID |
| `endpointId` | `endpointId(): string` | Get the endpoint ID |
| `relayUrl` | `relayUrl(): string \| undefined` | Get the relay URL, if any |

### `Connection`

A QUIC connection to a remote peer. Supports bidirectional streams, unidirectional streams, and datagrams.

| Method | Signature | Description |
|--------|-----------|-------------|
| `openBi` | `openBi(): Promise<BiStream>` | Open a bidirectional stream |
| `acceptBi` | `acceptBi(): Promise<BiStream>` | Accept incoming bidirectional stream |
| `openUni` | `openUni(): Promise<SendStream>` | Open a unidirectional send stream |
| `acceptUni` | `acceptUni(): Promise<RecvStream>` | Accept incoming unidirectional stream |
| `sendDatagram` | `sendDatagram(data: Uint8Array): void` | Send unreliable datagram |
| `readDatagram` | `readDatagram(): Promise<Uint8Array>` | Read unreliable datagram |
| `alpn` | `alpn(): Uint8Array` | Get negotiated ALPN protocol |
| `remoteEndpointId` | `remoteEndpointId(): string` | Remote peer's endpoint ID |
| `close` | `close(error_code: number, reason: Uint8Array): void` | Close with error code |
| `closed` | `closed(): Promise<string>` | Wait for connection close |
| `closeReason` | `closeReason(): string \| undefined` | Get close reason if already closed |
| `maxDatagramSize` | `maxDatagramSize(): number \| undefined` | Max datagram size |
| `stableId` | `stableId(): number` | Stable connection identifier |

### `BiStream`

A bidirectional stream pair.

| Property | Type | Description |
|----------|------|-------------|
| `send` | `SendStream` | Send half |
| `recv` | `RecvStream` | Receive half |

### `SendStream`

| Method | Signature | Description |
|--------|-----------|-------------|
| `write` | `write(data: Uint8Array): Promise<number>` | Write data, returns bytes written |
| `writeAll` | `writeAll(data: Uint8Array): Promise<void>` | Write all data |
| `finish` | `finish(): void` | Signal end of stream |

### `RecvStream`

| Method | Signature | Description |
|--------|-----------|-------------|
| `readToEnd` | `readToEnd(size_limit: number): Promise<Uint8Array>` | Read all data up to limit |
| `stop` | `stop(error_code: number): void` | Stop reading with error code |

### `BlobStore`

In-memory content-addressable storage using BLAKE3 hashing.

```ts
const store = new BlobStore();
const hash = await store.addBytes(new TextEncoder().encode("hello"));
const data = await store.getBytes(hash);
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `constructor` | `new BlobStore()` | Create in-memory store |
| `addBytes` | `addBytes(data: Uint8Array): Promise<string>` | Store data, returns BLAKE3 hash |
| `getBytes` | `getBytes(hash: string): Promise<Uint8Array>` | Retrieve by hash |
| `has` | `has(hash: string): Promise<boolean>` | Check existence |
| `list` | `list(): Promise<string[]>` | List all stored hashes |

### `DocEngine`

CRDT-based replicated document engine. Creates its own Endpoint, gossip, and blob store internally.

```ts
const engine = await DocEngine.create();
const author = await engine.authorDefault();
const doc = await engine.createDoc();
await doc.setBytes(author, key, value);
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `create` | `static create(): Promise<DocEngine>` | Create engine with in-memory storage |
| `createDoc` | `createDoc(): Promise<Doc>` | Create a new document |
| `authorDefault` | `authorDefault(): Promise<string>` | Get/create default author ID |
| `authorCreate` | `authorCreate(): Promise<string>` | Create a new author |
| `shutdown` | `shutdown(): Promise<void>` | Shut down the engine |

### `Doc`

A replicated key-value document.

| Method | Signature | Description |
|--------|-----------|-------------|
| `id` | `id(): string` | Namespace ID (hex) |
| `setBytes` | `setBytes(author: string, key: Uint8Array, value: Uint8Array): Promise<string>` | Set entry, returns content hash |
| `getExact` | `getExact(author: string, key: Uint8Array): Promise<Uint8Array \| undefined>` | Get entry by author + key |
| `del` | `del(author: string, prefix: Uint8Array): Promise<number>` | Delete by prefix, returns count |
| `close` | `close(): Promise<void>` | Close the document |

## Memory Management

All WASM objects have a `free()` method and support `Symbol.dispose` (TypeScript `using`). Call `free()` when done to release WASM memory:

```ts
const ep = await Endpoint.create();
// ... use it ...
await ep.close();
ep.free();
```

## Build from Source

Requirements: Rust (stable), `wasm-pack`, `wasm32-unknown-unknown` target, pnpm.

On macOS, the `ring` crate needs LLVM with WASM support:

```bash
brew install llvm
export CC=/opt/homebrew/opt/llvm/bin/clang
export AR=/opt/homebrew/opt/llvm/bin/llvm-ar
```

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
pnpm install
pnpm build       # builds WASM + TypeScript
pnpm test        # runs integration tests
```

## Examples

See the [`examples/`](./examples) directory:

- **[Chat](./examples/chat)** — peer-to-peer chat room, joinable via URL
- **[Poker](./examples/poker)** — multiplayer poker table with card rendering

## License

MIT
