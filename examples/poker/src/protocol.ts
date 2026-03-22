// Message types sent over iroh streams between host and players.

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "J" | "Q" | "K" | "A";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type PlayerAction = { type: "bet"; amount: number } | { type: "fold" } | { type: "check" };

// Messages from host → player
export type HostMessage =
  | { kind: "deal"; hand: Card[]; community: Card[] }
  | { kind: "state"; players: PlayerState[]; pot: number; community: Card[]; currentPlayer: number; phase: Phase }
  | { kind: "result"; winner: string; winningHand: string; pot: number }
  | { kind: "joined"; playerIndex: number; playerCount: number };

// Messages from player → host
export type PlayerMessage =
  | { kind: "action"; action: PlayerAction }
  | { kind: "ready" };

export interface PlayerState {
  name: string;
  chips: number;
  bet: number;
  folded: boolean;
  active: boolean;
}

export type Phase = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encode(msg: HostMessage | PlayerMessage): Uint8Array {
  return encoder.encode(JSON.stringify(msg));
}

export function decode(data: Uint8Array): HostMessage | PlayerMessage {
  return JSON.parse(decoder.decode(data));
}
