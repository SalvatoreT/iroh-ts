## MODIFIED Requirements

### Requirement: Poker example supports configurable base path
The poker example's Vite config SHALL support a `BASE_PATH` environment variable for building under a subdirectory (e.g., `/iroh-ts/poker/`).

#### Scenario: Build with base path for GitHub Pages
- **WHEN** `BASE_PATH=/iroh-ts/poker/ pnpm build` is run
- **THEN** all asset paths in the output are prefixed with `/iroh-ts/poker/`

#### Scenario: Local dev uses root path
- **WHEN** `pnpm dev` is run without `BASE_PATH`
- **THEN** the app serves from `/` as before
