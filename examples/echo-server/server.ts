import { Endpoint, writeFramed, readFramed, type Connection } from "@salvatoret/iroh";

const ALPN = new TextEncoder().encode("iroh-echo/1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function handleConnection(conn: Connection) {
  const remoteId = conn.remoteEndpointId().slice(0, 8);
  console.log(`[connected] peer ${remoteId}...`);

  try {
    const stream = await conn.acceptBi();

    for await (const frame of readFramed(stream.recv)) {
      const text = decoder.decode(frame);
      const timestamp = new Date().toISOString().slice(11, 19);
      const reply = `[${timestamp}] echo: ${text}`;
      console.log(`  <- ${text}`);
      console.log(`  -> ${reply}`);
      await writeFramed(stream.send, encoder.encode(reply));
    }
    console.log(`[disconnected] peer ${remoteId}... (stream finished)`);
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
