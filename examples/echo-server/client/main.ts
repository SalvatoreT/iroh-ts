import {
  Endpoint,
  EndpointAddr,
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
        addMessage(decoder.decode(msgBytes), "server");
      }
    } catch {
      break;
    }
  }
  setStatus("Disconnected from server", "disconnected");
  addMessage("Connection closed.", "system");
  msgInput.disabled = true;
  sendBtn.disabled = true;
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

    conn.closed().then((reason) => {
      setStatus(`Disconnected: ${reason}`, "disconnected");
      sendStream = null;
      msgInput.disabled = true;
      sendBtn.disabled = true;
    });
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
