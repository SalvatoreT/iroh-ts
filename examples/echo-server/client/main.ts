import {
  Endpoint,
  EndpointAddr,
  writeFramed,
  readFramed,
  type SendStream,
  type RecvStream,
} from "@salvatoret/iroh";

const ALPN = new TextEncoder().encode("iroh-echo/1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const statusEl = document.getElementById("status")!;
const serverIdInput = document.getElementById("server-id") as HTMLInputElement;
const connectBtn = document.getElementById("connect-btn") as HTMLButtonElement;
const messagesEl = document.getElementById("messages")!;
const msgInput = document.getElementById("msg-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;

let sendStream: SendStream | null = null;
let endpoint: Endpoint | null = null;

function setStatus(text: string, state?: string) {
  statusEl.textContent = text;
  if (state) statusEl.dataset.state = state;
}

function addMessage(text: string, from: "self" | "server" | "system") {
  const div = document.createElement("div");
  div.className = `msg ${from}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function writeMsg(send: SendStream, text: string) {
  await writeFramed(send, encoder.encode(text));
}

async function readLoop(recv: RecvStream) {
  try {
    for await (const frame of readFramed(recv)) {
      addMessage(decoder.decode(frame), "server");
    }
  } catch {
    // Stream error — treated as a disconnect below
  }
  onDisconnected("Disconnected from server");
}

/** Reset the UI so the user can reconnect without reloading. */
function onDisconnected(reason: string) {
  sendStream = null;
  setStatus(reason, "disconnected");
  addMessage("Connection closed.", "system");
  msgInput.disabled = true;
  sendBtn.disabled = true;
  connectBtn.disabled = false;
}

async function connect(serverId: string) {
  if (!endpoint) return;
  setStatus("Connecting...");
  connectBtn.disabled = true;

  try {
    const addr = EndpointAddr.fromEndpointId(serverId);
    const conn = await endpoint.connect(addr, ALPN);
    addr.free();

    const stream = await conn.openBi();
    sendStream = stream.send;

    // Send an initial message so the server's acceptBi resolves
    await writeMsg(sendStream, "hello");

    setStatus(`Connected to ${serverId.slice(0, 8)}...`, "connected");
    addMessage("Connected to echo server!", "system");
    msgInput.disabled = false;
    sendBtn.disabled = false;
    msgInput.focus();

    readLoop(stream.recv);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Connection failed: ${msg}`, "disconnected");
    addMessage(`Failed to connect: ${msg}`, "system");
    connectBtn.disabled = false;
  }
}

async function doSend() {
  const text = msgInput.value.trim();
  if (!text || !sendStream) return;
  msgInput.value = "";
  addMessage(text, "self");
  try {
    await writeMsg(sendStream, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    addMessage(`Send failed: ${msg}`, "system");
  }
}

msgInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSend(); });
sendBtn.addEventListener("click", doSend);
connectBtn.addEventListener("click", () => {
  const id = serverIdInput.value.trim();
  if (id) connect(id);
});

async function main() {
  setStatus("Creating endpoint...");
  endpoint = await Endpoint.create();
  await endpoint.online();
  setStatus("Ready — paste a server endpoint ID to connect");

  // Auto-connect if ?server= query param is present
  const params = new URLSearchParams(window.location.search);
  const serverId = params.get("server");
  if (serverId) {
    serverIdInput.value = serverId;
    connect(serverId);
  }
}

main().catch((err) => {
  setStatus(`Error: ${err.message}`);
  console.error(err);
});
