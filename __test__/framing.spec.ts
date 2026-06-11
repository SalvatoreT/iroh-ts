import { describe, it, expect } from "vitest";
import { Endpoint } from "../crate/pkg/nodejs/iroh_ts.js";
import {
  writeFramed,
  readFramed,
  writeJson,
  readJson,
  type FramedRecvStream,
  type FramedSendStream,
} from "../ts/framing";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A recv stream that serves a fixed byte sequence in chunks of `chunkSize`. */
function mockRecv(bytes: Uint8Array, chunkSize: number): FramedRecvStream {
  let offset = 0;
  return {
    async readChunk(maxLength: number) {
      if (offset >= bytes.length) return undefined;
      const take = Math.min(chunkSize, maxLength, bytes.length - offset);
      const chunk = bytes.slice(offset, offset + take);
      offset += take;
      return chunk;
    },
  };
}

/** A send stream that records everything written to it. */
function mockSend(): FramedSendStream & { bytes(): Uint8Array } {
  const parts: Uint8Array[] = [];
  return {
    async writeAll(data: Uint8Array) {
      parts.push(data.slice());
    },
    bytes() {
      const total = parts.reduce((n, p) => n + p.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const p of parts) {
        out.set(p, off);
        off += p.length;
      }
      return out;
    },
  };
}

async function collect(recv: FramedRecvStream, opts?: { maxFrameBytes?: number }) {
  const frames: Uint8Array[] = [];
  for await (const frame of readFramed(recv, opts)) frames.push(frame);
  return frames;
}

describe("framing (unit)", () => {
  it("round-trips multiple frames through write + read", async () => {
    const send = mockSend();
    await writeFramed(send, encoder.encode("first"));
    await writeFramed(send, encoder.encode("second message"));
    await writeFramed(send, new Uint8Array([0, 1, 2, 255]));

    const frames = await collect(mockRecv(send.bytes(), 4096));
    expect(frames).toHaveLength(3);
    expect(decoder.decode(frames[0])).toBe("first");
    expect(decoder.decode(frames[1])).toBe("second message");
    expect([...frames[2]]).toEqual([0, 1, 2, 255]);
  });

  it("writes each frame as a single writeAll call (no header/body interleaving)", async () => {
    const parts: Uint8Array[] = [];
    const send: FramedSendStream = {
      async writeAll(data) {
        parts.push(data);
      },
    };
    await writeFramed(send, encoder.encode("hello"));
    expect(parts).toHaveLength(1);
    expect(parts[0].length).toBe(4 + 5);
  });

  it("reassembles a frame split across many tiny chunks", async () => {
    const send = mockSend();
    await writeFramed(send, encoder.encode("split across chunks"));
    // 1-byte chunks: header and payload arrive byte by byte
    const frames = await collect(mockRecv(send.bytes(), 1));
    expect(frames).toHaveLength(1);
    expect(decoder.decode(frames[0])).toBe("split across chunks");
  });

  it("handles several frames coalesced into one chunk", async () => {
    const send = mockSend();
    for (let i = 0; i < 5; i++) await writeFramed(send, encoder.encode(`msg ${i}`));
    const frames = await collect(mockRecv(send.bytes(), 1 << 20));
    expect(frames.map((f) => decoder.decode(f))).toEqual([
      "msg 0", "msg 1", "msg 2", "msg 3", "msg 4",
    ]);
  });

  it("supports zero-length frames", async () => {
    const send = mockSend();
    await writeFramed(send, new Uint8Array(0));
    await writeFramed(send, encoder.encode("after empty"));
    const frames = await collect(mockRecv(send.bytes(), 4096));
    expect(frames).toHaveLength(2);
    expect(frames[0].length).toBe(0);
    expect(decoder.decode(frames[1])).toBe("after empty");
  });

  it("handles frames larger than the read chunk size", async () => {
    const payload = new Uint8Array(300_000).map((_, i) => i % 251);
    const send = mockSend();
    await writeFramed(send, payload);
    const frames = await collect(mockRecv(send.bytes(), 4096));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual(payload);
  });

  it("decodes lengths unsigned — a huge declared length errors instead of going negative", async () => {
    // Header claims 0x80000001 bytes (negative as a signed 32-bit int).
    // The old hand-rolled parsers computed a negative length here and
    // misbehaved; the helper must reject it via the max-frame guard.
    const header = new Uint8Array([0x80, 0x00, 0x00, 0x01, 1, 2, 3]);
    await expect(collect(mockRecv(header, 4096))).rejects.toThrow(/exceeds maxFrameBytes/);
  });

  it("rejects frames over maxFrameBytes", async () => {
    const send = mockSend();
    await writeFramed(send, new Uint8Array(2048));
    await expect(
      collect(mockRecv(send.bytes(), 4096), { maxFrameBytes: 1024 }),
    ).rejects.toThrow(/exceeds maxFrameBytes/);
  });

  it("throws if the stream ends mid-frame", async () => {
    const send = mockSend();
    await writeFramed(send, encoder.encode("complete"));
    const bytes = send.bytes();
    const truncated = bytes.slice(0, bytes.length - 3);
    await expect(collect(mockRecv(truncated, 4096))).rejects.toThrow(/mid-frame/);
  });

  it("round-trips JSON values via writeJson/readJson", async () => {
    const send = mockSend();
    await writeJson(send, { kind: "ping", seq: 1 });
    await writeJson(send, [1, "two", null]);
    const values: unknown[] = [];
    for await (const v of readJson(mockRecv(send.bytes(), 8))) values.push(v);
    expect(values).toEqual([{ kind: "ping", seq: 1 }, [1, "two", null]]);
  });
});

describe("framing (integration over real iroh streams)", () => {
  const ALPN = new TextEncoder().encode("iroh-ts/framing-test/1");

  it("round-trips frames between two endpoints", async () => {
    const ep1 = await Endpoint.create();
    const ep2 = await Endpoint.create();
    await Promise.all([ep1.online(), ep2.online()]);
    ep2.setAlpns([ALPN]);

    const ep2Addr = ep2.endpointAddr();
    const [conn1, conn2] = await Promise.all([ep1.connect(ep2Addr, ALPN), ep2.accept()]);

    // Opener writes first so acceptBi resolves
    const stream1 = await conn1.openBi();
    await writeJson(stream1.send, { kind: "hello", n: 1 });
    const big = new Uint8Array(150_000).map((_, i) => (i * 7) % 256);
    await writeFramed(stream1.send, big);
    await writeFramed(stream1.send, new Uint8Array(0));
    stream1.send.finish();

    const stream2 = await conn2!.acceptBi();
    const received: Uint8Array[] = [];
    for await (const frame of readFramed(stream2.recv)) received.push(frame);

    expect(received).toHaveLength(3);
    expect(JSON.parse(decoder.decode(received[0]))).toEqual({ kind: "hello", n: 1 });
    expect(received[1]).toEqual(big);
    expect(received[2].length).toBe(0);

    // Reply on the same stream pair, the other direction
    await writeJson(stream2.send, { kind: "ack" });
    stream2.send.finish();
    const replies: unknown[] = [];
    for await (const v of readJson(stream1.recv)) replies.push(v);
    expect(replies).toEqual([{ kind: "ack" }]);

    stream1.free();
    stream2.free();
    conn1.close(0, new Uint8Array());
    conn2!.close(0, new Uint8Array());
    ep2Addr.free();
    await ep1.close();
    await ep2.close();
    ep1.free();
    ep2.free();
  }, 30000);
});
