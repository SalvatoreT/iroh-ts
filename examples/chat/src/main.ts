import { Endpoint, EndpointAddr, type Connection } from "iroh";

const ALPN = new TextEncoder().encode("iroh-chat/1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const statusEl = document.getElementById("status")!;
const messagesEl = document.getElementById("messages")!;
const inputEl = document.getElementById("msg-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;

let connection: Connection | null = null;

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

function doSend() {
  const text = inputEl.value.trim();
  if (!text || !connection) return;
  inputEl.value = "";
  addMessage(text, "self");
  connection.sendDatagram(encoder.encode(text));
}

// Read datagrams in a loop
async function receiveLoop(conn: Connection) {
  while (true) {
    try {
      const data = await conn.readDatagram();
      addMessage(decoder.decode(data), "peer");
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
    // --- Join mode ---
    statusEl.textContent = "Joining chat room...";
    const addr = EndpointAddr.fromEndpointId(ticket);
    const conn = await endpoint.connect(addr, ALPN);
    connection = conn;
    statusEl.textContent = `Connected to ${conn.remoteEndpointId().slice(0, 8)}...`;
    enableInput();
    addr.free();
    receiveLoop(conn);
  } else {
    // --- Host mode ---
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
    connection = conn;
    statusEl.innerHTML += `<br>Peer connected: ${conn.remoteEndpointId().slice(0, 8)}...`;
    enableInput();
    receiveLoop(conn);
  }
}

main().catch((err) => {
  statusEl.textContent = `Error: ${err.message}`;
  console.error(err);
});
