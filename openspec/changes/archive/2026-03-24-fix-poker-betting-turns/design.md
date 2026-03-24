# Design: Fix Poker Betting Turns

## Files Modified

- `examples/poker/src/game.ts` — Core betting logic and turn management
- `examples/poker/src/protocol.ts` — Add "call" and "raise" action types, add `roundBet` to state message
- `examples/poker/src/main.ts` — UI updates for call/raise buttons, dynamic button labels
- `examples/poker/index.html` — Rename/add UI buttons (Call/Raise)

## Data Model Changes

### `Player` interface (`game.ts`)

No changes needed. The existing `bet` field tracks per-round bet amount.

### `PokerGame` class (`game.ts`)

Add new fields:

```typescript
dealerIndex = 0;   // Rotates each hand — determines acting order
roundBet = 0;      // Current highest bet in the active betting round
```

### `PlayerAction` type (`protocol.ts`)

Expand from `bet | fold | check` to:

```typescript
type PlayerAction =
  | { type: "bet"; amount: number }    // Opening bet (when roundBet === 0)
  | { type: "call" }                   // Match the current roundBet
  | { type: "raise"; amount: number }  // Raise to a new amount above roundBet
  | { type: "fold" }
  | { type: "check" };                 // Only valid when roundBet === 0
```

### `HostMessage` state message (`protocol.ts`)

Add `roundBet` to the state broadcast so the joiner UI knows the current bet level:

```typescript
| { kind: "state"; players: PlayerState[]; pot: number; community: Card[];
    currentPlayer: number; phase: Phase; roundBet: number }
```

## Betting Logic (`game.ts: applyAction`)

### Action validation

Before processing, validate the action is legal:
- **check**: Only valid when `roundBet === 0` (no outstanding bet)
- **call**: Only valid when `roundBet > 0` and player's current bet < `roundBet`
- **bet**: Only valid when `roundBet === 0` (opening bet for the round)
- **raise**: Only valid when `roundBet > 0`; raise amount must be > current `roundBet`
- **fold**: Always valid

### Action processing

```
bet(amount):
  player.chips -= amount
  player.bet += amount
  pot += amount
  roundBet = player.bet
  player.acted = true
  Reset acted=false for all OTHER active players (they must respond)

raise(amount):
  toCall = roundBet - player.bet
  raiseExtra = amount  (amount above the call)
  total = toCall + raiseExtra
  player.chips -= total
  player.bet += total
  pot += total
  roundBet = player.bet
  player.acted = true
  Reset acted=false for all OTHER active players

call:
  toCall = roundBet - player.bet
  actual = min(toCall, player.chips)
  player.chips -= actual
  player.bet += actual
  pot += actual
  player.acted = true

check:
  player.acted = true

fold:
  player.folded = true
  player.acted = true
```

### Round completion check

A betting round ends when ALL active (non-folded) players have `acted === true`. Since a bet/raise resets `acted` on opponents, this naturally ensures everyone has responded to the latest bet.

On round completion, call `advancePhase()` which resets `acted` flags, resets `roundBet = 0`, resets per-player `bet = 0`, and sets the correct `currentPlayer` based on dealer position.

## Turn Alternation

### Dealer rotation (`game.ts: deal`)

```typescript
deal() {
  this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
  // ... existing deal logic ...

  // Heads-up rule: dealer acts first preflop, second postflop
  this.currentPlayer = this.dealerIndex;
  this.skipFolded();
}
```

First hand: `dealerIndex` starts at 0, first `deal()` sets it to 1, so player 1 (joiner) is dealer on hand 1, player 0 (host) on hand 2, etc.

### Phase advancement (`game.ts: advancePhase`)

```typescript
advancePhase() {
  // Reset per-round state
  for (const p of this.players) {
    p.acted = false;
    p.bet = 0;
  }
  this.roundBet = 0;

  // ... deal community cards based on phase ...

  // Postflop: non-dealer acts first (heads-up)
  this.currentPlayer = (this.dealerIndex + 1) % this.players.length;
  this.skipFolded();
}
```

## UI Changes

### Dynamic button labels (`main.ts`)

When rendering state, check `roundBet`:
- If `roundBet === 0`: Show **Bet** and **Check** buttons (hide Call)
- If `roundBet > 0`: Show **Call ($X)** and **Raise** buttons (hide Check)
  - Where `$X` = `roundBet - myCurrentBet`
- **Fold** always visible

### Button wiring (`main.ts`)

- **Bet button**: sends `{ type: "bet", amount }` — only enabled when `roundBet === 0`
- **Call button**: sends `{ type: "call" }` — only enabled when `roundBet > 0`
- **Raise button**: sends `{ type: "raise", amount }` — only enabled when `roundBet > 0`
- **Check button**: sends `{ type: "check" }` — only enabled when `roundBet === 0`
- **Fold button**: sends `{ type: "fold" }` — always enabled

### HTML changes (`index.html`)

Add a Call button and a Raise button to the action bar. The Bet/Call and Check/Raise pairs can share slots and be toggled via display. Alternatively, keep all 4 buttons and show/hide based on state.

Simpler approach: rename existing buttons dynamically:
- Bet button text toggles between "Bet" and "Raise"
- Check button text toggles between "Check" and "Call ($X)"

This avoids HTML changes — just update `textContent` and action handler in `renderState`.
