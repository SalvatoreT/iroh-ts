# Tasks: Fix Poker Betting Turns

## Task 1: Update protocol types
**File**: `examples/poker/src/protocol.ts`

- [ ] Add `"call"` and `"raise"` to `PlayerAction` type:
  - `{ type: "call" }` and `{ type: "raise"; amount: number }`
- [ ] Add `roundBet: number` to the `state` variant of `HostMessage`

## Task 2: Add dealer tracking and bet-matching state to PokerGame
**File**: `examples/poker/src/game.ts`

- [ ] Add `dealerIndex = 0` and `roundBet = 0` fields to `PokerGame`
- [ ] In `deal()`: rotate `dealerIndex`, set `currentPlayer = dealerIndex` (dealer acts first preflop in heads-up), reset `roundBet = 0`
- [ ] In `advancePhase()`: reset `roundBet = 0`, reset each player's `bet = 0`, set `currentPlayer = (dealerIndex + 1) % players.length` (non-dealer first postflop)

## Task 3: Implement bet-matching logic in applyAction
**File**: `examples/poker/src/game.ts`

- [ ] Add action validation: `check` only when `roundBet === 0`, `bet` only when `roundBet === 0`, `call` only when `roundBet > 0`, `raise` only when `roundBet > 0`
- [ ] Implement `call` handler: pay `roundBet - player.bet`, mark acted
- [ ] Implement `raise` handler: pay call amount + raise extra, update `roundBet`, reset `acted` on other active players
- [ ] Update `bet` handler: set `roundBet = player.bet`, reset `acted` on other active players
- [ ] Keep `check` and `fold` handlers as-is

## Task 4: Update state broadcast to include roundBet
**File**: `examples/poker/src/main.ts`

- [ ] Add `roundBet: game.roundBet` to the `broadcastState` state message

## Task 5: Update UI for call/raise actions
**Files**: `examples/poker/src/main.ts`, `examples/poker/index.html`

- [ ] In `renderState`: dynamically set Bet button text to "Bet" or "Raise" based on `roundBet`
- [ ] In `renderState`: dynamically set Check button text to "Check" or "Call ($X)" based on `roundBet`
- [ ] Update host button handlers (`btnBet.onclick`, `btnCheck.onclick`) to send the correct action type based on current `roundBet`
- [ ] Update joiner button handlers similarly
- [ ] Pass `roundBet` through to `renderState` so it can determine button labels

## Task 6: Verify build succeeds
- [ ] Run `pnpm build` from the poker example or root to ensure no type errors
