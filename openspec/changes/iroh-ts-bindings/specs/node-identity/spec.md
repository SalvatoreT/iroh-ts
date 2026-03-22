## ADDED Requirements

### Requirement: Create a new Iroh node
The system SHALL allow creating a new `IrohNode` instance with an automatically generated cryptographic identity (Ed25519 keypair). The node SHALL start listening for connections upon creation.

#### Scenario: Create node with default options
- **WHEN** `IrohNode.create()` is called with no arguments
- **THEN** a new node is created with a random keypair and ephemeral storage

#### Scenario: Create node with persistent storage
- **WHEN** `IrohNode.create({ storagePath: "/path/to/data" })` is called
- **THEN** a new node is created that persists its identity and data to the specified path

### Requirement: Access node identity
The system SHALL expose the node's public identity (NodeId) as a hex-encoded string and provide access to the node's networking addresses.

#### Scenario: Get node ID
- **WHEN** `node.nodeId()` is called on a running node
- **THEN** a hex-encoded string of the node's Ed25519 public key is returned

#### Scenario: Get node address
- **WHEN** `node.nodeAddr()` is called
- **THEN** an object containing the node ID, relay URL, and direct addresses is returned

### Requirement: Shut down a node
The system SHALL provide a method to gracefully shut down a running node, releasing all resources.

#### Scenario: Graceful shutdown
- **WHEN** `node.shutdown()` is called
- **THEN** all active connections are closed, listeners are stopped, and the promise resolves when cleanup is complete
