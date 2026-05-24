import type {
  AttemptResult,
  Card,
  DefenseKind,
  GameResolution,
  GameState,
  ScoringResult,
  ShootKind,
} from "./types";

const SHOOT_PRIORITY: readonly ShootKind[] = ["deepThree", "threePoint", "dunk", "layup"];
const NUMBERED_SHOOT_KINDS: readonly ShootKind[] = ["threePoint", "dunk", "layup"];

const VALID_DEFENSE: Partial<Record<ShootKind, DefenseKind>> = {
  layup: "rimProtect",
  dunk: "rimProtect",
  threePoint: "faceGuard",
};

const SHOOT_POINTS: Record<ShootKind, number> = {
  freeThrow: 1,
  layup: 2,
  dunk: 2,
  threePoint: 3,
  deepThree: 3,
};

interface CollapsedCards {
  shoots: Partial<Record<ShootKind, Card>>;
  freeThrowCount: number;
  clutch?: Card;
  andOne?: Card;
  defenses: Partial<Record<DefenseKind, Card>>;
  help?: Card;
  foul?: Card;
  noFoul?: Card;
}

interface ResolverChoice {
  clutchTarget?: ShootKind;
  helpTarget?: DefenseKind;
}

export function resolveGame(gameState: GameState): GameResolution {
  const playerAAvailableCards = getAvailableCards(gameState, "playerA");
  const playerBAvailableCards = getAvailableCards(gameState, "playerB");
  const playerA = resolveScoring(playerAAvailableCards, playerBAvailableCards);
  const playerB = resolveScoring(playerBAvailableCards, playerAAvailableCards);
  const scoreComparison = compareScores(playerA, playerB);
  const winner = scoreComparison > 0 ? "A" : scoreComparison < 0 ? "B" : "draw";

  return {
    playerA,
    playerB,
    winner,
    tiebreakerUsed:
      playerA.score === playerB.score && playerA.shootTiebreaker !== playerB.shootTiebreaker,
  };
}

export function getAvailableCards(
  gameState: GameState,
  player: "playerA" | "playerB",
): Card[] {
  return [...gameState[player], ...gameState.community];
}

export function resolveScoring(attackerCards: readonly Card[], defenderCards: readonly Card[]): ScoringResult {
  const attacker = collapseCards(attackerCards);
  const defender = collapseCards(defenderCards);
  const clutchTargets = getClutchTargets(attacker);
  const helpTargets = getHelpTargets(defender);

  const attackerChoices = clutchTargets.map((clutchTarget) => {
    const defenderOutcomes = helpTargets.map((helpTarget) =>
      evaluateResolution(attacker, defender, { clutchTarget, helpTarget }),
    );

    return defenderOutcomes.reduce((currentWorst, outcome) =>
      compareScores(outcome, currentWorst) < 0 ? outcome : currentWorst,
    );
  });

  return attackerChoices.reduce((currentBest, outcome) =>
    compareScores(outcome, currentBest) > 0 ? outcome : currentBest,
  );
}

function evaluateResolution(
  attacker: CollapsedCards,
  defender: CollapsedCards,
  choice: ResolverChoice,
): ScoringResult {
  const spentDefenseKinds = new Set<DefenseKind>();
  const attempts: AttemptResult[] = [];

  for (const shootKind of SHOOT_PRIORITY) {
    const shootCard = attacker.shoots[shootKind];

    if (!shootCard) {
      continue;
    }

    const scoreValue = SHOOT_POINTS[shootKind];
    const clutchValue =
      choice.clutchTarget === shootKind && attacker.clutch?.number ? attacker.clutch.number : 0;
    const offenseValue = (shootCard.number ?? 0) + clutchValue;

    if (defender.foul) {
      const freeThrowScore = Math.min(attacker.freeThrowCount, scoreValue);
      const canUseAndOne = Boolean(attacker.andOne && attacker.freeThrowCount > 0 && !defender.noFoul);
      const score = canUseAndOne ? scoreValue + SHOOT_POINTS.freeThrow : freeThrowScore;
      const outcome = canUseAndOne ? "andOne" : "foul";

      attempts.push({
        shootKind,
        shootCardId: shootCard.id,
        scoreValue: scoreValue as 1 | 2 | 3,
        offenseValue,
        outcome,
      });

      return {
        score,
        successfulShoot: canUseAndOne ? shootCard : undefined,
        shootTiebreaker: canUseAndOne ? shootCard.number ?? 0 : 0,
        source: canUseAndOne ? "andOne" : "foulFreeThrows",
        attempts,
        clutchTarget: choice.clutchTarget,
        helpTarget: choice.helpTarget,
        usedCardIds: getUsedCardIds(attacker, defender, shootCard, choice, canUseAndOne),
        summary: canUseAndOne ? "And 1" : "Foul FT",
      };
    }

    const defenseKind = VALID_DEFENSE[shootKind];
    const defenseCard = defenseKind ? defender.defenses[defenseKind] : undefined;

    if (defenseKind && defenseCard && !spentDefenseKinds.has(defenseKind)) {
      const helpValue =
        choice.helpTarget === defenseKind && defender.help?.number ? defender.help.number : 0;
      const defenseValue = (defenseCard.number ?? 0) + helpValue;

      if (defenseValue >= offenseValue) {
        spentDefenseKinds.add(defenseKind);
        attempts.push({
          shootKind,
          shootCardId: shootCard.id,
          scoreValue: scoreValue as 1 | 2 | 3,
          offenseValue,
          defenseValue,
          defenseKind,
          outcome: "stopped",
        });
        continue;
      }
    }

    attempts.push({
      shootKind,
      shootCardId: shootCard.id,
      scoreValue: scoreValue as 1 | 2 | 3,
      offenseValue,
      defenseKind,
      defenseValue: defenseCard?.number,
      outcome: "score",
    });

    return {
      score: scoreValue,
      successfulShoot: shootCard,
      shootTiebreaker: shootCard.number ?? 0,
      source: "shoot",
      attempts,
      clutchTarget: choice.clutchTarget,
      helpTarget: choice.helpTarget,
      usedCardIds: getUsedCardIds(attacker, defender, shootCard, choice, false),
      summary: "Score",
    };
  }

  return {
    score: 0,
    shootTiebreaker: 0,
    source: "none",
    attempts,
    clutchTarget: choice.clutchTarget,
    helpTarget: choice.helpTarget,
    usedCardIds: [],
    summary: "No play",
  };
}

