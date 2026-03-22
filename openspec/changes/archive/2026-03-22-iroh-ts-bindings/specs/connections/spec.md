## ADDED Requirements

### Requirement: Connect to a peer by node ID
The system SHALL allow establishing a QUIC connection to a remote peer using their NodeId and optional addressing hints.

#### Scenario: Connect with node address
- **WHEN** `node.connect(nodeAddr, alpn)` is called with a valid node address and ALPN protocol identifier
- **THEN** a `Connection` object is returned representing the established QUIC connection

#### Scenario: Connection failure
- **WHEN** `node.connect(nodeAddr, alpn)` is called and the peer is unreachable
- **THEN** the promise rejects with an error describing the connection failure

### Requirement: Accept incoming connections
The system SHALL allow a node to accept incoming connections on a specified ALPN protocol.

#### Scenario: Accept a connection
- **WHEN** `node.accept(alpn)` is called and a remote peer connects with a matching ALPN
- **THEN** a `Connection` object is returned for the accepted connection

### Requirement: Send and receive data over a connection
The system SHALL support opening bidirectional streams on a connection for sending and receiving byte data.

#### Scenario: Bidirectional stream communication
- **WHEN** a bidirectional stream is opened via `connection.openBi()`
- **THEN** the returned stream object provides `send(data: Uint8Array)` and `recv()` methods for exchanging data

#### Scenario: Receive data
- **WHEN** `stream.recv()` is called on an open stream
- **THEN** a `Uint8Array` containing the next chunk of received data is returned, or `null` if the stream is finished
