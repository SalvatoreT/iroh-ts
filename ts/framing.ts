// Length-prefixed message framing over iroh QUIC streams.
//
// Wire format: each frame is a 4-byte big-endian unsigned length followed by
// that many payload bytes. A frame is written as a single writeAll call so
// concurrent writers on the same stream cannot interleave a frame's header
// and body (callers still must not write the same stream concurrently).

/** Minimal send-stream shape (matches the WASM SendStream). */
export interface FramedSendStream {
  writeAll(data: Uint8Array): Promise<void>;
}

/** Minimal recv-stream shape (matches the WASM RecvStream). */
export interface FramedRecvStream {
  readChunk(maxLength: number): Promise<Uint8Array | null | undefined>;
}

export interface ReadFramedOptions {
  /** Maximum accepted frame size in bytes. Defaults to 16 MiB. */
  maxFrameBytes?: number;
  /** Bytes requested per readChunk call. Defaults to 64 KiB. */
  chunkBytes?: number;
}

const DEFAULT_MAX_FRAME_BYTES = 16 * 1024 * 1024;
const DEFAULT_CHUNK_BYTES = 64 * 1024;

/**
 * Write one length-prefixed frame. Returns the total bytes written
 * (payload + 4-byte header).
 */
export async function writeFramed(
  send: FramedSendStream,
  payload: Uint8Array,
): Promise<number> {
  const frame = new Uint8Array(4 + payload.length);
  new DataView(frame.buffer).setUint32(0, payload.length);
  frame.set(payload, 4);
  await send.writeAll(frame);
  return frame.length;
}

/**
 * Read length-prefixed frames until the stream finishes (FIN).
 *
 * Yields one Uint8Array per frame. Throws if a frame exceeds maxFrameBytes
 * or if the stream ends in the middle of a frame.
 */
export async function* readFramed(
  recv: FramedRecvStream,
  opts: ReadFramedOptions = {},
): AsyncGenerator<Uint8Array, void, void> {
  const maxFrameBytes = opts.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
  const chunkBytes = opts.chunkBytes ?? DEFAULT_CHUNK_BYTES;

  let buf: Uint8Array = new Uint8Array(0);
  while (true) {
    const chunk = await recv.readChunk(chunkBytes);
    if (chunk === null || chunk === undefined) {
      if (buf.length > 0) {
        throw new Error(
          `stream ended mid-frame (${buf.length} trailing bytes)`,
        );
      }
      return;
    }

    if (buf.length === 0) {
      buf = chunk;
    } else {
      const merged = new Uint8Array(buf.length + chunk.length);
      merged.set(buf, 0);
      merged.set(chunk, buf.length);
      buf = merged;
    }

    while (buf.length >= 4) {
      const len = new DataView(buf.buffer, buf.byteOffset).getUint32(0);
      if (len > maxFrameBytes) {
        throw new Error(
          `frame of ${len} bytes exceeds maxFrameBytes (${maxFrameBytes})`,
        );
      }
      if (buf.length < 4 + len) break;
      yield buf.slice(4, 4 + len);
      buf = buf.slice(4 + len);
    }
  }
}

const jsonEncoder = new TextEncoder();
const jsonDecoder = new TextDecoder();

/** Write a value as one JSON-encoded frame. Returns total bytes written. */
export async function writeJson(
  send: FramedSendStream,
  value: unknown,
): Promise<number> {
  return writeFramed(send, jsonEncoder.encode(JSON.stringify(value)));
}

/** Read JSON-encoded frames until the stream finishes. */
export async function* readJson<T = unknown>(
  recv: FramedRecvStream,
  opts: ReadFramedOptions = {},
): AsyncGenerator<T, void, void> {
  for await (const frame of readFramed(recv, opts)) {
    yield JSON.parse(jsonDecoder.decode(frame)) as T;
  }
}
