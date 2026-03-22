import { Endpoint, EndpointAddr } from "iroh";

const ALPN = new TextEncoder().encode("iroh-chat/1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const statusEl = document.getElementById("status")!;
const messagesEl = document.getElementById("messages")!;
const inputEl = document.getElementById("msg-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;

let sendMessage: ((text: string) => Promise<void>) | null = null;

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
  if (e.key === "Enter" && sendMessage) {
    doSend();
  }
});
sendBtn.addEventListener("click", doSend);

async function doSend() {
  const text = inputEl.value.trim();
  if (!text || !sendMessage) return;
  inputEl.value = "";
  addMessage(text, "self");
  await sendMessage(text);
}

// --- Protocol: length-prefixed messages ---
async function writeMessage(
  send: { writeAll: (d: Uint8Array) => Promise<void> },
  text: string,
) {
  const bytes = encoder.encode(text);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, bytes.length);
  await send.writeAll(len);
  await send.writeAll(bytes);
}

async function readMessages(
  recv: { readToEnd: (limit: number) => Promise<Uint8Array> },
  onMessage: (text: string) => void,
) {
  // Read all data and parse length-prefixed messages
  try {
    const all = await recv.readToEnd(1024 * 1024);
    let offset = 0;
    while (offset + 4 <= all.length) {
      const len = new DataView(all.buffer, all.byteOffset + offset, 4).getUint32(0);
      offset += 4;
      if (offset + len > all.length) break;
      const text = decoder.decode(all.subarray(offset, offset + len));
      onMessage(text);
      offset += len;
    }
  } catch {
    // Stream ended
  }
}

// --- Main ---
async function main() {
  const params = new URLSearchParams(window.location.search);
  const ticket = params.get("ticket");

  const endpoint = await Endpoint.create();
  await endpoint.online();

  if (ticket) {
    // --- Join mode ---
    statusEl.textContent = "Joining chat room...";
    const addr = EndpointAddr.fromEndpointId(ticket.split("@")[0]);
    const conn = await endpoint.connect(addr, ALPN);
    statusEl.textContent = `Connected to ${conn.remoteEndpointId().slice(0, 8)}...`;

    // Open a bi-stream for sending
    const stream = await conn.openBi();

    // Write a hello to trigger acceptBi on host
    await writeMessage(stream.send, "👋 joined the chat");

    sendMessage = async (text: string) => {
      await writeMessage(stream.send, text);
    };

    enableInput();

    // Read responses
    readMessages(stream.recv, (text) => addMessage(text, "peer"));
  } else {
    // --- Host mode ---
    endpoint.setAlpns([ALPN]);
    const addr = endpoint.endpointAddr();
    const id = addr.endpointId();
    const joinUrl = `${window.location.origin}${window.location.pathname}?ticket=${id}`;

    statusEl.innerHTML = `Share this link to chat: <a href="${joinUrl}">${joinUrl}</a>`;

    // Accept one connection
    const conn = await endpoint.accept();
    if (!conn) {
      statusEl.textContent = "Endpoint closed.";
      return;
    }
    statusEl.innerHTML += `<br>Peer connected: ${conn.remoteEndpointId().slice(0, 8)}...`;

    // Accept the bi-stream (peer writes first)
    const stream = await conn.acceptBi();

    sendMessage = async (text: string) => {
      await writeMessage(stream.send, text);
    };

    enableInput();

    // Read incoming messages
    readMessages(stream.recv, (text) => addMessage(text, "peer"));
  }
}

main().catch((err) => {
  statusEl.textContent = `Error: ${err.message}`;
  console.error(err);
});
