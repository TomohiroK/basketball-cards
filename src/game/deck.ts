import type { Card, CardKind, CardRole, GameState, NumberedKind, PointValue } from "./types";

const FREE_THROW_COUNT = 7;
const DEEP_THREE_COUNT = 2;
const AND_ONE_COUNT = 7;
const FOUL_COUNT = 2;
const NO_FOUL_COUNT = 1;

const NUMBER_RANGES: Record<NumberedKind, readonly number[]> = {
  layup: [1, 2, 3, 4, 5],
  dunk: [4, 5, 6, 7, 8],
  threePoint: [1, 2, 3, 4],
  clutch: [1, 2, 3, 4],
  rimProtect: [1, 2, 3, 4, 5, 6, 7, 8],
  faceGuard: [1, 2, 3],
  help: [1, 2, 3, 4],
};

const CARD_META: Record<CardKind, { label: string; role: CardRole; points?: PointValue }> = {
  freeThrow: { label: "Free Throw", role: "shoot", points: 1 },
  layup: { label: "Layup", role: "shoot", points: 2 },
  dunk: { label: "Dunk", role: "shoot", points: 2 },
  threePoint: { label: "3PT", role: "shoot", points: 3 },
  deepThree: { label: "Deep 3", role: "shoot", points: 3 },
  clutch: { label: "Clutch", role: "offense" },
  andOne: { label: "And 1", role: "offense" },
  rimProtect: { label: "Rim Protect", role: "defense" },
  faceGuard: { label: "Face Guard", role: "defense" },
  help: { label: "Help", role: "defense" },
  foul: { label: "Foul", role: "defense" },
  noFoul: { label: "No Foul", role: "defense" },
};

export const DECK_SIZE = 52;
export const PRIVATE_CARD_COUNT = 2;
export const COMMUNITY_CARD_COUNT = 4;

export function createDeck(): Card[] {
  const cards: Card[] = [];

  for (const kind of Object.keys(NUMBER_RANGES) as NumberedKind[]) {
    for (const number of NUMBER_RANGES[kind]) {
      cards.push(createNumberedCard(kind, number));
    }
  }

  cards.push(...createRepeatedCards("freeThrow", FREE_THROW_COUNT));
  cards.push(...createRepeatedCards("deepThree", DEEP_THREE_COUNT));
  cards.push(...createRepeatedCards("andOne", AND_ONE_COUNT));
  cards.push(...createRepeatedCards("foul", FOUL_COUNT));
  cards.push(...createRepeatedCards("noFoul", NO_FOUL_COUNT));

  return cards;
}

export function shuffleDeck(cards: readonly Card[], random = Math.random): Card[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function dealGame(random = Math.random): GameState {
  const deck = shuffleDeck(createDeck(), random);
  const playerA = deck.splice(0, PRIVATE_CARD_COUNT);
  const playerB = deck.splice(0, PRIVATE_CARD_COUNT);
  const community = deck.splice(0, COMMUNITY_CARD_COUNT);

  return {
    deck,
    playerA,
    playerB,
    community,
    discards: [],
  };
}

export function createEmptyGame(random = Math.random): GameState {
  return {
    deck: shuffleDeck(createDeck(), random),
    playerA: [],
    playerB: [],
    community: [],
    discards: [],
  };
}

export function exchangeCards(
  gameState: GameState,
  player: "playerA" | "playerB",
  privateIndexes: readonly number[],
): GameState {
  const uniqueIndexes = [...new Set(privateIndexes)].filter(
    (index) => index >= 0 && index < PRIVATE_CARD_COUNT,
  );

  if (uniqueIndexes.length === 0) {
    return gameState;
  }

  if (gameState.deck.length < uniqueIndexes.length) {
    throw new Error("Deck does not have enough cards for exchange.");
  }

  const nextDeck = [...gameState.deck];
  const nextPrivateCards = [...gameState[player]];
  const discards = [...gameState.discards];

  for (const index of uniqueIndexes) {
    const drawnCard = nextDeck.shift();

    if (!drawnCard) {
      throw new Error("Deck draw failed during exchange.");
    }

    discards.push(nextPrivateCards[index]);
    nextPrivateCards[index] = drawnCard;
  }

  return {
    ...gameState,
    deck: nextDeck,
    [player]: nextPrivateCards,
    discards,
  };
}

function createNumberedCard(kind: NumberedKind, number: number): Card {
  const meta = CARD_META[kind];

  return {
    id: `${kind}-${number}`,
    kind,
    label: meta.label,
    role: meta.role,
    points: meta.points,
    number,
  };
}

function createRepeatedCards(kind: CardKind, count: number): Card[] {
  const meta = CARD_META[kind];

  return Array.from({ length: count }, (_, index) => ({
    id: `${kind}-${index + 1}`,
    kind,
    label: meta.label,
    role: meta.role,
    points: meta.points,
  }));
}
