import { describe, it, expect } from "vitest";
import {
  PokerGame,
  evaluateHand,
  compareHands,
} from "../examples/poker/src/game";
import type { Card, Rank, Suit } from "../examples/poker/src/protocol";

/** Shorthand card builder: c("AH") = ace of hearts, c("10S") = ten of spades. */
function c(spec: string): Card {
  const suitChar = spec.slice(-1);
  const rank = spec.slice(0, -1) as Rank;
  const suit = (
    { H: "hearts", D: "diamonds", C: "clubs", S: "spades" } as Record<string, Suit>
  )[suitChar];
  return { rank, suit };
}

function cards(...specs: string[]): Card[] {
  return specs.map(c);
}

function totalChips(game: PokerGame): number {
  return game.players.reduce((n, p) => n + p.chips, 0) + game.pot;
}

describe("hand evaluation", () => {
  it("ranks categories in the right order", () => {
    const straightFlush = evaluateHand(cards("9H", "8H", "7H", "6H", "5H", "2C", "AD"));
    const quads = evaluateHand(cards("KH", "KD", "KC", "KS", "3H", "2C", "AD"));
    const fullHouse = evaluateHand(cards("QH", "QD", "QC", "7S", "7H", "2C", "AD"));
    const flush = evaluateHand(cards("AH", "JH", "8H", "6H", "2H", "KC", "KD"));
    const straight = evaluateHand(cards("9H", "8D", "7C", "6S", "5H", "AC", "AD"));
    const trips = evaluateHand(cards("8H", "8D", "8C", "KS", "4H", "3C", "2D"));
    const twoPair = evaluateHand(cards("JH", "JD", "4C", "4S", "AH", "7C", "2D"));
    const pair = evaluateHand(cards("10H", "10D", "AC", "7S", "5H", "3C", "2D"));
    const high = evaluateHand(cards("AH", "QD", "9C", "7S", "5H", "3C", "2D"));

    const ordered = [straightFlush, quads, fullHouse, flush, straight, trips, twoPair, pair, high];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(compareHands(ordered[i], ordered[i + 1])).toBeGreaterThan(0);
    }
    expect(straightFlush.name).toBe("Straight Flush");
    expect(quads.name).toBe("Four of a Kind");
    expect(fullHouse.name).toBe("Full House");
    expect(flush.name).toBe("Flush");
    expect(straight.name).toBe("Straight");
    expect(trips.name).toBe("Three of a Kind");
    expect(twoPair.name).toBe("Two Pair");
    expect(pair.name).toBe("Pair");
    expect(high.name).toBe("High Card");
  });

  it("a flush beats a straight (regression: old evaluator ignored both)", () => {
    const flush = evaluateHand(cards("KH", "JH", "8H", "6H", "2H", "5C", "4D"));
    const straight = evaluateHand(cards("9H", "8D", "7C", "6S", "5H", "KC", "2D"));
    expect(compareHands(flush, straight)).toBeGreaterThan(0);
  });

  it("detects the wheel (A-2-3-4-5) as a five-high straight", () => {
    const wheel = evaluateHand(cards("AH", "2D", "3C", "4S", "5H", "9C", "JD"));
    expect(wheel.name).toBe("Straight");
    expect(wheel.tiebreak[0]).toBe(5);
    const sixHigh = evaluateHand(cards("2H", "3D", "4C", "5S", "6H", "KC", "KD"));
    expect(compareHands(sixHigh, wheel)).toBeGreaterThan(0);
  });

  it("does not treat K-A-2-3-4 as a straight", () => {
    const hand = evaluateHand(cards("KH", "AD", "2C", "3S", "4H", "9C", "JD"));
    expect(hand.name).toBe("High Card");
  });

  it("breaks ties with kickers", () => {
    const aceKicker = evaluateHand(cards("KH", "KD", "AC", "7S", "5H", "3C", "2D"));
    const queenKicker = evaluateHand(cards("KS", "KC", "QC", "7H", "5D", "3S", "2H"));
    expect(compareHands(aceKicker, queenKicker)).toBeGreaterThan(0);
  });

  it("treats equal best-five hands as a tie even with different hole cards", () => {
    // Both players play the board's broadway straight
    const board = cards("AH", "KD", "QC", "JS", "10H");
    const a = evaluateHand([...cards("2C", "3D"), ...board]);
    const b = evaluateHand([...cards("4S", "5H"), ...board]);
    expect(compareHands(a, b)).toBe(0);
  });

  it("builds a full house from two sets of trips", () => {
    const hand = evaluateHand(cards("7H", "7D", "7C", "8S", "8H", "8C", "KD"));
    expect(hand.name).toBe("Full House");
    expect(hand.tiebreak).toEqual([8, 7]);
  });

  it("picks the best two of three pairs plus the right kicker", () => {
    const hand = evaluateHand(cards("9H", "9D", "6C", "6S", "2H", "2C", "AD"));
    expect(hand.name).toBe("Two Pair");
    expect(hand.tiebreak).toEqual([9, 6, 14]);
  });
});