function collapseCards(cards: readonly Card[]): CollapsedCards {
  const collapsed: CollapsedCards = {
    shoots: {},
    freeThrowCount: 0,
    defenses: {},
  };

  for (const card of cards) {
    switch (card.kind) {
      case "freeThrow":
        collapsed.freeThrowCount += 1;
        break;
      case "layup":
      case "dunk":
      case "threePoint":
      case "deepThree":
        collapsed.shoots[card.kind] = pickHighestNumberedCard(collapsed.shoots[card.kind], card);
        break;
      case "clutch":
        collapsed.clutch = pickHighestNumberedCard(collapsed.clutch, card);
        break;
      case "andOne":
        collapsed.andOne = collapsed.andOne ?? card;
        break;
      case "rimProtect":
      case "faceGuard":
        collapsed.defenses[card.kind] = pickHighestNumberedCard(collapsed.defenses[card.kind], card);
        break;
      case "help":
        collapsed.help = pickHighestNumberedCard(collapsed.help, card);
        break;
      case "foul":
        collapsed.foul = collapsed.foul ?? card;
        break;
      case "noFoul":
        collapsed.noFoul = collapsed.noFoul ?? card;
        break;
    }
  }

  return collapsed;
}

function getClutchTargets(attacker: CollapsedCards): Array<ShootKind | undefined> {
  if (!attacker.clutch) {
    return [undefined];
  }

  const targets = NUMBERED_SHOOT_KINDS.filter((shootKind) => attacker.shoots[shootKind]);
  return targets.length > 0 ? [undefined, ...targets] : [undefined];
}

function getHelpTargets(defender: CollapsedCards): Array<DefenseKind | undefined> {
  if (!defender.help) {
    return [undefined];
  }

  const targets = (["rimProtect", "faceGuard"] as const).filter(
    (defenseKind) => defender.defenses[defenseKind],
  );
  return targets.length > 0 ? [undefined, ...targets] : [undefined];
}

function getUsedCardIds(
  attacker: CollapsedCards,
  defender: CollapsedCards,
  shootCard: Card,
  choice: ResolverChoice,
  usedAndOne: boolean,
): string[] {
  const usedCardIds = [shootCard.id];

  if (choice.clutchTarget === shootCard.kind && attacker.clutch) {
    usedCardIds.push(attacker.clutch.id);
  }

  if (usedAndOne && attacker.andOne) {
    usedCardIds.push(attacker.andOne.id);
  }

  if (defender.foul) {
    usedCardIds.push(defender.foul.id);
  }

  if (defender.noFoul) {
    usedCardIds.push(defender.noFoul.id);
  }

  return usedCardIds;
}

function pickHighestNumberedCard(current: Card | undefined, candidate: Card): Card {
  return (candidate.number ?? 0) > (current?.number ?? 0) ? candidate : current ?? candidate;
}

function compareScores(left: ScoringResult, right: ScoringResult): number {
  if (left.score !== right.score) {
    return left.score - right.score;
  }

  return left.shootTiebreaker - right.shootTiebreaker;
}
