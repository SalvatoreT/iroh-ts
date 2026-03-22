## ADDED Requirements

### Requirement: Poker example is a deployable Cloudflare Worker
The poker example SHALL be a standalone Vite project in `examples/poker/` with its own `package.json` and `wrangler.toml`, deployable to Cloudflare Workers.

#### Scenario: Deploy the poker example
- **WHEN** `wrangler deploy` is run in `examples/poker/`
- **THEN** the app is deployed to Cloudflare Workers and accessible via a URL

### Requirement: Poker room creation generates a join URL
The poker app SHALL create an iroh Endpoint on page load and display a join URL, similar to the chat example.

#### Scenario: User creates a poker room
- **WHEN** a user opens the poker app without a `ticket` query parameter
- **THEN** the app creates an Endpoint and displays a join URL with `?ticket=<encoded-endpoint-addr>`

### Requirement: Cards rendered with poker-card-element
The poker app SHALL use the `poker-card-element` npm package (`<playing-card>` web component) to render playing cards as SVG.

#### Scenario: Cards are visible
- **WHEN** a hand is dealt
- **THEN** each card is rendered using the `<playing-card>` custom element with correct rank and suit

### Requirement: Multiplayer game state over iroh streams
The poker app SHALL sync game state between players over iroh bidirectional streams. The host manages the deck and broadcasts state updates.

#### Scenario: Game state sync
- **WHEN** a player performs an action (bet, fold, check)
- **THEN** all connected players see the updated game state

### Requirement: Basic poker gameplay
The poker app SHALL support a simplified poker flow: deal, betting round, and showdown. Full poker rules (blinds, multiple rounds, side pots) are not required.

#### Scenario: Complete a hand
- **WHEN** all players have acted
- **THEN** the hand resolves with a winner determined by basic hand ranking
