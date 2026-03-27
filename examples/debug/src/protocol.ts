export const ALPN = new TextEncoder().encode("iroh-debug/1");

export type DebugMessage =
  | { kind: "ping"; seq: number; timestamp: number }
  | { kind: "pong"; seq: number; timestamp: number }
  | { kind: "data"; payload: string; timestamp: number }
  | { kind: "datagram-ping"; seq: number; timestamp: number }
  | { kind: "datagram-pong"; seq: number; timestamp: number }
  | { kind: "uni-data"; payload: string; timestamp: number }
  | { kind: "done"; timestamp: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeMsg(msg: DebugMessage): Uint8Array {
  return encoder.encode(JSON.stringify(msg));
}

export function decodeMsg(data: Uint8Array): DebugMessage {
  return JSON.parse(decoder.decode(data));
}

/** Write a length-prefixed message to a SendStream. */
export async function writeFramed(
  send: { writeAll(data: Uint8Array): Promise<void> },
  msg: DebugMessage,
): Promise<number> {
  const bytes = encodeMsg(msg);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, bytes.length);
  await send.writeAll(len);
  await send.writeAll(bytes);
  return 4 + bytes.length;
}

/** Read length-prefixed messages from a RecvStream, calling handler for each. */
export async function readFramed(
  recv: { readChunk(max: number): Promise<Uint8Array | null | undefined> },
  handler: (msg: DebugMessage, rawSize: number) => void,
): Promise<void> {
  const buf: number[] = [];
  while (true) {
    const chunk = await recv.readChunk(4096);
    if (chunk === undefined || chunk === null) break;
    for (let i = 0; i < chunk.length; i++) buf.push(chunk[i]);
    while (buf.length >= 4) {
      const len = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
      if (buf.length < 4 + len) break;
      const raw = buf.splice(0, 4 + len);
      const msgBytes = new Uint8Array(raw.slice(4));
      handler(decodeMsg(msgBytes), 4 + len);
    }
  }
}

export function hexDump(data: Uint8Array, maxBytes = 64): string {
  const slice = data.slice(0, maxBytes);
  const hex = Array.from(slice)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  return data.length > maxBytes ? `${hex} ... (${data.length} bytes total)` : hex;
}

export function shortId(id: string): string {
  return id.slice(0, 12) + "...";
}
