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

export interface HandResult {
  /** Indices into players[] of the winner(s); more than one on a split pot. */
  winners: number[];
  winnerNames: string[];
  handName: string;
  pot: number;
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
  private settled = false;
  private lastResult: HandResult | null = null;

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
    this.settled = false;
    this.lastResult = null;
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
    if (this.phase === "waiting" || this.phase === "showdown") return false;
    if (playerIndex !== this.currentPlayer) return false;
    const player = this.players[playerIndex];
    if (player.folded) return false;

    // Validate and process action
    switch (action.type) {
      case "check":
        if (this.roundBet > player.bet) return false; // Can't check facing a bet
        break;
      case "bet": {
        if (this.roundBet > 0) return false; // Must raise, not bet, when bet is pending
        if (!isValidAmount(action.amount)) return false;
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
        if (!isValidAmount(action.amount)) return false;
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
      default:
        return false;
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

  /** Determine the winner(s) of the current hand. Pure — does not move chips. */
  getWinner(): HandResult {
    const activeIndices = this.players
      .map((_, i) => i)
      .filter((i) => !this.players[i].folded);

    if (activeIndices.length === 1) {
      const i = activeIndices[0];
      return {
        winners: [i],
        winnerNames: [this.players[i].name],
        handName: "last player standing",
        pot: this.pot,
      };
    }

    let winners = [activeIndices[0]];
    let bestRank = evaluateHand([...this.players[activeIndices[0]].hand, ...this.community]);
    for (const i of activeIndices.slice(1)) {
      const rank = evaluateHand([...this.players[i].hand, ...this.community]);
      const cmp = compareHands(rank, bestRank);
      if (cmp > 0) {
        winners = [i];
        bestRank = rank;
      } else if (cmp === 0) {
        winners.push(i);
      }
    }
    return {
      winners,
      winnerNames: winners.map((i) => this.players[i].name),
      handName: bestRank.name,
      pot: this.pot,
    };
  }

  /**
   * Award the pot to the winner(s), splitting on ties (odd chip goes to the
   * first winner). Idempotent: calling it again returns the same result
   * without moving chips twice.
   */
  settle(): HandResult {
    if (this.settled && this.lastResult) return this.lastResult;
    const result = this.getWinner();
    const share = Math.floor(this.pot / result.winners.length);
    let remainder = this.pot - share * result.winners.length;
    for (const i of result.winners) {
      this.players[i].chips += share + remainder;
      remainder = 0;
    }
    this.pot = 0;
    this.settled = true;
    this.lastResult = result;
    return result;
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

function isValidAmount(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount > 0;
}

// --- Hand evaluation (best 5 of up to 7 cards) ---

/** Comparable hand rank: higher category wins; ties broken by tiebreak array. */
export interface HandRank {
  /** 8 = straight flush ... 0 = high card */
  category: number;
  /** Rank values, most significant first (e.g. pair rank, then kickers). */
  tiebreak: number[];
  name: string;
}

const CATEGORY_NAMES = [
  "High Card",
  "Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
];

/** Highest straight in the given rank values (14 = ace), or 0 if none. Handles the wheel (A-2-3-4-5). */
function bestStraightHigh(rankValues: number[]): number {
  const unique = [...new Set(rankValues)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1); // ace plays low in the wheel
  let run = 1;
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] === unique[i - 1] - 1) {
      run++;
      if (run >= 5) return unique[i] + 4;
    } else {
      run = 1;
    }
  }
  return 0;
}

export function evaluateHand(cards: Card[]): HandRank {
  const values = cards.map((c) => RANK_VALUES[c.rank]);
  const sorted = [...values].sort((a, b) => b - a);

  // Rank frequencies, sorted by count desc then rank desc
  const freq = new Map<number, number>();
  for (const v of values) freq.set(v, (freq.get(v) || 0) + 1);
  const groups = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  // Flush: any suit with >= 5 cards
  const bySuit = new Map<Suit, number[]>();
  for (const c of cards) {
    const list = bySuit.get(c.suit) ?? [];
    list.push(RANK_VALUES[c.rank]);
    bySuit.set(c.suit, list);
  }
  let flushValues: number[] | null = null;
  for (const list of bySuit.values()) {
    if (list.length >= 5) flushValues = list.sort((a, b) => b - a);
  }

  // Straight flush
  if (flushValues) {
    const high = bestStraightHigh(flushValues);
    if (high > 0) return rank(8, [high]);
  }

  // Four of a kind: quad rank + best kicker
  if (groups[0][1] >= 4) {
    const kicker = sorted.find((v) => v !== groups[0][0])!;
    return rank(7, [groups[0][0], kicker]);
  }

  // Full house: trips + best remaining pair (or second trips)
  if (groups[0][1] >= 3 && groups[1] && groups[1][1] >= 2) {
    return rank(6, [groups[0][0], groups[1][0]]);
  }

  // Flush: top 5 of the flush suit
  if (flushValues) return rank(5, flushValues.slice(0, 5));

  // Straight
  const straightHigh = bestStraightHigh(values);
  if (straightHigh > 0) return rank(4, [straightHigh]);

  // Three of a kind: trips + 2 kickers
  if (groups[0][1] >= 3) {
    const kickers = sorted.filter((v) => v !== groups[0][0]).slice(0, 2);
    return rank(3, [groups[0][0], ...kickers]);
  }

  // Two pair: top two pairs + kicker
  if (groups[0][1] >= 2 && groups[1] && groups[1][1] >= 2) {
    const [hi, lo] = [groups[0][0], groups[1][0]];
    const kicker = sorted.find((v) => v !== hi && v !== lo)!;
    return rank(2, [hi, lo, kicker]);
  }

  // Pair: pair + 3 kickers
  if (groups[0][1] >= 2) {
    const kickers = sorted.filter((v) => v !== groups[0][0]).slice(0, 3);
    return rank(1, [groups[0][0], ...kickers]);
  }

  // High card: top 5
  return rank(0, sorted.slice(0, 5));
}

function rank(category: number, tiebreak: number[]): HandRank {
  return { category, tiebreak, name: CATEGORY_NAMES[category] };
}

/** Compare two hand ranks: positive if a wins, negative if b wins, 0 on tie. */
export function compareHands(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category;
  const n = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < n; i++) {
    const d = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
