import type { Card, Rank, Suit, PlayerAction, PlayerState, Phase } from "./protocol.js";

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
  "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14,
};

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export interface Player {
  name: string;
  chips: number;
  hand: Card[];
  bet: number;
  folded: boolean;
  acted: boolean;
}

export class PokerGame {
  players: Player[] = [];
  deck: Card[] = [];
  community: Card[] = [];
  pot = 0;
  currentPlayer = 0;
  phase: Phase = "waiting";
  dealerIndex = 0;
  roundBet = 0;

  addPlayer(name: string): number {
    this.players.push({ name, chips: 1000, hand: [], bet: 0, folded: false, acted: false });
    return this.players.length - 1;
  }

  deal() {
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    this.deck = createDeck();
    this.community = [];
    this.pot = 0;
    this.roundBet = 0;
    this.phase = "preflop";
    for (const p of this.players) {
      p.hand = [this.deck.pop()!, this.deck.pop()!];
      p.bet = 0;
      p.folded = false;
      p.acted = false;
    }
    // Heads-up: dealer acts first preflop
    this.currentPlayer = this.dealerIndex;
    this.skipFolded();
  }

  private skipFolded() {
    const active = this.players.filter((p) => !p.folded);
    if (active.length <= 1) return;
    let attempts = 0;
    while (this.players[this.currentPlayer].folded && attempts < this.players.length) {
      this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
      attempts++;
    }
  }

  applyAction(playerIndex: number, action: PlayerAction): boolean {
    if (playerIndex !== this.currentPlayer) return false;
    const player = this.players[playerIndex];
    if (player.folded) return false;

    // Validate and process action
    switch (action.type) {
      case "check":
        if (this.roundBet > 0) return false; // Can't check when there's a bet
        break;
      case "bet": {
        if (this.roundBet > 0) return false; // Must raise, not bet, when bet is pending
        const amount = Math.min(action.amount, player.chips);
        player.chips -= amount;
        player.bet += amount;
        this.pot += amount;
        this.roundBet = player.bet;
        // Other active players must respond
        for (const p of this.players) {
          if (p !== player && !p.folded) p.acted = false;
        }
        break;
      }
      case "call": {
        if (this.roundBet <= 0) return false; // Nothing to call
        const toCall = Math.min(this.roundBet - player.bet, player.chips);
        player.chips -= toCall;
        player.bet += toCall;
        this.pot += toCall;
        break;
      }
      case "raise": {
        if (this.roundBet <= 0) return false; // Must bet, not raise, when no bet pending
        const toCall = this.roundBet - player.bet;
        const raiseExtra = Math.min(action.amount, player.chips - toCall);
        const total = Math.min(toCall + Math.max(raiseExtra, 0), player.chips);
        player.chips -= total;
        player.bet += total;
        this.pot += total;
        this.roundBet = player.bet;
        // Other active players must respond
        for (const p of this.players) {
          if (p !== player && !p.folded) p.acted = false;
        }
        break;
      }
      case "fold":
        player.folded = true;
        break;
    }
    player.acted = true;

    // Check if round is over (all active players have acted)
    const activePlayers = this.players.filter((p) => !p.folded);
    if (activePlayers.length <= 1) {
      this.phase = "showdown";
      return true;
    }

    const allActed = activePlayers.every((p) => p.acted);
    if (allActed) {
      this.advancePhase();
    } else {
      this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
      this.skipFolded();
    }
    return true;
  }

  private advancePhase() {
    for (const p of this.players) {
      p.acted = false;
      p.bet = 0;
    }
    this.roundBet = 0;

    switch (this.phase) {
      case "preflop":
        this.community = [this.deck.pop()!, this.deck.pop()!, this.deck.pop()!];
        this.phase = "flop";
        break;
      case "flop":
        this.community.push(this.deck.pop()!);
        this.phase = "turn";
        break;
      case "turn":
        this.community.push(this.deck.pop()!);
        this.phase = "river";
        break;
      case "river":
        this.phase = "showdown";
        return;
    }
    // Postflop: non-dealer acts first (heads-up)
    this.currentPlayer = (this.dealerIndex + 1) % this.players.length;
    this.skipFolded();
  }

  getWinner(): { name: string; handName: string } {
    const active = this.players.filter((p) => !p.folded);
    if (active.length === 1) {
      return { name: active[0].name, handName: "last player standing" };
    }

    let best = active[0];
    let bestScore = handScore(best.hand, this.community);
    let bestName = handName(bestScore);
    for (let i = 1; i < active.length; i++) {
      const score = handScore(active[i].hand, this.community);
      if (score > bestScore) {
        best = active[i];
        bestScore = score;
        bestName = handName(score);
      }
    }
    best.chips += this.pot;
    return { name: best.name, handName: bestName };
  }

  getPlayerStates(): PlayerState[] {
    return this.players.map((p) => ({
      name: p.name,
      chips: p.chips,
      bet: p.bet,
      folded: p.folded,
      active: !p.folded,
    }));
  }
}

// Simplified hand scoring: higher = better
function handScore(hand: Card[], community: Card[]): number {
  const all = [...hand, ...community];
  const ranks = all.map((c) => RANK_VALUES[c.rank]).sort((a, b) => b - a);

  // Count rank frequencies
  const freq = new Map<number, number>();
  for (const r of ranks) freq.set(r, (freq.get(r) || 0) + 1);
  const counts = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  // Four of a kind
  if (counts[0][1] >= 4) return 7000 + counts[0][0];
  // Full house
  if (counts[0][1] >= 3 && counts[1] && counts[1][1] >= 2) return 6000 + counts[0][0];
  // Three of a kind
  if (counts[0][1] >= 3) return 3000 + counts[0][0];
  // Two pair
  if (counts[0][1] >= 2 && counts[1] && counts[1][1] >= 2)
    return 2000 + counts[0][0] * 15 + counts[1][0];
  // Pair
  if (counts[0][1] >= 2) return 1000 + counts[0][0];
  // High card
  return ranks[0];
}

function handName(score: number): string {
  if (score >= 7000) return "Four of a Kind";
  if (score >= 6000) return "Full House";
  if (score >= 3000) return "Three of a Kind";
  if (score >= 2000) return "Two Pair";
  if (score >= 1000) return "Pair";
  return "High Card";
}
