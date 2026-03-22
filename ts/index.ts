// Default re-export — consumers should use "iroh" which resolves
// via package.json exports to node.ts or browser.ts automatically.
export {
  Endpoint,
  EndpointAddr,
  Connection,
  BiStream,
  SendStream,
  RecvStream,
  BlobStore,
  DocEngine,
  Doc,
} from "../crate/pkg/nodejs/iroh_ts.js";
