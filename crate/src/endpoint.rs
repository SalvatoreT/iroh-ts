use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Mutex;
use wasm_bindgen::prelude::*;

use crate::addr::EndpointAddr;

/// An Iroh endpoint for peer-to-peer networking.
#[wasm_bindgen]
pub struct Endpoint {
    inner: iroh::Endpoint,
}

#[wasm_bindgen]
impl Endpoint {
    /// Create a new Iroh endpoint with default n0 relay settings.
    /// Keepalive is enabled (5s interval) to prevent relay idle timeouts.
    pub async fn create() -> Result<Endpoint, JsError> {
        let transport_config = iroh::endpoint::QuicTransportConfig::builder()
            .keep_alive_interval(Duration::from_secs(5))
            .build();
        let ep = iroh::Endpoint::builder(iroh::endpoint::presets::N0)
            .transport_config(transport_config)
            .bind()
            .await
            .map_err(to_err)?;
        Ok(Endpoint { inner: ep })
    }

    /// Get the endpoint's public identifier as a hex string.
    #[wasm_bindgen(js_name = "endpointId")]
    pub fn endpoint_id(&self) -> String {
        self.inner.id().to_string()
    }

    /// Get the endpoint's address info (id + relay URL + direct addresses).
    #[wasm_bindgen(js_name = "endpointAddr")]
    pub fn endpoint_addr(&self) -> EndpointAddr {
        EndpointAddr::from(self.inner.addr())
    }

    /// Connect to a remote peer.
    pub async fn connect(
        &self,
        addr: &EndpointAddr,
        alpn: &[u8],
    ) -> Result<Connection, JsError> {
        let node_addr: iroh::EndpointAddr = addr.into();
        let conn = self.inner.connect(node_addr, alpn).await.map_err(to_err)?;
        Ok(Connection { inner: conn })
    }

    /// Set the ALPN protocols this endpoint accepts.
    #[wasm_bindgen(js_name = "setAlpns")]
    pub fn set_alpns(&self, alpns: Vec<js_sys::Uint8Array>) -> Result<(), JsError> {
        let alpns: Vec<Vec<u8>> = alpns.iter().map(|a| a.to_vec()).collect();
        self.inner.set_alpns(alpns);
        Ok(())
    }

    /// Accept an incoming connection. Returns null if the endpoint is closed.
    pub async fn accept(&self) -> Result<Option<Connection>, JsError> {
        let incoming = self.inner.accept().await;
        match incoming {
            Some(incoming) => {
                let accepting = incoming.accept().map_err(to_err)?;
                let conn = accepting.await.map_err(to_err)?;
                Ok(Some(Connection { inner: conn }))
            }
            None => Ok(None),
        }
    }

    /// Wait until the endpoint is connected to a relay server.
    /// Call this before connecting to peers to ensure addressing info is available.
    pub async fn online(&self) {
        self.inner.online().await;
    }

    /// Gracefully close the endpoint.
    pub async fn close(&self) {
        self.inner.close().await;
    }
}

/// A QUIC connection to a remote peer.
#[wasm_bindgen]
pub struct Connection {
    inner: iroh::endpoint::Connection,
}

#[wasm_bindgen]
impl Connection {
    /// Get the ALPN protocol negotiated for this connection.
    pub fn alpn(&self) -> Vec<u8> {
        self.inner.alpn().to_vec()
    }

    /// Get the remote peer's endpoint ID as a hex string.
    #[wasm_bindgen(js_name = "remoteEndpointId")]
    pub fn remote_endpoint_id(&self) -> String {
        self.inner.remote_id().to_string()
    }

    /// Open a bidirectional stream.
    #[wasm_bindgen(js_name = "openBi")]
    pub async fn open_bi(&self) -> Result<BiStream, JsError> {
        let (send, recv) = self.inner.open_bi().await.map_err(to_err)?;
        Ok(BiStream {
            send: SendStream {
                inner: Arc::new(Mutex::new(send)),
            },
            recv: RecvStream {
                inner: Arc::new(Mutex::new(recv)),
            },
        })
    }

    /// Accept an incoming bidirectional stream.
    #[wasm_bindgen(js_name = "acceptBi")]
    pub async fn accept_bi(&self) -> Result<BiStream, JsError> {
        let (send, recv) = self.inner.accept_bi().await.map_err(to_err)?;
        Ok(BiStream {
            send: SendStream {
                inner: Arc::new(Mutex::new(send)),
            },
            recv: RecvStream {
                inner: Arc::new(Mutex::new(recv)),
            },
        })
    }

    /// Open a unidirectional send stream.
    #[wasm_bindgen(js_name = "openUni")]
    pub async fn open_uni(&self) -> Result<SendStream, JsError> {
        let s = self.inner.open_uni().await.map_err(to_err)?;
        Ok(SendStream {
            inner: Arc::new(Mutex::new(s)),
        })
    }

    /// Accept an incoming unidirectional receive stream.
    #[wasm_bindgen(js_name = "acceptUni")]
    pub async fn accept_uni(&self) -> Result<RecvStream, JsError> {
        let r = self.inner.accept_uni().await.map_err(to_err)?;
        Ok(RecvStream {
            inner: Arc::new(Mutex::new(r)),
        })
    }

