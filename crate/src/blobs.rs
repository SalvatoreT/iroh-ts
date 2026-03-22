use wasm_bindgen::prelude::*;

/// An in-memory blob store for content-addressable data.
#[wasm_bindgen]
pub struct BlobStore {
    store: iroh_blobs::store::mem::MemStore,
}

#[wasm_bindgen]
impl BlobStore {
    /// Create a new in-memory blob store.
    #[wasm_bindgen(constructor)]
    pub fn new() -> BlobStore {
        BlobStore {
            store: iroh_blobs::store::mem::MemStore::new(),
        }
    }

    /// Add bytes as a blob. Returns the BLAKE3 hash as a hex string.
    #[wasm_bindgen(js_name = "addBytes")]
    pub async fn add_bytes(&self, data: &[u8]) -> Result<String, JsError> {
        let tag_info = self
            .store
            .blobs()
            .add_slice(data)
            .await
            .map_err(to_err)?;
        Ok(tag_info.hash.to_string())
    }

    /// Read a blob's content by its hash (hex string). Returns the bytes.
    #[wasm_bindgen(js_name = "getBytes")]
    pub async fn get_bytes(&self, hash: &str) -> Result<Vec<u8>, JsError> {
        let hash: iroh_blobs::Hash = hash.parse().map_err(to_err)?;
        let bytes = self.store.blobs().get_bytes(hash).await.map_err(to_err)?;
        Ok(bytes.to_vec())
    }

    /// Check if a blob exists by its hash (hex string).
    pub async fn has(&self, hash: &str) -> Result<bool, JsError> {
        let hash: iroh_blobs::Hash = hash.parse().map_err(to_err)?;
        self.store.blobs().has(hash).await.map_err(to_err)
    }

    /// List all blob hashes in the store. Returns an array of hex hash strings.
    pub async fn list(&self) -> Result<Vec<String>, JsError> {
        let hashes = self
            .store
            .blobs()
            .list()
            .hashes()
            .await
            .map_err(to_err)?;
        Ok(hashes.iter().map(|h| h.to_string()).collect())
    }
}

fn to_err<E: std::fmt::Display>(e: E) -> JsError {
    JsError::new(&e.to_string())
}
