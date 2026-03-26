import {
  Endpoint,
  EndpointAddr,
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

// --- Length-prefixed message protocol ---

async function writeMsg(send: SendStream, text: string) {
  const bytes = encoder.encode(text);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, bytes.length);
  await send.writeAll(len);
  await send.writeAll(bytes);
}

async function readLoop(recv: RecvStream) {
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
        if (text !== "joined") {
          addMessage(text, "peer");
        }
      }
    } catch {
      break;
    }
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

    try {
      const conn = await endpoint.accept();
      if (conn) await setupStreams(conn, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
    }
  }
}

main().catch((err) => {
  setStatus(`Error: ${err.message}`);
  console.error(err);
});