    /// Send an unreliable datagram.
    #[wasm_bindgen(js_name = "sendDatagram")]
    pub fn send_datagram(&self, data: &[u8]) -> Result<(), JsError> {
        self.inner
            .send_datagram(data.to_vec().into())
            .map_err(to_err)
    }

    /// Read an unreliable datagram.
    #[wasm_bindgen(js_name = "readDatagram")]
    pub async fn read_datagram(&self) -> Result<Vec<u8>, JsError> {
        let data = self.inner.read_datagram().await.map_err(to_err)?;
        Ok(data.to_vec())
    }

    /// Wait until the connection is closed and return the reason.
    pub async fn closed(&self) -> String {
        self.inner.closed().await.to_string()
    }

    /// Get the close reason if the connection is already closed.
    #[wasm_bindgen(js_name = "closeReason")]
    pub fn close_reason(&self) -> Option<String> {
        self.inner.close_reason().map(|e| e.to_string())
    }

    /// Close the connection with an error code and reason.
    pub fn close(&self, error_code: u32, reason: &[u8]) -> Result<(), JsError> {
        let code =
            iroh::endpoint::VarInt::from_u64(error_code as u64).map_err(to_err)?;
        self.inner.close(code, reason);
        Ok(())
    }

    /// Get the maximum datagram size, if datagrams are supported.
    #[wasm_bindgen(js_name = "maxDatagramSize")]
    pub fn max_datagram_size(&self) -> Option<usize> {
        self.inner.max_datagram_size()
    }

    /// Get a stable identifier for this connection.
    #[wasm_bindgen(js_name = "stableId")]
    pub fn stable_id(&self) -> usize {
        self.inner.stable_id()
    }
}

/// A bidirectional QUIC stream (send + recv pair).
#[wasm_bindgen]
pub struct BiStream {
    send: SendStream,
    recv: RecvStream,
}

#[wasm_bindgen]
impl BiStream {
    /// Get the send half of this stream.
    #[wasm_bindgen(getter)]
    pub fn send(&self) -> SendStream {
        self.send.clone()
    }

    /// Get the recv half of this stream.
    #[wasm_bindgen(getter)]
    pub fn recv(&self) -> RecvStream {
        self.recv.clone()
    }
}

/// A QUIC send stream.
#[wasm_bindgen]
#[derive(Clone)]
pub struct SendStream {
    inner: Arc<Mutex<iroh::endpoint::SendStream>>,
}

#[wasm_bindgen]
impl SendStream {
    /// Write data to the stream. Returns the number of bytes written.
    pub async fn write(&self, data: &[u8]) -> Result<usize, JsError> {
        let mut s = self.inner.lock().await;
        s.write(data).await.map_err(to_err)
    }

    /// Write all data to the stream.
    #[wasm_bindgen(js_name = "writeAll")]
    pub async fn write_all(&self, data: &[u8]) -> Result<(), JsError> {
        let mut s = self.inner.lock().await;
        s.write_all(data).await.map_err(to_err)
    }

    /// Signal that no more data will be sent on this stream.
    pub fn finish(&self) -> Result<(), JsError> {
        let mut s = self
            .inner
            .try_lock()
            .map_err(|_| JsError::new("stream is in use"))?;
        s.finish().map_err(to_err)
    }
}

/// A QUIC receive stream.
#[wasm_bindgen]
#[derive(Clone)]
pub struct RecvStream {
    inner: Arc<Mutex<iroh::endpoint::RecvStream>>,
}

#[wasm_bindgen]
impl RecvStream {
    /// Read a chunk of data from the stream (up to max_length bytes).
    /// Returns null when the stream is finished.
    #[wasm_bindgen(js_name = "readChunk")]
    pub async fn read_chunk(&self, max_length: u32) -> Result<Option<Vec<u8>>, JsError> {
        let mut r = self.inner.lock().await;
        let chunk = r
            .read_chunk(max_length as usize)
            .await
            .map_err(to_err)?;
        Ok(chunk.map(|c| c.bytes.to_vec()))
    }

    /// Read all remaining data from the stream up to a size limit (in bytes).
    #[wasm_bindgen(js_name = "readToEnd")]
    pub async fn read_to_end(&self, size_limit: u32) -> Result<Vec<u8>, JsError> {
        let mut r = self.inner.lock().await;
        r.read_to_end(size_limit as usize).await.map_err(to_err)
    }

    /// Stop reading from this stream with an error code.
    pub fn stop(&self, error_code: u32) -> Result<(), JsError> {
        let code =
            iroh::endpoint::VarInt::from_u64(error_code as u64).map_err(to_err)?;
        let mut r = self
            .inner
            .try_lock()
            .map_err(|_| JsError::new("stream is in use"))?;
        r.stop(code).map_err(to_err)
    }
}

fn to_err<E: std::fmt::Display>(e: E) -> JsError {
    JsError::new(&e.to_string())
}
