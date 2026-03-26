#!/usr/bin/env tsx
import {
  Endpoint,
  EndpointAddr,
  BlobStore,
  DocEngine,
  type Connection,
  type SendStream,
} from "@salvatoret/iroh";

const ALPN = new TextEncoder().encode("iroh-debug/1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// --- ANSI colors ---
const C = {
  endpoint: "\x1b[34m",
  connection: "\x1b[32m",
  stream: "\x1b[35m",
  datagram: "\x1b[33m",
  blob: "\x1b[36m",
  doc: "\x1b[93m",
  error: "\x1b[31m",
  reset: "\x1b[0m",
  dim: "\x1b[2m",
};

type Category = "endpoint" | "connection" | "stream" | "datagram" | "blob" | "doc" | "error";

function log(cat: Category, dir: string, msg: string, detail?: string) {
  const time = new Date().toISOString().slice(11, 23);
  const catStr = `[${cat}]`.padEnd(14);
  console.log(`${C.dim}${time}${C.reset} ${C[cat]}${catStr}${C.reset} ${dir} ${msg}`);
  if (detail) {
    console.log(`${" ".repeat(20)}${C.dim}${detail}${C.reset}`);
  }
}

function shortId(id: string): string {
  return id.slice(0, 12) + "...";
}

function hexDump(data: Uint8Array, max = 64): string {
  const slice = data.slice(0, max);
  const hex = Array.from(slice).map((b) => b.toString(16).padStart(2, "0")).join(" ");
  return data.length > max ? `${hex} ... (${data.length} bytes total)` : hex;
}

// --- Length-prefixed framing ---

interface DebugMessage {
  kind: string;
  [key: string]: unknown;
}

async function writeFramed(send: SendStream, msg: DebugMessage): Promise<number> {
  const bytes = encoder.encode(JSON.stringify(msg));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, bytes.length);
  await send.writeAll(len);
  await send.writeAll(bytes);
  return 4 + bytes.length;
}

async function readFramed(
  recv: { readChunk(max: number): Promise<Uint8Array | null | undefined> },
  handler: (msg: DebugMessage, rawSize: number) => void,
): Promise<void> {
  const buf: number[] = [];
  while (true) {
    const chunk = await recv.readChunk(4096);
    if (chunk === undefined || chunk === null) break;
    for (let i = 0; i < chunk.length; i++) buf.push(chunk[i]);
    while (buf.length >= 4) {
      const msgLen = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
      if (buf.length < 4 + msgLen) break;
      const raw = buf.splice(0, 4 + msgLen);
      const msgBytes = new Uint8Array(raw.slice(4));
      handler(JSON.parse(decoder.decode(msgBytes)), 4 + msgLen);
    }
  }
}

// --- Connection handler ---

