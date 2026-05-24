import { describe, expect, it } from "vitest";
import { createDeck, dealGame, DECK_SIZE } from "./deck";
import { getAvailableCards, resolveGame, resolveScoring } from "./engine";
import type { Card, CardKind, GameState } from "./types";

const deck = createDeck();

describe("basketball poker engine", () => {
  it("builds the confirmed 52-card deck", () => {
    expect(deck).toHaveLength(DECK_SIZE);
  });

  it("deals a Texas Hold'em style layout", () => {
    const game = dealGame();
    const seenCardIds = new Set(
      [...game.playerA, ...game.playerB, ...game.community, ...game.deck].map((card) => card.id),
    );

    expect(game.playerA).toHaveLength(2);
    expect(game.playerB).toHaveLength(2);
    expect(game.community).toHaveLength(4);
    expect(game.deck).toHaveLength(44);
    expect(seenCardIds).toHaveLength(DECK_SIZE);
    expect(getAvailableCards(game, "playerA")).toHaveLength(6);
    expect(getAvailableCards(game, "playerB")).toHaveLength(6);
  });

  it("forces a community Foul for both scoring attempts", () => {
    const freeThrows = getCards("freeThrow", 2);
    const game: GameState = {
      playerA: [getCard("layup", 5), freeThrows[0]],
      playerB: [getCard("dunk", 4), freeThrows[1]],
      community: [getCard("foul"), getCard("help", 1), getCard("clutch", 1), getCard("faceGuard", 1)],
      deck: [],
      discards: [],
    };

    const result = resolveGame(game);

    expect(result.playerA.source).toBe("foulFreeThrows");
    expect(result.playerA.score).toBe(1);
    expect(result.playerB.source).toBe("foulFreeThrows");
    expect(result.playerB.score).toBe(1);
  });

  it("spends a valid defense on the first stopped matching shoot", () => {
    const attacker = [
      getCard("threePoint", 2),
      getCard("dunk", 4),
      getCard("layup", 1),
    ];
    const defender = [getCard("faceGuard", 3), getCard("rimProtect", 4)];

    const result = resolveScoring(attacker, defender);

    expect(result.score).toBe(2);
    expect(result.successfulShoot?.kind).toBe("layup");
  });

  it("caps foul free throws at the stopped shoot point value", () => {
    const attacker = [getCard("layup", 5), ...getCards("freeThrow", 3)];
    const defender = [getCard("foul")];

    const result = resolveScoring(attacker, defender);

    expect(result.score).toBe(2);
    expect(result.source).toBe("foulFreeThrows");
  });

  it("preserves the shoot and adds one bonus free throw for And 1", () => {
    const attacker = [getCard("threePoint", 2), getCard("andOne"), ...getCards("freeThrow", 2)];
    const defender = [getCard("foul")];

    const result = resolveScoring(attacker, defender);

    expect(result.score).toBe(4);
    expect(result.source).toBe("andOne");
  });

  it("lets No Foul cancel And 1 without canceling foul conversion", () => {
    const attacker = [getCard("threePoint", 2), getCard("andOne"), ...getCards("freeThrow", 2)];
    const defender = [getCard("foul"), getCard("noFoul")];

    const result = resolveScoring(attacker, defender);

    expect(result.score).toBe(2);
    expect(result.source).toBe("foulFreeThrows");
  });

  it("uses the best Clutch copy to beat a matching defense", () => {
    const attacker = [getCard("threePoint", 2), getCard("clutch", 2), getCard("clutch", 1)];
    const defender = [getCard("faceGuard", 3)];

    const result = resolveScoring(attacker, defender);

    expect(result.score).toBe(3);
    expect(result.clutchTarget).toBe("threePoint");
  });

  it("uses Help to improve a matching defense", () => {
    const attacker = [getCard("threePoint", 4)];
    const defender = [getCard("faceGuard", 3), getCard("help", 1)];

    const result = resolveScoring(attacker, defender);

    expect(result.score).toBe(0);
    expect(result.helpTarget).toBe("faceGuard");
  });
});

function getCard(kind: CardKind, number?: number): Card {
  const card = deck.find((candidate) => {
    if (candidate.kind !== kind) {
      return false;
    }

    return number === undefined ? candidate.number === undefined : candidate.number === number;
  });

  if (!card) {
    throw new Error(`Card not found: ${kind} ${number ?? ""}`);
  }

  return card;
}

function getCards(kind: CardKind, count: number): Card[] {
  const cards = deck.filter((candidate) => candidate.kind === kind).slice(0, count);

  if (cards.length !== count) {
    throw new Error(`Not enough cards found: ${kind}`);
  }

  return cards;
}
