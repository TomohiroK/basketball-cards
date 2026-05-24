export type PlayerId = "A" | "B";

export type ShootKind =
  | "freeThrow"
  | "layup"
  | "dunk"
  | "threePoint"
  | "deepThree";

export type OffensiveModifierKind = "clutch" | "andOne";
export type DefenseKind = "rimProtect" | "faceGuard";
export type DefensiveModifierKind = "help" | "foul" | "noFoul";

export type CardKind =
  | ShootKind
  | OffensiveModifierKind
  | DefenseKind
  | DefensiveModifierKind;

export type CardRole = "shoot" | "offense" | "defense";

export type NumberedKind =
  | "layup"
  | "dunk"
  | "threePoint"
  | "clutch"
  | "rimProtect"
  | "faceGuard"
  | "help";

export type PointValue = 1 | 2 | 3;

export interface Card {
  id: string;
  kind: CardKind;
  role: CardRole;
  label: string;
  number?: number;
  points?: PointValue;
}

export interface GameState {
  deck: Card[];
  playerA: Card[];
  playerB: Card[];
  community: Card[];
  discards: Card[];
}

export interface AttemptResult {
  shootKind: ShootKind;
  shootCardId: string;
  scoreValue: PointValue;
  offenseValue: number;
  offenseModifierValue?: number;
  defenseCardId?: string;
  defenseValue?: number;
  defenseModifierValue?: number;
  defenseKind?: DefenseKind;
  outcome: "score" | "stopped" | "foul" | "andOne";
}

export interface ScoringResult {
  score: number;
  successfulShoot?: Card;
  shootTiebreaker: number;
  source: "shoot" | "foulFreeThrows" | "andOne" | "none";
  attempts: AttemptResult[];
  clutchTarget?: ShootKind;
  helpTarget?: DefenseKind;
  usedCardIds: string[];
  summary: string;
}

export interface GameResolution {
  playerA: ScoringResult;
  playerB: ScoringResult;
  winner: PlayerId | "draw";
  tiebreakerUsed: boolean;
}

export interface ExchangePlan {
  playerA: number[];
  playerB: number[];
}
