use wasm_bindgen::prelude::*;

/// Address information for an Iroh endpoint (ID + relay URL + direct addresses).
#[wasm_bindgen]
#[derive(Clone)]
pub struct EndpointAddr {
    inner: iroh::EndpointAddr,
}

#[wasm_bindgen]
impl EndpointAddr {
    /// Create an EndpointAddr from just an endpoint ID (hex string).
    #[wasm_bindgen(js_name = "fromEndpointId")]
    pub fn from_endpoint_id(id: &str) -> Result<EndpointAddr, JsError> {
        let pk: iroh::PublicKey = id.parse().map_err(to_err)?;
        Ok(EndpointAddr {
            inner: iroh::EndpointAddr::from(pk),
        })
    }

    /// Get the endpoint ID as a hex string.
    #[wasm_bindgen(js_name = "endpointId")]
    pub fn endpoint_id(&self) -> String {
        self.inner.id.to_string()
    }

    /// Get the relay URL, if any.
    #[wasm_bindgen(js_name = "relayUrl")]
    pub fn relay_url(&self) -> Option<String> {
        self.inner.relay_urls().next().map(|u| u.to_string())
    }
}

impl From<iroh::EndpointAddr> for EndpointAddr {
    fn from(inner: iroh::EndpointAddr) -> Self {
        EndpointAddr { inner }
    }
}

impl From<&EndpointAddr> for iroh::EndpointAddr {
    fn from(addr: &EndpointAddr) -> Self {
        addr.inner.clone()
    }
}

fn to_err<E: std::fmt::Display>(e: E) -> JsError {
    JsError::new(&e.to_string())
}
