import {
  Endpoint,
  EndpointAddr,
  type Connection,
  type SendStream,
  type RecvStream,
} from "@salvatoret/iroh";

const ALPN = new TextEncoder().encode("iroh-chat/1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const statusEl = document.getElementById("status")!;
const statusTextEl = document.getElementById("status-text")!;
const messagesEl = document.getElementById("messages")!;
const inputEl = document.getElementById("msg-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;

// --- Module-scope state ---
type ChatState = "connecting" | "connected" | "disconnected" | "reconnecting";
let state: ChatState = "connecting";
let sendStream: SendStream | null = null;
let endpoint: Endpoint | null = null;
let role: "host" | "joiner" = "host";
let peerTicket: string | null = null;
let connGeneration = 0; // Incremented on each new connection to ignore stale callbacks

// Control messages that shouldn't be displayed
const CONTROL_MESSAGES = ["joined"];

// --- UI helpers ---

function updateState(newState: ChatState, detail?: string) {
  state = newState;
  document.body.dataset.state = newState;
  if (detail) statusTextEl.textContent = detail;
  if (newState === "connected") {
    inputEl.disabled = false;
    sendBtn.disabled = false;
    inputEl.focus();
  } else {
    inputEl.disabled = true;
    sendBtn.disabled = true;
  }
}

function addMessage(text: string, from: "self" | "peer") {
  const div = document.createElement("div");
  div.className = `msg ${from}`;
  div.innerHTML = `<div class="meta">${from === "self" ? "You" : "Peer"}</div>${escapeHtml(text)}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addSystemMessage(text: string) {
  const div = document.createElement("div");
  div.className = "msg system";
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(s: string): string {
  const el = document.createElement("span");
  el.textContent = s;
  return el.innerHTML;
}

// --- Message protocol (length-prefixed) ---

async function writeMsg(send: SendStream, text: string) {
  const bytes = encoder.encode(text);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, bytes.length);
  await send.writeAll(len);
  await send.writeAll(bytes);
}

async function readLoop(recv: RecvStream, gen: number) {
  const buf: number[] = [];
  while (true) {
    try {
      const chunk = await recv.readChunk(4096);
      if (chunk === undefined || chunk === null) break;
      for (let i = 0; i < chunk.length; i++) buf.push(chunk[i]);
      while (buf.length >= 4) {
        const len = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
        if (buf.length < 4 + len) break;
        const msgBytes = new Uint8Array(buf.splice(0, 4 + len).slice(4));
        const text = decoder.decode(msgBytes);
        if (!CONTROL_MESSAGES.includes(text)) {
          addMessage(text, "peer");
        }
      }
    } catch {
      break;
    }
  }
  // Only handle disconnect if this is still the active connection
  if (gen === connGeneration) {
    addSystemMessage("Peer disconnected.");
    handleDisconnect();
  }
}

// --- Send ---

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSend();
});
sendBtn.addEventListener("click", doSend);

async function doSend() {
  const text = inputEl.value.trim();
  if (!text || !sendStream) return;
  inputEl.value = "";
  addMessage(text, "self");
  try {
    await writeMsg(sendStream, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    addSystemMessage(`Send failed: ${msg}`);
    handleDisconnect();
  }
}

// --- Connection management ---

function handleDisconnect() {
  if (state === "disconnected" || state === "reconnecting") return;
  sendStream = null;
  updateState("disconnected", "Disconnected");
  addSystemMessage("Peer disconnected.");
  if (role === "joiner") {
    // Joiner auto-reconnects after a short delay
    setTimeout(() => connectWithRetry(), 2000);
  }
  // Host doesn't need to reconnect — acceptLoop is always running
}

/** Wire up a connection's streams and monitor for closure. */
async function setupStreams(conn: Connection) {
  connGeneration++;
  const gen = connGeneration;

  if (role === "host") {
    const stream = await conn.acceptBi();
    sendStream = stream.send;
    readLoop(stream.recv, gen);
  } else {
    const stream = await conn.openBi();
    sendStream = stream.send;
    await writeMsg(sendStream, "joined");
    readLoop(stream.recv, gen);
  }
  updateState("connected", `Connected to ${conn.remoteEndpointId().slice(0, 8)}...`);
  addSystemMessage("Peer connected!");

  // Monitor connection in the background — ignore if superseded by a newer connection
  conn.closed().then((reason) => {
    if (gen === connGeneration) {
      addSystemMessage(`Connection closed: ${reason}`);
      handleDisconnect();
    }
  });
}

// --- Host: continuous accept loop ---

/**
 * The host always has an accept() pending so new/reconnecting peers
 * connect immediately without waiting for disconnect detection.
 */
async function acceptLoop() {
  while (true) {
    try {
      const conn = await endpoint!.accept();
      if (!conn) break;
      await setupStreams(conn);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addSystemMessage(`Accept error: ${msg}`);
      // Brief pause before re-accepting
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
      updateState("reconnecting", `Retrying connection (${attempt}/${MAX_ATTEMPTS - 1})...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
    } else {
      updateState("connecting", "Joining chat room...");
    }
    try {
      const addr = EndpointAddr.fromEndpointId(peerTicket!);
      const conn = await endpoint!.connect(addr, ALPN);
      addr.free();
      await setupStreams(conn);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addSystemMessage(`Connection attempt ${attempt + 1} failed: ${msg}`);
    }
  }
  updateState("disconnected", "Could not connect");
  addSystemMessage("Could not connect to host. Please reload the page.");
}

// --- Main ---

async function main() {
  const params = new URLSearchParams(window.location.search);
  peerTicket = params.get("ticket");

  endpoint = await Endpoint.create();
  await endpoint.online();

  if (peerTicket) {
    role = "joiner";
    await connectWithRetry();
  } else {
    role = "host";
    endpoint.setAlpns([ALPN]);
    const addr = endpoint.endpointAddr();
    const id = addr.endpointId();
    const joinUrl = `${window.location.origin}${window.location.pathname}?ticket=${id}`;
    statusTextEl.innerHTML = `Share this link to chat: <a href="${joinUrl}">${joinUrl}</a>`;
    addr.free();

    // Accept loop runs forever — handles initial + reconnecting peers
    await acceptLoop();
  }
}

main().catch((err) => {
  statusTextEl.textContent = `Error: ${err.message}`;
  console.error(err);
});
