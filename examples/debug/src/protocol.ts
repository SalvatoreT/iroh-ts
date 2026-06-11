import {
  writeFramed as writeFrame,
  readFramed as readFrames,
  type FramedSendStream,
  type FramedRecvStream,
} from "@salvatoret/iroh";

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
  send: FramedSendStream,
  msg: DebugMessage,
): Promise<number> {
  return writeFrame(send, encodeMsg(msg));
}

/** Read length-prefixed messages from a RecvStream, calling handler for each. */
export async function readFramed(
  recv: FramedRecvStream,
  handler: (msg: DebugMessage, rawSize: number) => void,
): Promise<void> {
  for await (const frame of readFrames(recv)) {
    handler(decodeMsg(frame), 4 + frame.length);
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
