# Fix Poker Betting Turns

## Problem

The poker example has two fundamental issues with its betting logic:

1. **No bet matching enforcement** — When a player bets or raises, the opponent can simply "check" instead of being required to call, raise, or fold. The `applyAction` method only tracks whether each player has `acted` once per round, without checking whether all players have matched the current highest bet. This breaks core poker rules.

2. **No turn alternation** — The host (player 0) always acts first in every betting round of every hand. In real poker, the dealer button rotates each hand, changing who acts first. Currently `deal()` hardcodes `currentPlayer = 0` and `advancePhase()` resets to player 0 every street.

## Proposed Solution

### Bet matching
- Track `roundBet` (the current highest bet for the round) on the game state.
- When a player bets/raises, reset the `acted` flag on other active players so they must respond.
- A round only advances when all active players have acted AND their bets match `roundBet`.
- Replace the "check" action with "call" when there's an outstanding bet. The UI dynamically shows the correct button label and enforces valid actions (can't check when a bet is pending).

### Turn alternation
- Track a `dealerIndex` (button position) on `PokerGame` that increments each hand.
- The first-to-act position rotates based on the dealer: in heads-up, the dealer acts first preflop and second postflop.
- The host still controls when a new hand starts, but the acting order alternates.

## Non-goals

- Blinds/antes (keep the no-forced-bet simplicity)
- All-in / side pot logic
- Multi-player support beyond 2 players
- Changes to hand evaluation scoring
