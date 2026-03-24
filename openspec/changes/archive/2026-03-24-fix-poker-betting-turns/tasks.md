# Tasks: Fix Poker Betting Turns

## Task 1: Update protocol types
**File**: `examples/poker/src/protocol.ts`

- [x] Add `"call"` and `"raise"` to `PlayerAction` type:
  - `{ type: "call" }` and `{ type: "raise"; amount: number }`
- [x] Add `roundBet: number` to the `state` variant of `HostMessage`

## Task 2: Add dealer tracking and bet-matching state to PokerGame
**File**: `examples/poker/src/game.ts`

- [x] Add `dealerIndex = 0` and `roundBet = 0` fields to `PokerGame`
- [x] In `deal()`: rotate `dealerIndex`, set `currentPlayer = dealerIndex` (dealer acts first preflop in heads-up), reset `roundBet = 0`
- [x] In `advancePhase()`: reset `roundBet = 0`, reset each player's `bet = 0`, set `currentPlayer = (dealerIndex + 1) % players.length` (non-dealer first postflop)

## Task 3: Implement bet-matching logic in applyAction
**File**: `examples/poker/src/game.ts`

- [x] Add action validation: `check` only when `roundBet === 0`, `bet` only when `roundBet === 0`, `call` only when `roundBet > 0`, `raise` only when `roundBet > 0`
- [x] Implement `call` handler: pay `roundBet - player.bet`, mark acted
- [x] Implement `raise` handler: pay call amount + raise extra, update `roundBet`, reset `acted` on other active players
- [x] Update `bet` handler: set `roundBet = player.bet`, reset `acted` on other active players
- [x] Keep `check` and `fold` handlers as-is

## Task 4: Update state broadcast to include roundBet
**File**: `examples/poker/src/main.ts`

- [x] Add `roundBet: game.roundBet` to the `broadcastState` state message

## Task 5: Update UI for call/raise actions
**Files**: `examples/poker/src/main.ts`, `examples/poker/index.html`

- [x] In `renderState`: dynamically set Bet button text to "Bet" or "Raise" based on `roundBet`
- [x] In `renderState`: dynamically set Check button text to "Check" or "Call ($X)" based on `roundBet`
- [x] Update host button handlers (`btnBet.onclick`, `btnCheck.onclick`) to send the correct action type based on current `roundBet`
- [x] Update joiner button handlers similarly
- [x] Pass `roundBet` through to `renderState` so it can determine button labels

## Task 6: Verify build succeeds
- [x] Run `pnpm build` from the poker example or root to ensure no type errors
