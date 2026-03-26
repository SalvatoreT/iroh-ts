import { Endpoint, type Connection, type SendStream, type RecvStream } from "@salvatoret/iroh";

const ALPN = new TextEncoder().encode("iroh-echo/1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function writeMsg(send: SendStream, text: string) {
  const bytes = encoder.encode(text);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, bytes.length);
  await send.writeAll(len);
  await send.writeAll(bytes);
}

async function handleConnection(conn: Connection) {
  const remoteId = conn.remoteEndpointId().slice(0, 8);
  console.log(`[connected] peer ${remoteId}...`);

  try {
    const stream = await conn.acceptBi();
    const send = stream.send;
    const recv = stream.recv;

    const buf: number[] = [];
    while (true) {
      const chunk = await recv.readChunk(4096);
      if (chunk === undefined || chunk === null) break;

      for (let i = 0; i < chunk.length; i++) buf.push(chunk[i]);

      while (buf.length >= 4) {
        const len = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
        if (buf.length < 4 + len) break;
        const msgBytes = new Uint8Array(buf.splice(0, 4 + len).slice(4));
        const text = decoder.decode(msgBytes);
        const timestamp = new Date().toISOString().slice(11, 19);
        const reply = `[${timestamp}] echo: ${text}`;
        console.log(`  <- ${text}`);
        console.log(`  -> ${reply}`);
        await writeMsg(send, reply);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[disconnected] peer ${remoteId}... (${msg})`);
  }
}

async function main() {
  console.log("Starting iroh echo server...\n");

  const endpoint = await Endpoint.create();
  await endpoint.online();

  endpoint.setAlpns([ALPN]);

  const addr = endpoint.endpointAddr();
  const id = addr.endpointId();
  addr.free();

  console.log("Echo server is online!\n");
  console.log(`  Endpoint ID: ${id}\n`);
  console.log("Open the browser client and paste this ID to connect.");
  console.log("Or use the query param: ?server=" + id);
  console.log("\nWaiting for connections...\n");

  while (true) {
    try {
      const conn = await endpoint.accept();
      if (!conn) break;
      handleConnection(conn);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Accept error: ${msg}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
