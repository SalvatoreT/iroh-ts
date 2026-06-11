import {
  Endpoint,
  EndpointAddr,
  writeFramed,
  readFramed,
  type Connection,
  type SendStream,
  type RecvStream,
} from "@salvatoret/iroh";

const ALPN = new TextEncoder().encode("iroh-p2p-chat/1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const statusEl = document.getElementById("status")!;
const messagesEl = document.getElementById("messages")!;
const inputEl = document.getElementById("msg-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;

let sendStream: SendStream | null = null;

// --- UI helpers ---

function setStatus(html: string) {
  statusEl.innerHTML = html;
}

function addMessage(text: string, from: "self" | "peer" | "system") {
  const div = document.createElement("div");
  div.className = `msg ${from}`;
  if (from === "system") {
    div.textContent = text;
  } else {
    div.innerHTML = `<div class="meta">${from === "self" ? "You" : "Peer"}</div>${escapeHtml(text)}`;
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(s: string): string {
  const el = document.createElement("span");
  el.textContent = s;
  return el.innerHTML;
}

function enableInput() {
  inputEl.disabled = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

function disableInput() {
  inputEl.disabled = true;
  sendBtn.disabled = true;
}

// --- Length-prefixed message protocol (via library framing helpers) ---

async function writeMsg(send: SendStream, text: string) {
  await writeFramed(send, encoder.encode(text));
}

async function readLoop(recv: RecvStream) {
  try {
    for await (const frame of readFramed(recv)) {
      const text = decoder.decode(frame);
      if (text !== "joined") {
        addMessage(text, "peer");
      }
    }
  } catch {
    // Stream error — treated as a disconnect below
  }
  addMessage("Peer disconnected.", "system");
  disableInput();
}

// --- Send ---

async function doSend() {
  const text = inputEl.value.trim();
  if (!text || !sendStream) return;
  inputEl.value = "";
  addMessage(text, "self");
  try {
    await writeMsg(sendStream, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    addMessage(`Send failed: ${msg}`, "system");
  }
}

inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") doSend(); });
sendBtn.addEventListener("click", doSend);

// --- Connection setup ---

async function setupStreams(conn: Connection, isHost: boolean) {
  if (isHost) {
    const stream = await conn.acceptBi();
    sendStream = stream.send;
    readLoop(stream.recv);
  } else {
    const stream = await conn.openBi();
    sendStream = stream.send;
    await writeMsg(sendStream, "joined");
    readLoop(stream.recv);
  }

  setStatus(`Connected to ${conn.remoteEndpointId().slice(0, 8)}...`);
  addMessage("Peer connected!", "system");
  enableInput();
}

// --- Main ---

async function main() {
  setStatus("Creating endpoint...");

  const endpoint = await Endpoint.create();
  await endpoint.online();

  const params = new URLSearchParams(window.location.search);
  const ticket = params.get("ticket");

  if (ticket) {
    // Joiner mode
    setStatus("Connecting to peer...");
    try {
      const addr = EndpointAddr.fromEndpointId(ticket);
      const conn = await endpoint.connect(addr, ALPN);
      addr.free();
      await setupStreams(conn, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Connection failed: ${msg}`);
      addMessage(`Could not connect. Please check the link and try again.`, "system");
    }
  } else {
    // Host mode
    endpoint.setAlpns([ALPN]);
    const addr = endpoint.endpointAddr();
    const id = addr.endpointId();
    addr.free();

    const joinUrl = `${window.location.origin}${window.location.pathname}?ticket=${id}`;
    setStatus(`Share this link to chat: <a href="${joinUrl}">${joinUrl}</a>`);
    addMessage("Waiting for a peer to connect...", "system");

    // Keep accepting so the host survives failed joins and disconnects —
    // a new peer simply replaces the previous one.
    while (true) {
      try {
        const conn = await endpoint.accept();
        if (!conn) break;
        await setupStreams(conn, true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus(`Error: ${msg}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

main().catch((err) => {
  setStatus(`Error: ${err.message}`);
  console.error(err);
});