async function handleConnection(conn: Connection) {
  const remoteId = conn.remoteEndpointId();
  const alpn = conn.alpn();
  const stableId = conn.stableId();
  const maxDg = conn.maxDatagramSize();
  const closeReason = conn.closeReason();

  log("connection", "**", "Connection established");
  log("connection", "**", `Remote endpoint ID: ${remoteId}`);
  log("connection", "**", `ALPN: ${decoder.decode(alpn)} (${alpn.length} bytes)`, hexDump(alpn));
  log("connection", "**", `Stable ID: ${stableId}`);
  log("connection", "**", `Max datagram size: ${maxDg ?? "unknown"}`);
  if (closeReason) {
    log("connection", "**", `Close reason (already set): ${closeReason}`);
  }

  // Monitor closure
  conn.closed().then((reason) => {
    log("connection", "**", `Connection closed: ${reason}`);
  });

  // --- Bi stream ---
  let sendStream: SendStream;
  try {
    if (mode === "listen") {
      log("stream", "**", "Waiting for acceptBi()...");
      const stream = await conn.acceptBi();
      log("stream", "<-", "acceptBi() resolved");
      sendStream = stream.send;

      readFramed(stream.recv, (msg, rawSize) => {
        log("stream", "<-", `Received ${msg.kind} (${rawSize} bytes)`, JSON.stringify(msg));
        if (msg.kind === "ping") {
          const pong = { kind: "pong", seq: msg.seq, timestamp: Date.now() };
          writeFramed(sendStream, pong).then((bytes) => {
            log("stream", "->", `Sent pong #${msg.seq} (${bytes} bytes)`);
          });
        }
      }).then(() => {
        log("stream", "**", "Bi stream recv ended (FIN)");
      }).catch((err) => {
        log("error", "**", `Bi stream recv error: ${err instanceof Error ? err.message : String(err)}`);
      });
    } else {
      log("stream", "**", "Calling openBi()...");
      const stream = await conn.openBi();
      log("stream", "->", "openBi() resolved");
      sendStream = stream.send;

      for (let i = 1; i <= 3; i++) {
        const ping = { kind: "ping", seq: i, timestamp: Date.now() };
        const bytes = await writeFramed(sendStream, ping);
        log("stream", "->", `Sent ping #${i} (${bytes} bytes)`);
      }

      readFramed(stream.recv, (msg, rawSize) => {
        log("stream", "<-", `Received ${msg.kind} (${rawSize} bytes)`, JSON.stringify(msg));
      }).then(() => {
        log("stream", "**", "Bi stream recv ended (FIN)");
      }).catch((err) => {
        log("error", "**", `Bi stream recv error: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  } catch (err) {
    log("error", "**", `Bi stream error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // --- Datagrams ---
  try {
    for (let i = 1; i <= 3; i++) {
      const msg = { kind: "datagram-ping", seq: i, timestamp: Date.now() };
      const encoded = encoder.encode(JSON.stringify(msg));
      conn.sendDatagram(encoded);
      log("datagram", "->", `Sent datagram-ping #${i} (${encoded.length} bytes)`);
    }

    (async () => {
      for (let i = 0; i < 10; i++) {
        try {
          const data = await conn.readDatagram();
          log("datagram", "<-", `Received datagram (${data.length} bytes)`, decoder.decode(data));
          try {
            const parsed = JSON.parse(decoder.decode(data));
            if (parsed.kind === "datagram-ping") {
              const pong = { kind: "datagram-pong", seq: parsed.seq, timestamp: Date.now() };
              const encoded = encoder.encode(JSON.stringify(pong));
              conn.sendDatagram(encoded);
              log("datagram", "->", `Sent datagram-pong #${parsed.seq} (${encoded.length} bytes)`);
            }
          } catch { /* not JSON */ }
        } catch {
          break;
        }
      }
      log("datagram", "**", "Datagram read loop ended");
    })();
  } catch (err) {
    log("error", "**", `Datagram error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// --- Local tests ---

async function runLocalTests() {
  // BlobStore
  log("blob", "**", "--- BlobStore test ---");
  try {
    const store = new BlobStore();
    log("blob", "**", "Created BlobStore");

    const testData = [
      encoder.encode("Hello, iroh blobs!"),
      encoder.encode("Second blob with more data."),
      new Uint8Array([0, 1, 2, 3, 255, 254, 253]),
    ];

    const hashes: string[] = [];
    for (const data of testData) {
      const hash = await store.addBytes(data);
      hashes.push(hash);
      log("blob", "**", `addBytes(${data.length} bytes) -> ${shortId(hash)}`, `Full hash: ${hash} | Data: ${hexDump(data)}`);
    }

    const allHashes = await store.list();
    log("blob", "**", `list() -> ${allHashes.length} blobs`, allHashes.map((h) => shortId(h)).join(", "));

    for (const hash of hashes) {
      const exists = await store.has(hash);
      const data = await store.getBytes(hash);
      log("blob", "**", `has(${shortId(hash)}) -> ${exists} | getBytes() -> ${data.length} bytes`, hexDump(data));
    }

    const fakeHash = "0".repeat(64);
    const hasFake = await store.has(fakeHash);
    log("blob", "**", `has(fake hash) -> ${hasFake}`);

    store.free();
    log("blob", "**", "BlobStore freed");
  } catch (err) {
    log("error", "**", `BlobStore error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // DocEngine
  log("doc", "**", "--- DocEngine test ---");
  try {
    const engine = await DocEngine.create();
    log("doc", "**", "DocEngine created");

    const defaultAuthor = await engine.authorDefault();
    log("doc", "**", `authorDefault() -> ${shortId(defaultAuthor)}`, `Full: ${defaultAuthor}`);

    const newAuthor = await engine.authorCreate();
    log("doc", "**", `authorCreate() -> ${shortId(newAuthor)}`, `Full: ${newAuthor}`);

    const doc = await engine.createDoc();
    const docId = doc.id();
    log("doc", "**", `createDoc() -> ${shortId(docId)}`, `Full: ${docId}`);

    const entries = [
      { key: "greeting", value: "Hello from debug!" },
      { key: "counter", value: "42" },
      { key: "nested/path/key", value: "deep value" },
    ];

    for (const { key, value } of entries) {
      const hash = await doc.setBytes(defaultAuthor, encoder.encode(key), encoder.encode(value));
      log("doc", "**", `setBytes("${key}", "${value}") -> ${shortId(hash)}`, `Full hash: ${hash}`);
    }

    for (const { key } of entries) {
      const data = await doc.getExact(defaultAuthor, encoder.encode(key));
      const val = data ? decoder.decode(data) : "<undefined>";
      log("doc", "**", `getExact("${key}") -> "${val}" (${data ? data.length + " bytes" : "not found"})`);
    }

    const delCount = await doc.del(defaultAuthor, encoder.encode("counter"));
    log("doc", "**", `del("counter") -> ${delCount} entries deleted`);

    const afterDel = await doc.getExact(defaultAuthor, encoder.encode("counter"));
    log("doc", "**", `getExact("counter") after del -> ${afterDel ? decoder.decode(afterDel) : "<undefined>"}`);

    await doc.close();
    log("doc", "**", "Doc closed");

    await engine.shutdown();
    log("doc", "**", "DocEngine shut down");
  } catch (err) {
    log("error", "**", `DocEngine error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// --- CLI args ---

let mode: "listen" | "connect" = "listen";
let connectTarget: string | null = null;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--mode" && args[i + 1]) {
    if (args[i + 1] === "connect") {
      mode = "connect";
      connectTarget = args[i + 2] ?? null;
      i += 2;
    } else {
      mode = "listen";
      i += 1;
    }
  }
  if (args[i] === "--connect" || args[i] === "-c") {
    mode = "connect";
    connectTarget = args[i + 1] ?? null;
    i += 1;
  }
}

// --- Main ---

async function main() {
  console.log(`\n${C.endpoint}iroh debug server${C.reset}\n`);

  log("endpoint", "**", "Calling Endpoint.create()...");
  const endpoint = await Endpoint.create();
  const endpointId = endpoint.endpointId();
  log("endpoint", "**", `Endpoint created — ID: ${endpointId}`);

  log("endpoint", "**", "Calling endpoint.online()...");
  await endpoint.online();
  log("endpoint", "**", "Endpoint is online");

  const addr = endpoint.endpointAddr();
  const relayUrl = addr.relayUrl();
  addr.free();
  log("endpoint", "**", `Relay URL: ${relayUrl ?? "none"}`);

  // Run local tests
  await runLocalTests();

  if (mode === "connect") {
    if (!connectTarget) {
      console.error("Error: --mode connect requires an endpoint ID argument");
      console.error("Usage: iroh-debug --mode connect <endpoint-id>");
      process.exit(1);
    }

    log("connection", "->", `Connecting to ${shortId(connectTarget)}...`);
    const peerAddr = EndpointAddr.fromEndpointId(connectTarget);
    const peerRelay = peerAddr.relayUrl();
    log("connection", "**", `Peer relay URL: ${peerRelay ?? "none"}`);
    const conn = await endpoint.connect(peerAddr, ALPN);
    peerAddr.free();
    log("connection", "**", "connect() resolved — connected!");
    await handleConnection(conn);
  } else {
    endpoint.setAlpns([ALPN]);
    log("endpoint", "**", `ALPN set to "${decoder.decode(ALPN)}"`);

    console.log(`\n  Endpoint ID: ${endpointId}\n`);
    console.log("  Connect from browser:  ?ticket=" + endpointId);
    console.log("  Connect from server:   --mode connect " + endpointId);
    console.log("\n  Waiting for connections...\n");

    while (true) {
      try {
        const conn = await endpoint.accept();
        if (!conn) {
          log("endpoint", "**", "accept() returned null — endpoint closed");
          break;
        }
        log("endpoint", "<-", "accept() resolved — new connection");
        handleConnection(conn);
      } catch (err) {
        log("error", "**", `Accept error: ${err instanceof Error ? err.message : String(err)}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
