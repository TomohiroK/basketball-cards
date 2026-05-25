import type { Card, CardKind } from "./types";

const PUBLIC_DUPLICATE_EXCLUDED_KINDS: ReadonlySet<CardKind> = new Set(["freeThrow"]);

export function getPublicInvalidDuplicateCardIds(publicCards: readonly Card[]): Set<string> {
  const maxNumberByKind = new Map<CardKind, number>();

  for (const card of publicCards) {
    if (!isPublicDuplicateCandidate(card)) {
      continue;
    }

    const currentMax = maxNumberByKind.get(card.kind) ?? Number.NEGATIVE_INFINITY;
    maxNumberByKind.set(card.kind, Math.max(currentMax, card.number));
  }

  const invalidCardIds = new Set<string>();

  for (const card of publicCards) {
    if (!isPublicDuplicateCandidate(card)) {
      continue;
    }

    const maxNumber = maxNumberByKind.get(card.kind);

    if (maxNumber !== undefined && card.number < maxNumber) {
      invalidCardIds.add(card.id);
    }
  }

  return invalidCardIds;
}

export function replacePublicDuplicateCards(
  publicCards: readonly Card[],
  deck: readonly Card[],
): {
  publicCards: Card[];
  deck: Card[];
  discards: Card[];
} {
  const nextPublicCards = [...publicCards];
  const nextDeck = [...deck];
  const discards: Card[] = [];

  while (true) {
    const invalidCardIds = getPublicInvalidDuplicateCardIds(nextPublicCards);

    if (invalidCardIds.size === 0) {
      return {
        publicCards: nextPublicCards,
        deck: nextDeck,
        discards,
      };
    }

    for (const [index, card] of nextPublicCards.entries()) {
      if (!invalidCardIds.has(card.id)) {
        continue;
      }

      const replacementCard = nextDeck.shift();

      if (!replacementCard) {
        throw new Error("Deck does not have enough cards to replace public duplicates.");
      }

      discards.push(card);
      nextPublicCards[index] = replacementCard;
    }
  }
}

function isPublicDuplicateCandidate(card: Card): card is Card & { number: number } {
  return card.number !== undefined && !PUBLIC_DUPLICATE_EXCLUDED_KINDS.has(card.kind);
}
