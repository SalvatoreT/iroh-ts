## ADDED Requirements

### Requirement: Add data as a blob
The system SHALL allow adding arbitrary byte data as a content-addressable blob, returning its BLAKE3 hash.

#### Scenario: Add bytes as blob
- **WHEN** `node.blobs().addBytes(data: Uint8Array)` is called
- **THEN** the data is stored locally and an object containing `{ hash: string, size: number }` is returned

#### Scenario: Add blob from file path
- **WHEN** `node.blobs().addFromPath(filePath: string)` is called (Node.js only)
- **THEN** the file contents are added as a blob and the hash and size are returned

### Requirement: Read blob data
The system SHALL allow reading blob data by its hash.

#### Scenario: Read blob bytes
- **WHEN** `node.blobs().readToBytes(hash: string)` is called with a valid hash
- **THEN** a `Uint8Array` containing the full blob content is returned

#### Scenario: Read nonexistent blob
- **WHEN** `node.blobs().readToBytes(hash)` is called with a hash not present locally
- **THEN** the promise rejects with a not-found error

### Requirement: Download blob from peer
The system SHALL allow downloading a blob from a remote peer by hash.

#### Scenario: Download blob
- **WHEN** `node.blobs().download(hash, nodeAddr)` is called with a valid hash and peer address
- **THEN** the blob is fetched from the peer, stored locally, and the promise resolves with the hash and size

### Requirement: List local blobs
The system SHALL allow listing all blobs stored locally.

#### Scenario: List blobs
- **WHEN** `node.blobs().list()` is called
- **THEN** an array of objects containing `{ hash: string, size: number }` is returned for each stored blob
