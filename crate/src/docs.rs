use std::time::Duration;

use wasm_bindgen::prelude::*;

/// A document engine for replicated key-value documents.
///
/// Wraps an iroh Endpoint with gossip, blobs, and docs to provide
/// CRDT-based document sync.
#[wasm_bindgen]
pub struct DocEngine {
    docs: iroh_docs::protocol::Docs,
    _router: iroh::protocol::Router,
    blob_store: iroh_blobs::store::mem::MemStore,
}

#[wasm_bindgen]
impl DocEngine {
    /// Create a new document engine with in-memory storage.
    /// This creates its own Endpoint, gossip, blob store, and docs engine.
    pub async fn create() -> Result<DocEngine, JsError> {
        let transport_config = iroh::endpoint::QuicTransportConfig::builder()
            .keep_alive_interval(Duration::from_secs(5))
            .build();
        let endpoint = iroh::Endpoint::builder(iroh::endpoint::presets::N0)
            .transport_config(transport_config)
            .bind()
            .await
            .map_err(to_err)?;

        let blob_store = iroh_blobs::store::mem::MemStore::new();
        let blobs = iroh_blobs::BlobsProtocol::new(&blob_store, None);
        let downloader =
            iroh_blobs::api::downloader::Downloader::new(&blob_store, &endpoint);

        let gossip = iroh_gossip::net::Gossip::builder().spawn(endpoint.clone());

        let docs_store = iroh_docs::store::fs::Store::memory();
        let engine = iroh_docs::engine::Engine::spawn(
            endpoint.clone(),
            gossip.clone(),
            docs_store,
            (*blob_store).clone(),
            downloader,
            iroh_docs::engine::DefaultAuthorStorage::Mem,
            None,
        )
        .await
        .map_err(to_err)?;

        let docs = iroh_docs::protocol::Docs::new(engine);

        let router = iroh::protocol::Router::builder(endpoint)
            .accept(iroh_blobs::ALPN, blobs)
            .accept(iroh_gossip::net::GOSSIP_ALPN, gossip)
            .accept(iroh_docs::net::ALPN, docs.clone())
            .spawn();

        Ok(DocEngine {
            docs,
            _router: router,
            blob_store,
        })
    }

    /// Create a new document. Returns a Doc handle.
    #[wasm_bindgen(js_name = "createDoc")]
    pub async fn create_doc(&self) -> Result<Doc, JsError> {
        let doc = self.docs.api().create().await.map_err(to_err)?;
        Ok(Doc {
            inner: doc,
            blob_store: self.blob_store.clone(),
        })
    }

    /// Get the default author ID (hex string). Creates one if none exists.
    #[wasm_bindgen(js_name = "authorDefault")]
    pub async fn author_default(&self) -> Result<String, JsError> {
        let id = self.docs.api().author_default().await.map_err(to_err)?;
        Ok(id.to_string())
    }

    /// Create a new author. Returns the author ID as hex string.
    #[wasm_bindgen(js_name = "authorCreate")]
    pub async fn author_create(&self) -> Result<String, JsError> {
        let id = self.docs.api().author_create().await.map_err(to_err)?;
        Ok(id.to_string())
    }

    /// Shut down the document engine.
    pub async fn shutdown(&self) -> Result<(), JsError> {
        self._router
            .shutdown()
            .await
            .map_err(|e| JsError::new(&e.to_string()))
    }
}

/// A replicated key-value document.
#[wasm_bindgen]
pub struct Doc {
    inner: iroh_docs::api::Doc,
    blob_store: iroh_blobs::store::mem::MemStore,
}

#[wasm_bindgen]
impl Doc {
    /// Get the document's namespace ID as a hex string.
    pub fn id(&self) -> String {
        self.inner.id().to_string()
    }

    /// Set a key-value entry in the document.
    /// `author` is the author ID hex string.
    /// Returns the content hash as hex string.
    #[wasm_bindgen(js_name = "setBytes")]
    pub async fn set_bytes(
        &self,
        author: &str,
        key: &[u8],
        value: &[u8],
    ) -> Result<String, JsError> {
        let author_id: iroh_docs::AuthorId = author.parse().map_err(to_err)?;
        let hash = self
            .inner
            .set_bytes(author_id, key.to_vec(), value.to_vec())
            .await
            .map_err(to_err)?;
        Ok(hash.to_string())
    }

    /// Get the latest entry for a key by a specific author.
    /// Returns the value bytes, or null if not found.
    #[wasm_bindgen(js_name = "getExact")]
    pub async fn get_exact(
        &self,
        author: &str,
        key: &[u8],
    ) -> Result<Option<Vec<u8>>, JsError> {
        let author_id: iroh_docs::AuthorId = author.parse().map_err(to_err)?;
        let entry = self
            .inner
            .get_exact(author_id, key.to_vec(), false)
            .await
            .map_err(to_err)?;
        match entry {
            Some(entry) => {
                // Read the content from the blob store using the entry's hash
                let hash = entry.content_hash();
                let bytes = self
                    .blob_store
                    .blobs()
                    .get_bytes(hash)
                    .await
                    .map_err(to_err)?;
                Ok(Some(bytes.to_vec()))
            }
            None => Ok(None),
        }
    }

    /// Delete entries matching a prefix.
    /// Returns the number of entries deleted.
    pub async fn del(
        &self,
        author: &str,
        prefix: &[u8],
    ) -> Result<u32, JsError> {
        let author_id: iroh_docs::AuthorId = author.parse().map_err(to_err)?;
        let count = self
            .inner
            .del(author_id, prefix.to_vec())
            .await
            .map_err(to_err)?;
        Ok(count as u32)
    }

    /// Close the document.
    pub async fn close(&self) -> Result<(), JsError> {
        self.inner.close().await.map_err(to_err)
    }
}

fn to_err<E: std::fmt::Display>(e: E) -> JsError {
    JsError::new(&e.to_string())
}
