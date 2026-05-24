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

function isPublicDuplicateCandidate(card: Card): card is Card & { number: number } {
  return card.number !== undefined && !PUBLIC_DUPLICATE_EXCLUDED_KINDS.has(card.kind);
}

