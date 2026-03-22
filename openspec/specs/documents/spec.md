## ADDED Requirements

### Requirement: Create a new document
The system SHALL allow creating a new replicated key-value document with a unique document ID.

#### Scenario: Create document
- **WHEN** `node.docs().create()` is called
- **THEN** a new `Doc` object is returned with a unique document ID

### Requirement: Set and get entries in a document
The system SHALL allow setting key-value entries in a document and reading them back.

#### Scenario: Set an entry
- **WHEN** `doc.set(key: Uint8Array, value: Uint8Array)` is called
- **THEN** the entry is stored in the document and the entry's hash is returned

#### Scenario: Get an entry
- **WHEN** `doc.get(key: Uint8Array)` is called for an existing key
- **THEN** an object containing `{ key, value, hash, author }` is returned

#### Scenario: Get missing entry
- **WHEN** `doc.get(key)` is called for a key that does not exist
- **THEN** `null` is returned

### Requirement: Join a remote document
The system SHALL allow joining an existing document by its ticket, enabling sync with the document's peers.

#### Scenario: Join by ticket
- **WHEN** `node.docs().join(ticket: string)` is called with a valid document ticket
- **THEN** a `Doc` object is returned and the document begins syncing with peers

### Requirement: List document entries
The system SHALL allow listing all entries in a document.

#### Scenario: List all entries
- **WHEN** `doc.entries()` is called
- **THEN** an array of entry objects containing `{ key, value, hash, author }` is returned

### Requirement: Share document
The system SHALL allow generating a share ticket for a document to enable other peers to join.

#### Scenario: Generate share ticket
- **WHEN** `doc.share(mode: "read" | "write")` is called
- **THEN** a string ticket is returned that can be used by other nodes to join the document
