pub mod addr;
pub mod blobs;
pub mod docs;
pub mod endpoint;

/// Convert any displayable error into a `JsError` for the JS boundary.
pub(crate) fn to_err<E: std::fmt::Display>(e: E) -> wasm_bindgen::JsError {
    wasm_bindgen::JsError::new(&e.to_string())
}
