import { Endpoint, EndpointAddr, type SendStream, type RecvStream } from "iroh";

const ALPN = new TextEncoder().encode("iroh-chat/1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const statusEl = document.getElementById("status")!;
const messagesEl = document.getElementById("messages")!;
const inputEl = document.getElementById("msg-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;

let sendStream: SendStream | null = null;

function addMessage(text: string, from: "self" | "peer") {
  const div = document.createElement("div");
  div.className = `msg ${from}`;
  div.innerHTML = `<div class="meta">${from === "self" ? "You" : "Peer"}</div>${escapeHtml(text)}`;
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

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSend();
});
sendBtn.addEventListener("click", doSend);

async function doSend() {
  const text = inputEl.value.trim();
  if (!text || !sendStream) return;
  inputEl.value = "";
  addMessage(text, "self");
  await writeMsg(sendStream, text);
}

// Length-prefixed message protocol
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
        addMessage(decoder.decode(msgBytes), "peer");
      }
    } catch {
      break;
    }
  }
}

// --- Main ---
async function main() {
  const params = new URLSearchParams(window.location.search);
  const ticket = params.get("ticket");

  const endpoint = await Endpoint.create();
  await endpoint.online();

  if (ticket) {
    // --- Join mode: open bi-stream, write immediately ---
    statusEl.textContent = "Joining chat room...";
    const addr = EndpointAddr.fromEndpointId(ticket);
    const conn = await endpoint.connect(addr, ALPN);
    statusEl.textContent = `Connected to ${conn.remoteEndpointId().slice(0, 8)}...`;
    addr.free();

    const stream = await conn.openBi();
    sendStream = stream.send;
    // Write immediately so host's acceptBi resolves
    await writeMsg(sendStream, "joined");
    enableInput();
    readLoop(stream.recv);
  } else {
    // --- Host mode: accept connection + bi-stream ---
    endpoint.setAlpns([ALPN]);
    const addr = endpoint.endpointAddr();
    const id = addr.endpointId();
    const joinUrl = `${window.location.origin}${window.location.pathname}?ticket=${id}`;
    statusEl.innerHTML = `Share this link to chat: <a href="${joinUrl}">${joinUrl}</a>`;
    addr.free();

    const conn = await endpoint.accept();
    if (!conn) {
      statusEl.textContent = "Endpoint closed.";
      return;
    }
    statusEl.innerHTML += `<br>Peer connected: ${conn.remoteEndpointId().slice(0, 8)}...`;

    // acceptBi resolves once the joiner writes
    const stream = await conn.acceptBi();
    sendStream = stream.send;
    enableInput();
    readLoop(stream.recv);
  }
}

main().catch((err) => {
  statusEl.textContent = `Error: ${err.message}`;
  console.error(err);
});
