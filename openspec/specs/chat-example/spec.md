## MODIFIED Requirements

### Requirement: Chat example supports configurable base path
The chat example's Vite config SHALL support a `BASE_PATH` environment variable for building under a subdirectory (e.g., `/iroh-ts/chat/`).

#### Scenario: Build with base path for GitHub Pages
- **WHEN** `BASE_PATH=/iroh-ts/chat/ pnpm build` is run
- **THEN** all asset paths in the output are prefixed with `/iroh-ts/chat/`

#### Scenario: Local dev uses root path
- **WHEN** `pnpm dev` is run without `BASE_PATH`
- **THEN** the app serves from `/` as before