describe("bet validation", () => {
  function freshGame(): PokerGame {
    const game = new PokerGame();
    game.addPlayer("A");
    game.addPlayer("B");
    game.deal(); // dealer becomes player 1, who acts first preflop
    return game;
  }

  it("rejects NaN, negative, zero, fractional, and infinite bets", () => {
    const game = freshGame();
    const actor = game.currentPlayer;
    for (const amount of [NaN, -50, 0, 1.5, Infinity, -Infinity]) {
      expect(game.applyAction(actor, { type: "bet", amount })).toBe(false);
    }
    expect(game.players[actor].chips).toBe(1000);
    expect(game.pot).toBe(0);
    expect(totalChips(game)).toBe(2000);
  });

  it("rejects invalid raise amounts", () => {
    const game = freshGame();
    const first = game.currentPlayer;
    const second = (first + 1) % 2;
    expect(game.applyAction(first, { type: "bet", amount: 50 })).toBe(true);
    for (const amount of [NaN, -10, 0, 2.5]) {
      expect(game.applyAction(second, { type: "raise", amount })).toBe(false);
    }
    expect(totalChips(game)).toBe(2000);
  });

  it("clamps oversized bets to the player's stack", () => {
    const game = freshGame();
    const actor = game.currentPlayer;
    expect(game.applyAction(actor, { type: "bet", amount: 5000 })).toBe(true);
    expect(game.players[actor].chips).toBe(0);
    expect(game.pot).toBe(1000);
    expect(totalChips(game)).toBe(2000);
  });

  it("rejects acting out of turn and acting after showdown", () => {
    const game = freshGame();
    const notTheirTurn = (game.currentPlayer + 1) % 2;
    expect(game.applyAction(notTheirTurn, { type: "check" })).toBe(false);

    expect(game.applyAction(game.currentPlayer, { type: "fold" })).toBe(true);
    expect(game.phase).toBe("showdown");
    expect(game.applyAction(0, { type: "check" })).toBe(false);
    expect(game.applyAction(1, { type: "check" })).toBe(false);
  });

  it("can't check facing a bet, must not bet when one is pending", () => {
    const game = freshGame();
    const first = game.currentPlayer;
    const second = (first + 1) % 2;
    expect(game.applyAction(first, { type: "bet", amount: 100 })).toBe(true);
    expect(game.applyAction(second, { type: "check" })).toBe(false);
    expect(game.applyAction(second, { type: "bet", amount: 100 })).toBe(false);
    expect(game.applyAction(second, { type: "call" })).toBe(true);
  });
});

describe("game flow", () => {
  it("plays a full hand through all phases with chips conserved", () => {
    const game = new PokerGame();
    game.addPlayer("A");
    game.addPlayer("B");
    game.deal();
    expect(game.phase).toBe("preflop");
    expect(totalChips(game)).toBe(2000);

    // Preflop: bet + call advances to flop
    const first = game.currentPlayer;
    const second = (first + 1) % 2;
    expect(game.applyAction(first, { type: "bet", amount: 100 })).toBe(true);
    expect(game.applyAction(second, { type: "call" })).toBe(true);
    expect(game.phase).toBe("flop");
    expect(game.community).toHaveLength(3);
    expect(game.pot).toBe(200);
    expect(game.roundBet).toBe(0);

    // Flop, turn, river: check it through
    for (const [phase, count] of [["turn", 4], ["river", 5]] as const) {
      expect(game.applyAction(game.currentPlayer, { type: "check" })).toBe(true);
      expect(game.applyAction(game.currentPlayer, { type: "check" })).toBe(true);
      expect(game.phase).toBe(phase);
      expect(game.community).toHaveLength(count);
    }
    expect(game.applyAction(game.currentPlayer, { type: "check" })).toBe(true);
    expect(game.applyAction(game.currentPlayer, { type: "check" })).toBe(true);
    expect(game.phase).toBe("showdown");

    const result = game.settle();
    expect(result.pot).toBe(200);
    expect(game.pot).toBe(0);
    expect(totalChips(game)).toBe(2000);
  });

  it("ends the hand immediately when a player folds", () => {
    const game = new PokerGame();
    game.addPlayer("A");
    game.addPlayer("B");
    game.deal();

    const first = game.currentPlayer;
    const second = (first + 1) % 2;
    expect(game.applyAction(first, { type: "bet", amount: 100 })).toBe(true);
    expect(game.applyAction(second, { type: "fold" })).toBe(true);
    expect(game.phase).toBe("showdown");

    const result = game.settle();
    expect(result.winners).toEqual([first]);
    expect(result.handName).toBe("last player standing");
    expect(game.players[first].chips).toBe(1000); // bet 100, won it back
    expect(totalChips(game)).toBe(2000);
  });
});

