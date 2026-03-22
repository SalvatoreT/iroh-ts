import { describe, it, expect } from "vitest";
import { Endpoint, EndpointAddr } from "../crate/pkg/iroh_ts.js";

describe("EndpointAddr", () => {
  it("should create from endpoint ID and round-trip", () => {
    const hexId =
      "ae58ff8833241ac82d6ff7611046ed67b5072d142c588d0063e942d9a75502b6";
    const addr = EndpointAddr.fromEndpointId(hexId);
    expect(addr.endpointId()).toBe(hexId);
    addr.free();
  });

  it("should return relay URL as undefined when none set", () => {
    const hexId =
      "ae58ff8833241ac82d6ff7611046ed67b5072d142c588d0063e942d9a75502b6";
    const addr = EndpointAddr.fromEndpointId(hexId);
    expect(addr.relayUrl()).toBeUndefined();
    addr.free();
  });
});

describe("Endpoint", () => {
  it("should create an endpoint and get its ID", async () => {
    const ep = await Endpoint.create();
    const id = ep.endpointId();
    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
    expect(id.length).toBe(64); // 32 bytes hex-encoded
    await ep.close();
    ep.free();
  });

  it("should get endpoint address with relay URL after going online", async () => {
    const ep = await Endpoint.create();
    await ep.online();
    const addr = ep.endpointAddr();
    expect(addr.endpointId()).toBe(ep.endpointId());
    const relayUrl = addr.relayUrl();
    expect(relayUrl).toBeDefined();
    addr.free();
    await ep.close();
    ep.free();
  });
});

describe("Connections", () => {
  const ALPN = new TextEncoder().encode("iroh-ts/test/1");

  it("should connect two endpoints and exchange data via bidirectional stream", async () => {
    // Create two endpoints and wait for relay connectivity
    const ep1 = await Endpoint.create();
    const ep2 = await Endpoint.create();
    await Promise.all([ep1.online(), ep2.online()]);

    // Set ALPNs on the accepting endpoint
    ep2.setAlpns([ALPN]);

    // Connect + accept must run concurrently
    const ep2Addr = ep2.endpointAddr();
    const [conn1, conn2] = await Promise.all([
      ep1.connect(ep2Addr, ALPN),
      ep2.accept(),
    ]);
    expect(conn1).toBeDefined();
    expect(conn2).not.toBeNull();

    // Verify remote IDs match
    expect(conn1.remoteEndpointId()).toBe(ep2.endpointId());
    expect(conn2!.remoteEndpointId()).toBe(ep1.endpointId());

    // IMPORTANT: accept_bi won't resolve until the opener writes to its SendStream.
    // So we open the stream and write first, then accept on the other side.
    const stream1 = await conn1.openBi();

    // Write data immediately — this is required for acceptBi to resolve
    const message = new TextEncoder().encode("hello from ep1");
    await stream1.send.writeAll(message);
    stream1.send.finish();

    // Now the other side can accept the stream
    const stream2 = await conn2!.acceptBi();

    // Read data on ep2
    const received = await stream2.recv.readToEnd(1024);
    expect(new TextDecoder().decode(received)).toBe("hello from ep1");

    // Send response from ep2 to ep1
    const response = new TextEncoder().encode("hello from ep2");
    await stream2.send.writeAll(response);
    stream2.send.finish();

    // Read response on ep1
    const receivedResponse = await stream1.recv.readToEnd(1024);
    expect(new TextDecoder().decode(receivedResponse)).toBe("hello from ep2");

    // Cleanup
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
