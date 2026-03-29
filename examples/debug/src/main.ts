import {
  Endpoint,
  EndpointAddr,
  BlobStore,
  DocEngine,
  type Connection,
  type SendStream,
  type RecvStream,
} from "@salvatoret/iroh";

import { createBrowserLogger, type LogSink } from "./debug-logger.js";
import {
  ALPN,
  writeFramed,
  readFramed,
  hexDump,
  shortId,
  type DebugMessage,
} from "./protocol.js";

// --- DOM refs ---
const logEl = document.getElementById("log")!;
const endpointPill = document.getElementById("endpoint-pill")!;
const relayPill = document.getElementById("relay-pill")!;
const statusDot = document.getElementById("status-dot")!;
const statusText = document.getElementById("status-text")!;
const joinBar = document.getElementById("join-bar")!;
const joinLink = document.getElementById("join-link") as HTMLAnchorElement;
const npxCmd = document.getElementById("npx-cmd")!;
const btnCopyNpx = document.getElementById("btn-copy-npx")!;
const joinersBar = document.getElementById("joiners-bar")!;
const inputEl = document.getElementById("msg-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const btnClear = document.getElementById("btn-clear")!;
const btnCopy = document.getElementById("btn-copy")!;

const log: LogSink = createBrowserLogger(logEl);

// --- Filter toggles ---
document.querySelectorAll<HTMLInputElement>(".filters input[data-cat]").forEach((cb) => {
  cb.addEventListener("change", () => {
    const cat = cb.dataset.cat!;
    logEl.querySelectorAll(`.log-${cat}`).forEach((el) => {
      el.classList.toggle("hidden", !cb.checked);
    });
  });
});

btnClear.addEventListener("click", () => {
  logEl.innerHTML = "";
});

btnCopy.addEventListener("click", () => {
  const lines = Array.from(logEl.querySelectorAll(".log-entry"))
    .map((el) => el.textContent)
    .join("\n");
  navigator.clipboard.writeText(lines);
});

// --- State ---
let endpoint: Endpoint | null = null;
let sendStream: SendStream | null = null;
let role: "host" | "joiner" = "host";
let peerTicket: string | null = null;

// Track multiple joiners (host mode)
interface JoinerInfo {
  sendStream: SendStream;
  writeQueue: Promise<void>;
  chipEl: HTMLElement;
}
const joiners = new Map<string, JoinerInfo>();

// Serialize all writes to sendStream to prevent frame interleaving.
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(fn: () => Promise<void>): Promise<void> {
  const next = writeQueue.then(fn, () => fn());
  writeQueue = next.then(() => {}, () => {});
  return next;
}

function enqueueJoinerWrite(joinerId: string, fn: () => Promise<void>): Promise<void> {
  const joiner = joiners.get(joinerId);
  if (!joiner) return Promise.resolve();
  const next = joiner.writeQueue.then(fn, () => fn());
  joiner.writeQueue = next.then(() => {}, () => {});
  return next;
}

function addJoinerChip(remoteId: string): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "joiner-chip";
  chip.title = remoteId;
  chip.innerHTML = `<span class="status-dot green"></span>${shortId(remoteId)}`;
  joinersBar.appendChild(chip);
  return chip;
}

function setJoinerDisconnected(remoteId: string) {
  const joiner = joiners.get(remoteId);
  if (joiner) {
    const dot = joiner.chipEl.querySelector(".status-dot");
    if (dot) dot.className = "status-dot red";
    joiners.delete(remoteId);
  }
  updateHostInputState();
}

function updateHostInputState() {
  if (role !== "host") return;
  const hasConnected = joiners.size > 0;
  inputEl.disabled = !hasConnected;
  sendBtn.disabled = !hasConnected;
  if (hasConnected) {
    statusText.textContent = `${joiners.size} joiner${joiners.size > 1 ? "s" : ""} connected`;
    statusDot.className = "status-dot green";
  } else if (joinersBar.children.length > 0) {
    statusText.textContent = "All joiners disconnected";
    statusDot.className = "status-dot red";
  } else {
    statusText.textContent = "Waiting for peer...";
    statusDot.className = "status-dot orange";
  }
}

function setStatus(state: "connecting" | "connected" | "disconnected", detail: string) {
  statusText.textContent = detail;
  statusDot.className =
    "status-dot " +
    (state === "connected" ? "green" : state === "connecting" ? "orange" : "red");
  inputEl.disabled = state !== "connected";
  sendBtn.disabled = state !== "connected";
}