describe("settlement", () => {
  /** Rig a finished hand with chosen hole cards and board. */
  function riggedShowdown(handA: Card[], handB: Card[], board: Card[], pot: number): PokerGame {
    const game = new PokerGame();
    game.addPlayer("A");
    game.addPlayer("B");
    game.deal();
    game.players[0].hand = handA;
    game.players[1].hand = handB;
    game.community = board;
    game.phase = "showdown";
    game.pot = pot;
    game.players[0].chips = 1000 - pot / 2;
    game.players[1].chips = 1000 - pot / 2;
    return game;
  }

  it("getWinner is pure — calling it does not move chips", () => {
    const game = riggedShowdown(
      cards("AH", "AD"),
      cards("KH", "KD"),
      cards("2C", "5S", "9H", "JC", "3D"),
      200,
    );
    const before = game.players.map((p) => p.chips);
    const r1 = game.getWinner();
    const r2 = game.getWinner();
    expect(game.players.map((p) => p.chips)).toEqual(before);
    expect(game.pot).toBe(200);
    expect(r1).toEqual(r2);
    expect(r1.winnerNames).toEqual(["A"]);
  });

  it("settle awards the pot exactly once (idempotent)", () => {
    const game = riggedShowdown(
      cards("AH", "AD"),
      cards("KH", "KD"),
      cards("2C", "5S", "9H", "JC", "3D"),
      200,
    );
    const first = game.settle();
    const chipsAfter = game.players.map((p) => p.chips);
    const second = game.settle();
    expect(second).toEqual(first);
    expect(game.players.map((p) => p.chips)).toEqual(chipsAfter);
    expect(game.players[0].chips).toBe(1100);
    expect(game.players[1].chips).toBe(900);
    expect(totalChips(game)).toBe(2000);
  });

  it("splits the pot on a tie, odd chip to the first winner", () => {
    // Both players play the board straight
    const game = riggedShowdown(
      cards("2H", "3D"),
      cards("2S", "4C"),
      cards("AH", "KD", "QC", "JS", "10H"),
      201,
    );
    // make chips sum work out for the odd pot
    game.players[0].chips = 900;
    game.players[1].chips = 899;

    const result = game.settle();
    expect(result.winners).toEqual([0, 1]);
    expect(result.handName).toBe("Straight");
    expect(game.players[0].chips).toBe(900 + 101);
    expect(game.players[1].chips).toBe(899 + 100);
    expect(game.pot).toBe(0);
  });

  it("declares the better hand the winner (flush over straight)", () => {
    const game = riggedShowdown(
      cards("AH", "6H"), // flush using two hearts
      cards("8C", "9D"), // straight 5-9
      cards("2H", "5H", "7S", "JH", "6C"),
      100,
    );
    const result = game.settle();
    expect(result.winnerNames).toEqual(["A"]);
    expect(result.handName).toBe("Flush");
  });

  it("a new deal resets settlement so the next hand can be settled", () => {
    const game = riggedShowdown(
      cards("AH", "AD"),
      cards("KH", "KD"),
      cards("2C", "5S", "9H", "JC", "3D"),
      200,
    );
    game.settle();
    game.deal();
    expect(game.pot).toBe(0);
    expect(game.phase).toBe("preflop");
    // settle the new (rigged) hand
    game.players[0].hand = cards("2H", "3C");
    game.players[1].hand = cards("AS", "AC");
    game.community = cards("AD", "7S", "8H", "JC", "4D");
    game.phase = "showdown";
    game.pot = 50;
    game.players[1].chips -= 50;
    const result = game.settle();
    expect(result.winnerNames).toEqual(["B"]);
    expect(result.handName).toBe("Three of a Kind");
  });
});
