## ADDED Requirements

### Requirement: Chat example is a deployable Cloudflare Worker
The chat example SHALL be a standalone Vite project in `examples/chat/` with its own `package.json` and `wrangler.toml`, deployable to Cloudflare Workers.

#### Scenario: Deploy the chat example
- **WHEN** `wrangler deploy` is run in `examples/chat/`
- **THEN** the app is deployed to Cloudflare Workers and accessible via a URL

### Requirement: Chat room creation generates a join URL
The chat app SHALL create an iroh Endpoint on page load and display a join URL containing the endpoint address as a query parameter.

#### Scenario: User creates a chat room
- **WHEN** a user opens the chat app without a `ticket` query parameter
- **THEN** the app creates an Endpoint, waits for it to go online, and displays a join URL with `?ticket=<encoded-endpoint-addr>`

### Requirement: Joining a chat room via URL
The chat app SHALL accept a `ticket` query parameter, decode the endpoint address, and connect to the host.

#### Scenario: User joins a chat room
- **WHEN** a user opens the chat app with a `?ticket=...` query parameter
- **THEN** the app connects to the host endpoint and the users can exchange messages

### Requirement: Real-time message exchange
The chat app SHALL send and receive text messages over iroh bidirectional streams in real time.

#### Scenario: Send and receive messages
- **WHEN** a user types a message and presses Enter
- **THEN** the message appears in both users' chat windows
