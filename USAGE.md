# iroh-ts Usage Guide

Practical patterns for building peer-to-peer apps with iroh-ts, based on the chat and poker examples.

## Connection Lifecycle

### Creating an Endpoint

Every peer starts by creating an endpoint and waiting for relay connectivity:

```ts
import { Endpoint, EndpointAddr } from "@salvatoret/iroh";

const endpoint = await Endpoint.create();
await endpoint.online(); // Wait for relay server connection — call before connect/accept
```

`online()` resolves once the endpoint has connected to a relay server. Always call it before attempting to connect or accept — otherwise address resolution may fail.

### Host vs. Joiner

iroh connections follow a host/joiner pattern:

```ts
// Host: listen for incoming connections
const ALPN = new TextEncoder().encode("my-app/1");
endpoint.setAlpns([ALPN]);
const conn = await endpoint.accept(); // Blocks until a peer connects

// Joiner: connect to a host by endpoint ID
const addr = EndpointAddr.fromEndpointId(hostEndpointId);
const conn = await endpoint.connect(addr, ALPN);
addr.free(); // Free WASM objects when done
```

The host's endpoint ID is shared out-of-band (e.g., in a URL query parameter).

### WASM Memory

All WASM objects (`Endpoint`, `EndpointAddr`, `Connection`, `BiStream`, etc.) have `.free()` and support `Symbol.dispose`. Call `.free()` when you're done with an object to avoid memory leaks. The most common one to forget is `EndpointAddr` after connecting.

## Communication: Streams vs. Datagrams

iroh offers two ways to send data:

### Bidirectional Streams (reliable, ordered)

Best for: chat messages, file transfer, any data that must arrive in order.

```ts
// Opener side
const stream = await conn.openBi();
await stream.send.writeAll(data);

// Accepter side — IMPORTANT: won't resolve until the opener writes
const stream = await conn.acceptBi();
const chunk = await stream.recv.readChunk(4096);
```

**Key behavior**: `acceptBi()` blocks until the opener writes to its `SendStream`. Your opener must write something before the accepter can proceed. The chat example sends a `"joined"` control message for this purpose.

Use a length-prefixed protocol to frame messages over a stream:

```ts
async function writeMsg(send: SendStream, text: string) {
  const bytes = new TextEncoder().encode(text);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, bytes.length);
  await send.writeAll(len);
  await send.writeAll(bytes);
}
```

### Datagrams (unreliable, unordered)

Best for: game state updates, real-time sync where the latest value matters more than every value.

```ts
// Send
conn.sendDatagram(new TextEncoder().encode(JSON.stringify(msg)));

// Receive
const data = await conn.readDatagram();
const msg = JSON.parse(new TextDecoder().decode(data));
```

Datagrams may be dropped or arrive out of order. They're simpler (no framing protocol needed) but unsuitable for data that must not be lost. The poker example uses datagrams because a dropped state update is corrected by the next one.

## Resilient Connection Patterns

Connections will drop — relay timeouts, network changes, peer closing their tab. A production-quality app needs to handle this gracefully.

### 1. Always-Accepting Host

The host should keep `accept()` pending at all times, not just for the initial connection. This way, when a joiner reconnects, the host's accept is already waiting — there's no delay from disconnect detection.

```ts
async function acceptLoop() {
  while (true) {
    try {
      const conn = await endpoint.accept();
      if (!conn) break;
      setupConnection(conn);
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
```

**Why this matters**: QUIC idle timeout takes 15-20 seconds to detect a dropped connection. If the host waits for disconnect detection before calling `accept()`, the joiner's reconnection attempts will time out in the gap.

### 2. Joiner Retry with Backoff

The joiner's `connect()` can fail or time out. Retry with delays:

```ts
async function connectWithRetry(ticket: string) {
  const MAX_ATTEMPTS = 6;
  const RETRY_DELAY = 5000;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, RETRY_DELAY));
    try {
      const addr = EndpointAddr.fromEndpointId(ticket);
      const conn = await endpoint.connect(addr, ALPN);
      addr.free();
      return conn;
    } catch {
      // Will retry
    }
  }
  throw new Error("Could not connect");
}
```

### 3. Connection Generation Counter

When a new connection replaces an old one, the old connection's callbacks (read loop exit, `conn.closed()`) can fire late and incorrectly trigger disconnect handling for the new connection. Use a generation counter to ignore stale events:

```ts
let connGeneration = 0;

function setupConnection(conn: Connection) {
  connGeneration++;
  const gen = connGeneration;

  // Read loop checks generation before triggering disconnect
  readLoop(conn, gen);

  // Connection monitor checks generation too
  conn.closed().then(reason => {
    if (gen === connGeneration) handleDisconnect();
  });
}
```

This prevents the race condition where an old connection's delayed "timed out" event overrides a new connection's "connected" state.

### 4. Connection Monitoring

`conn.closed()` returns a promise that resolves when the connection closes, with a reason string. Run it in parallel with your read loop for faster disconnect detection:

```ts
conn.closed().then(reason => {
  if (gen === connGeneration) {
    handleDisconnect();
  }
});
```

### 5. Error-Wrapped Sends

Always catch send errors — they indicate a dead connection:

```ts
try {
  await stream.send.writeAll(data);
} catch (err) {
  handleDisconnect();
}
```

For datagrams, `sendDatagram()` is synchronous but can still throw if the connection is closed:

```ts
try {
  conn.sendDatagram(data);
} catch {
  // Connection dead — will be detected by read loop
}
```

### 6. State Resync on Reconnect

If your app has server-authoritative state (like the poker game), resync the reconnecting peer by re-sending the current state:

```ts
function handleReconnection(conn: Connection) {
  // Send the full current state so the peer catches up
  sendMsg({ kind: "deal", hand: game.players[1].hand, community: game.community });
  sendMsg({ kind: "state", players: game.getPlayerStates(), pot: game.pot, ... });
}
```

## Built-in Keep-Alive

The iroh endpoint is configured with a 5-second QUIC keep-alive interval. This prevents relay servers from closing idle connections. You don't need to implement application-level heartbeats.

However, keep-alive doesn't detect dead connections instantly — it can take 15-20 seconds for a timeout. This is why the always-accepting host pattern (above) is important.

## Testing with Dual Iframes

For local testing, create a `test.html` that puts host and joiner side-by-side:

```html
<iframe id="host" src="/"></iframe>
<iframe id="joiner" src="about:blank"></iframe>
<script>
  // Auto-connect: poll host iframe for the join link
  const poll = setInterval(() => {
    try {
      const link = document.getElementById("host")
        .contentDocument?.querySelector("#status-text a");
      if (link) {
        document.getElementById("joiner").src = link.href;
        clearInterval(poll);
      }
    } catch {}
  }, 500);
</script>
```

This works under `vite dev` because both iframes are same-origin. The polling script reads the join URL from the host's DOM and loads it in the joiner iframe automatically.

## Common Pitfalls

- **Forgetting `await endpoint.online()`** — connect/accept may fail silently without relay connectivity
- **Not writing before `acceptBi()`** — the accept side will hang forever if the opener doesn't write first
- **Silent `catch { break }` in read loops** — always log or surface errors, otherwise debugging is impossible
- **Capturing `conn` in closures** — if the connection is replaced on reconnect, closures still reference the old dead connection. Use a module-scope variable instead
- **Not freeing `EndpointAddr`** — small WASM memory leak on every connect call
- **Calling `accept()` only once** — the host misses reconnections because there's no pending accept when the joiner comes back