// --- Send custom message ---
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSend();
});
sendBtn.addEventListener("click", doSend);

async function doSend() {
  const text = inputEl.value.trim();
  if (!text) return;

  if (role === "host") {
    if (joiners.size === 0) return;
    inputEl.value = "";
    const msg: DebugMessage = { kind: "data", payload: text, timestamp: Date.now() };
    for (const [id, joiner] of joiners) {
      try {
        let bytes = 0;
        await enqueueJoinerWrite(id, async () => {
          bytes = await writeFramed(joiner.sendStream, msg);
        });
        log({
          timestamp: Date.now(),
          category: "stream",
          direction: "send",
          message: `Sent custom data to ${shortId(id)}: "${text}" (${bytes} bytes framed)`,
        });
      } catch (err) {
        log({
          timestamp: Date.now(),
          category: "error",
          direction: "local",
          message: `Send to ${shortId(id)} failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  } else {
    if (!sendStream) return;
    inputEl.value = "";
    const msg: DebugMessage = { kind: "data", payload: text, timestamp: Date.now() };
    try {
      let bytes = 0;
      await enqueueWrite(async () => {
        bytes = await writeFramed(sendStream!, msg);
      });
      log({
        timestamp: Date.now(),
        category: "stream",
        direction: "send",
        message: `Sent custom data: "${text}" (${bytes} bytes framed)`,
      });
    } catch (err) {
      log({
        timestamp: Date.now(),
        category: "error",
        direction: "local",
        message: `Send failed: ${err instanceof Error ? err.message : String(err)}`,
      });
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

  log({ timestamp: Date.now(), category: "connection", direction: "local", message: `Connection established` });
  log({ timestamp: Date.now(), category: "connection", direction: "local", message: `Remote endpoint ID: ${remoteId}` });
  log({ timestamp: Date.now(), category: "connection", direction: "local", message: `ALPN: ${new TextDecoder().decode(alpn)} (${alpn.length} bytes)`, detail: hexDump(alpn) });
  log({ timestamp: Date.now(), category: "connection", direction: "local", message: `Stable ID: ${stableId}` });
  log({ timestamp: Date.now(), category: "connection", direction: "local", message: `Max datagram size: ${maxDg ?? "unknown"}` });
  if (closeReason) {
    log({ timestamp: Date.now(), category: "connection", direction: "local", message: `Close reason (already set): ${closeReason}` });
  }

  if (role === "host") {
    const chip = addJoinerChip(remoteId);
    joiners.set(remoteId, { sendStream: null!, writeQueue: Promise.resolve(), chipEl: chip });
    updateHostInputState();
  } else {
    setStatus("connected", `Connected to ${shortId(remoteId)}`);
  }

  // Monitor connection closure in background
  conn.closed().then((reason) => {
    log({ timestamp: Date.now(), category: "connection", direction: "local", message: `Connection ${shortId(remoteId)} closed: ${reason}` });
    if (role === "host") {
      setJoinerDisconnected(remoteId);
    } else {
      setStatus("disconnected", "Disconnected");
      sendStream = null;
    }
  });

  // --- Bi-directional stream test ---
  try {
    let stream;
    if (role === "host") {
      log({ timestamp: Date.now(), category: "stream", direction: "local", message: "Waiting for acceptBi()..." });
      stream = await conn.acceptBi();
      log({ timestamp: Date.now(), category: "stream", direction: "recv", message: "acceptBi() resolved — bi stream accepted" });
    } else {
      log({ timestamp: Date.now(), category: "stream", direction: "local", message: "Calling openBi()..." });
      stream = await conn.openBi();
      log({ timestamp: Date.now(), category: "stream", direction: "send", message: "openBi() resolved — bi stream opened" });
    }

    if (role === "host") {
      const joiner = joiners.get(remoteId);
      if (joiner) {
        joiner.sendStream = stream.send;
        joiner.writeQueue = Promise.resolve();
      }
    } else {
      sendStream = stream.send;
      writeQueue = Promise.resolve();
    }

    // Joiner initiates the ping sequence
    if (role === "joiner") {
      for (let i = 1; i <= 3; i++) {
        const ping: DebugMessage = { kind: "ping", seq: i, timestamp: Date.now() };
        const bytes = await writeFramed(sendStream, ping);
        log({
          timestamp: Date.now(),
          category: "stream",
          direction: "send",
          message: `Sent ping #${i} (${bytes} bytes framed)`,
        });
      }
    }

    // Read incoming messages
    readFramed(stream.recv, (msg, rawSize) => {
      const from = msg.kind === "data" ? ` from ${shortId(remoteId)}` : "";
      log({
        timestamp: Date.now(),
        category: "stream",
        direction: "recv",
        message: `Received ${msg.kind}${from} (${rawSize} bytes framed)`,
        detail: JSON.stringify(msg),
      });

      // Host echoes pings as pongs
      if (msg.kind === "ping") {
        const pong: DebugMessage = { kind: "pong", seq: msg.seq, timestamp: Date.now() };
        if (role === "host") {
          const joiner = joiners.get(remoteId);
          if (joiner) {
            enqueueJoinerWrite(remoteId, async () => {
              const bytes = await writeFramed(joiner.sendStream, pong);
              log({
                timestamp: Date.now(),
                category: "stream",
                direction: "send",
                message: `Sent pong #${msg.seq} (${bytes} bytes framed)`,
              });
            });
          }
        } else if (sendStream) {
          enqueueWrite(async () => {
            const bytes = await writeFramed(sendStream!, pong);
            log({
              timestamp: Date.now(),
              category: "stream",
              direction: "send",
              message: `Sent pong #${msg.seq} (${bytes} bytes framed)`,
            });
          });
        }
      }
    }).then(() => {
      log({ timestamp: Date.now(), category: "stream", direction: "local", message: "Bi stream recv ended (FIN)" });
    }).catch((err) => {
      log({
        timestamp: Date.now(),
        category: "error",
        direction: "local",
        message: `Bi stream recv error: ${err instanceof Error ? err.message : String(err)}`,
      });
    });
  } catch (err) {
    log({
      timestamp: Date.now(),
      category: "error",
      direction: "local",
      message: `Bi stream setup error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // --- Datagram test ---
  try {
    // Send datagrams
    for (let i = 1; i <= 3; i++) {
      const msg: DebugMessage = { kind: "datagram-ping", seq: i, timestamp: Date.now() };
      const encoded = new TextEncoder().encode(JSON.stringify(msg));
      conn.sendDatagram(encoded);
      log({
        timestamp: Date.now(),
        category: "datagram",
        direction: "send",
        message: `Sent datagram-ping #${i} (${encoded.length} bytes)`,
        detail: hexDump(encoded),
      });
    }

    // Read datagrams in background
    (async () => {
      for (let i = 0; i < 10; i++) {
        try {
          const data = await conn.readDatagram();
          log({
            timestamp: Date.now(),
            category: "datagram",
            direction: "recv",
            message: `Received datagram (${data.length} bytes)`,
            detail: new TextDecoder().decode(data),
          });
          // Echo back as pong
          try {
            const parsed = JSON.parse(new TextDecoder().decode(data));
            if (parsed.kind === "datagram-ping") {
              const pong: DebugMessage = { kind: "datagram-pong", seq: parsed.seq, timestamp: Date.now() };
              const encoded = new TextEncoder().encode(JSON.stringify(pong));
              conn.sendDatagram(encoded);
              log({
                timestamp: Date.now(),
                category: "datagram",
                direction: "send",
                message: `Sent datagram-pong #${parsed.seq} (${encoded.length} bytes)`,
              });
            }
          } catch { /* not JSON, that's fine */ }
        } catch {
          break;
        }
      }
      log({ timestamp: Date.now(), category: "datagram", direction: "local", message: "Datagram read loop ended" });
    })();
  } catch (err) {
    log({
      timestamp: Date.now(),
      category: "error",
      direction: "local",
      message: `Datagram error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// --- Local-only tests (BlobStore + DocEngine) ---

async function runLocalTests() {
  // BlobStore
  log({ timestamp: Date.now(), category: "blob", direction: "local", message: "--- BlobStore test ---" });
  try {
    const store = new BlobStore();
    log({ timestamp: Date.now(), category: "blob", direction: "local", message: "Created BlobStore" });

    const testData = [
      new TextEncoder().encode("Hello, iroh blobs!"),
      new TextEncoder().encode("Second blob with more data."),
      new Uint8Array([0, 1, 2, 3, 255, 254, 253]),
    ];

    const hashes: string[] = [];
    for (const data of testData) {
      const hash = await store.addBytes(data);
      hashes.push(hash);
      log({
        timestamp: Date.now(),
        category: "blob",
        direction: "local",
        message: `addBytes(${data.length} bytes) -> hash: ${shortId(hash)}`,
        detail: `Full hash: ${hash} | Data: ${hexDump(data)}`,
      });
    }

    const allHashes = await store.list();
    log({
      timestamp: Date.now(),
      category: "blob",
      direction: "local",
      message: `list() -> ${allHashes.length} blobs`,
      detail: allHashes.map((h) => shortId(h)).join(", "),
    });

    for (const hash of hashes) {
      const exists = await store.has(hash);
      const data = await store.getBytes(hash);
      log({
        timestamp: Date.now(),
        category: "blob",
        direction: "local",
        message: `has(${shortId(hash)}) -> ${exists} | getBytes() -> ${data.length} bytes`,
        detail: hexDump(data),
      });
    }

    const fakeHash = "0".repeat(64);
    const hasFake = await store.has(fakeHash);
    log({
      timestamp: Date.now(),
      category: "blob",
      direction: "local",
      message: `has(fake hash) -> ${hasFake}`,
    });

    store.free();
    log({ timestamp: Date.now(), category: "blob", direction: "local", message: "BlobStore freed" });
  } catch (err) {
    log({
      timestamp: Date.now(),
      category: "error",
      direction: "local",
      message: `BlobStore error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // DocEngine
  log({ timestamp: Date.now(), category: "doc", direction: "local", message: "--- DocEngine test ---" });
  try {
    const engine = await DocEngine.create();
    log({ timestamp: Date.now(), category: "doc", direction: "local", message: "DocEngine created" });

    const defaultAuthor = await engine.authorDefault();
    log({
      timestamp: Date.now(),
      category: "doc",
      direction: "local",
      message: `authorDefault() -> ${shortId(defaultAuthor)}`,
      detail: `Full author ID: ${defaultAuthor}`,
    });

    const newAuthor = await engine.authorCreate();
    log({
      timestamp: Date.now(),
      category: "doc",
      direction: "local",
      message: `authorCreate() -> ${shortId(newAuthor)}`,
      detail: `Full author ID: ${newAuthor}`,
    });

    const doc = await engine.createDoc();
    const docId = doc.id();
    log({
      timestamp: Date.now(),
      category: "doc",
      direction: "local",
      message: `createDoc() -> id: ${shortId(docId)}`,
      detail: `Full doc ID: ${docId}`,
    });

    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const entries = [
      { key: "greeting", value: "Hello from debug!" },
      { key: "counter", value: "42" },
      { key: "nested/path/key", value: "deep value" },
    ];

    for (const { key, value } of entries) {
      const hash = await doc.setBytes(defaultAuthor, enc.encode(key), enc.encode(value));
      log({
        timestamp: Date.now(),
        category: "doc",
        direction: "local",
        message: `setBytes("${key}", "${value}") -> content hash: ${shortId(hash)}`,
        detail: `Full hash: ${hash}`,
      });
    }

    for (const { key } of entries) {
      const data = await doc.getExact(defaultAuthor, enc.encode(key));
      const val = data ? dec.decode(data) : "<undefined>";
      log({
        timestamp: Date.now(),
        category: "doc",
        direction: "local",
        message: `getExact("${key}") -> "${val}" (${data ? data.length + " bytes" : "not found"})`,
      });
    }

    const delCount = await doc.del(defaultAuthor, enc.encode("counter"));
    log({
      timestamp: Date.now(),
      category: "doc",
      direction: "local",
      message: `del("counter") -> ${delCount} entries deleted`,
    });

    const afterDel = await doc.getExact(defaultAuthor, enc.encode("counter"));
    log({
      timestamp: Date.now(),
      category: "doc",
      direction: "local",
      message: `getExact("counter") after del -> ${afterDel ? dec.decode(afterDel) : "<undefined>"}`,
    });

    await doc.close();
    log({ timestamp: Date.now(), category: "doc", direction: "local", message: "Doc closed" });

    await engine.shutdown();
    log({ timestamp: Date.now(), category: "doc", direction: "local", message: "DocEngine shut down" });
  } catch (err) {
    log({
      timestamp: Date.now(),
      category: "error",
      direction: "local",
      message: `DocEngine error: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// --- Host: accept loop ---

async function acceptLoop() {
  log({ timestamp: Date.now(), category: "endpoint", direction: "local", message: "Entering accept loop..." });
  while (true) {
    try {
      const conn = await endpoint!.accept();
      if (!conn) {
        log({ timestamp: Date.now(), category: "endpoint", direction: "local", message: "accept() returned null — endpoint closed" });
        break;
      }
      log({ timestamp: Date.now(), category: "endpoint", direction: "recv", message: "accept() resolved — new connection" });
      handleConnection(conn);
    } catch (err) {
      log({
        timestamp: Date.now(),
        category: "error",
        direction: "local",
        message: `Accept error: ${err instanceof Error ? err.message : String(err)}`,
      });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// --- Joiner: connect with retry ---

async function connectWithRetry() {
  const MAX_ATTEMPTS = 6;
  const RETRY_DELAY = 5000;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      setStatus("connecting", `Retrying (${attempt}/${MAX_ATTEMPTS - 1})...`);
      log({ timestamp: Date.now(), category: "connection", direction: "local", message: `Retry attempt ${attempt}/${MAX_ATTEMPTS - 1}, waiting ${RETRY_DELAY}ms...` });
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
    } else {
      setStatus("connecting", "Connecting to peer...");
    }
    try {
      log({ timestamp: Date.now(), category: "connection", direction: "send", message: `Connecting to ${shortId(peerTicket!)}...` });
      const addr = EndpointAddr.fromEndpointId(peerTicket!);
      const relayUrl = addr.relayUrl();
      log({
        timestamp: Date.now(),
        category: "connection",
        direction: "local",
        message: `EndpointAddr created — relay: ${relayUrl ?? "none"}`,
      });
      const conn = await endpoint!.connect(addr, ALPN);
      addr.free();
      log({ timestamp: Date.now(), category: "connection", direction: "local", message: "connect() resolved — connected!" });
      await handleConnection(conn);
      return;
    } catch (err) {
      log({
        timestamp: Date.now(),
        category: "error",
        direction: "local",
        message: `Connection attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  setStatus("disconnected", "Could not connect");
}

// --- Main ---

async function main() {
  log({ timestamp: Date.now(), category: "endpoint", direction: "local", message: "Initializing iroh debug..." });

  const params = new URLSearchParams(window.location.search);
  peerTicket = params.get("ticket");

  log({ timestamp: Date.now(), category: "endpoint", direction: "local", message: "Calling Endpoint.create()..." });
  endpoint = await Endpoint.create();
  const endpointId = endpoint.endpointId();
  log({ timestamp: Date.now(), category: "endpoint", direction: "local", message: `Endpoint created — ID: ${endpointId}` });

  endpointPill.textContent = shortId(endpointId);
  endpointPill.title = endpointId;
  endpointPill.addEventListener("click", () => {
    navigator.clipboard.writeText(endpointId);
  });

  log({ timestamp: Date.now(), category: "endpoint", direction: "local", message: "Calling endpoint.online()..." });
  await endpoint.online();
  log({ timestamp: Date.now(), category: "endpoint", direction: "local", message: "Endpoint is online" });

  const addr = endpoint.endpointAddr();
  const relayUrl = addr.relayUrl();
  addr.free();
  log({ timestamp: Date.now(), category: "endpoint", direction: "local", message: `Relay URL: ${relayUrl ?? "none"}` });
  relayPill.textContent = relayUrl ?? "no relay";

  // Run local tests in parallel with connection setup
  runLocalTests();

  if (peerTicket) {
    role = "joiner";
    log({ timestamp: Date.now(), category: "endpoint", direction: "local", message: `Mode: JOINER — connecting to ticket ${shortId(peerTicket)}` });
    await connectWithRetry();
  } else {
    role = "host";
    endpoint.setAlpns([ALPN]);
    log({ timestamp: Date.now(), category: "endpoint", direction: "local", message: `Mode: HOST — ALPN set to "${new TextDecoder().decode(ALPN)}"` });

    const hostAddr = endpoint.endpointAddr();
    const hostId = hostAddr.endpointId();
    hostAddr.free();
    const joinUrl = `${window.location.origin}${window.location.pathname}?ticket=${hostId}`;

    const npxCommand = `npx @salvatoret/iroh debug --mode connect ${hostId}`;

    joinBar.classList.add("visible");
    joinLink.href = joinUrl;
    joinLink.textContent = joinUrl;
    npxCmd.textContent = npxCommand;
    npxCmd.addEventListener("click", () => navigator.clipboard.writeText(npxCommand));
    btnCopyNpx.addEventListener("click", () => navigator.clipboard.writeText(npxCommand));

    log({ timestamp: Date.now(), category: "endpoint", direction: "local", message: `Share URL: ${joinUrl}` });

    updateHostInputState();
    await acceptLoop();
  }
}

main().catch((err) => {
  log({
    timestamp: Date.now(),
    category: "error",
    direction: "local",
    message: `Fatal: ${err instanceof Error ? err.message : String(err)}`,
  });
  setStatus("disconnected", `Error: ${err instanceof Error ? err.message : String(err)}`);
});
