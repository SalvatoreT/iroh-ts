# iroh Echo Server

A server-to-browser example: a Node.js server creates an iroh endpoint, accepts browser connections, and echoes messages back with a timestamp.

## Prerequisites

Build the iroh-ts library from the repo root:

```bash
pnpm install
pnpm build
```

## Running

### 1. Start the server

```bash
cd examples/echo-server
pnpm install
pnpm start
```

The server will print an endpoint ID like:

```
Endpoint ID: a1b2c3d4e5f6...
```

### 2. Start the browser client

In a second terminal:

```bash
cd examples/echo-server/client
pnpm install
pnpm dev
```

Open the URL shown by Vite (usually `http://localhost:5173`), paste the endpoint ID from step 1, and click **Connect**.

You can also auto-connect via query param:

```
http://localhost:5173?server=<endpoint-id>
```

### Quick start from repo root

```bash
pnpm demo          # starts the Node.js echo server
```
