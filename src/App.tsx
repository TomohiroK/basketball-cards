import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  BadgePlus,
  Circle,
  CircleDot,
  CircleDotDashed,
  Crosshair,
  Flame,
  Hand,
  OctagonX,
  Play,
  Plus,
  RefreshCw,
  Shield,
  Shuffle,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  COMMUNITY_CARD_COUNT,
  createEmptyGame,
  DECK_SIZE,
  exchangeCards,
  PRIVATE_CARD_COUNT,
} from "./game/deck";
import { resolveGame } from "./game/engine";
import { getPublicInvalidDuplicateCardIds } from "./game/publicDuplicates";
import type {
  Card,
  CardKind,
  CardRole,
  GameResolution,
  GameState,
  PlayerId,
  ScoringResult,
} from "./game/types";

type Phase = "deal" | "dealing" | "exchange" | "ready" | "resolved";
type DealTarget = "playerA" | "playerB" | "community";

interface CardVisual {
  name: string;
  guide: string;
}

interface ExchangeState {
  selectedIndexes: number[];
  committed: boolean;
}

interface BoostBadge {
  kind: "clutch" | "help";
  value: number;
}

const PLAYER_KEYS = {
  A: "playerA",
  B: "playerB",
} as const;

const DEAL_STEP_MS = 280;
const DEAL_SEQUENCE: readonly DealTarget[] = [
  "playerA",
  "playerB",
  "playerA",
  "playerB",
  "community",
  "community",
  "community",
  "community",
];

const KIND_ICONS: Record<CardKind, LucideIcon> = {
  freeThrow: Circle,
  layup: Hand,
  dunk: Zap,
  threePoint: CircleDot,
  deepThree: CircleDotDashed,
  clutch: Flame,
  andOne: BadgePlus,
  rimProtect: Shield,
  faceGuard: Crosshair,
  help: Plus,
  foul: Hand,
  noFoul: OctagonX,
};

const CARD_VISUALS: Record<CardKind, CardVisual> = {
  freeThrow: { name: "Free Throw", guide: "FT conversion" },
  layup: { name: "Layup", guide: "2pt shot" },
  dunk: { name: "Dunk", guide: "2pt shot" },
  threePoint: { name: "3PT", guide: "3pt shot" },
  deepThree: { name: "Deep 3", guide: "3pt, no normal counter" },
  clutch: { name: "Clutch", guide: "adds number to shot" },
  andOne: { name: "And 1", guide: "keeps shot plus one FT" },
  rimProtect: { name: "Rim Protect", guide: "counters Layup/Dunk" },
  faceGuard: { name: "Face Guard", guide: "counters 3PT" },
  help: { name: "Help", guide: "adds number to defense" },
  foul: { name: "Foul", guide: "forced FT conversion" },
  noFoul: { name: "No Foul", guide: "cancels And 1 only" },
};

const ROLE_LABELS: Record<CardRole, string> = {
  shoot: "Shoot",
  offense: "Offense",
  defense: "Defense",
};

const INITIAL_EXCHANGE: Record<PlayerId, ExchangeState> = {
  A: { selectedIndexes: [], committed: false },
  B: { selectedIndexes: [], committed: false },
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => createEmptyGame());
  const [phase, setPhase] = useState<Phase>("deal");
  const [dealingStep, setDealingStep] = useState(0);
  const [exchangeState, setExchangeState] =
    useState<Record<PlayerId, ExchangeState>>(INITIAL_EXCHANGE);
  const resolution = useMemo(
    () => (phase === "resolved" ? resolveGame(gameState) : undefined),
    [gameState, phase],
  );
  const boostBadges = useMemo(() => buildBoostBadgeMap(resolution), [resolution]);
  const invalidCommunityCardIds = useMemo(
    () => getPublicInvalidDuplicateCardIds(gameState.community),
    [gameState.community],
  );
  const dealtCount =
    gameState.playerA.length + gameState.playerB.length + gameState.community.length + gameState.discards.length;

  async function startDealSequence() {
    if (phase === "dealing") {
      return;
    }

    const emptyGame = createEmptyGame();
    const deck = [...emptyGame.deck];
    const dealState = {
      playerA: [] as Card[],
      playerB: [] as Card[],
      community: [] as Card[],
    };

    setExchangeState(INITIAL_EXCHANGE);
    setDealingStep(0);
    setPhase("dealing");
    publishDealState(deck, dealState);

    for (const [index, target] of DEAL_SEQUENCE.entries()) {
      await wait(DEAL_STEP_MS);

      const drawnCard = deck.shift();

      if (!drawnCard) {
        throw new Error("Deck draw failed during deal.");
      }

      dealState[target].push(drawnCard);
      publishDealState(deck, dealState);
      setDealingStep(index + 1);
    }

    setPhase("exchange");
  }

  function publishDealState(
    deck: readonly Card[],
    dealState: Pick<GameState, "playerA" | "playerB" | "community">,
  ) {
    setGameState({
      deck: [...deck],
      playerA: [...dealState.playerA],
      playerB: [...dealState.playerB],
      community: [...dealState.community],
      discards: [],
    });
  }

  function toggleExchangeCard(playerId: PlayerId, cardIndex: number) {
    if (phase !== "exchange") {
      return;
    }

    setExchangeState((current) => {
      const playerExchange = current[playerId];

      if (playerExchange.committed) {
        return current;
      }

      if (playerExchange.selectedIndexes.includes(cardIndex)) {
        return {
          ...current,
          [playerId]: {
            ...playerExchange,
            selectedIndexes: playerExchange.selectedIndexes.filter((index) => index !== cardIndex),
          },
        };
      }

      if (playerExchange.selectedIndexes.length >= PRIVATE_CARD_COUNT) {
        return current;
      }

      return {
        ...current,
        [playerId]: {
          ...playerExchange,
          selectedIndexes: [...playerExchange.selectedIndexes, cardIndex],
        },
      };
    });
  }

  function commitExchange(playerId: PlayerId) {
    if (phase !== "exchange") {
      return;
    }

    const selectedIndexes = exchangeState[playerId].selectedIndexes;

    if (selectedIndexes.length > 0) {
      setGameState((currentGameState) =>
        exchangeCards(currentGameState, PLAYER_KEYS[playerId], selectedIndexes),
      );
    }

    setExchangeState((current) => {
      const next = {
        ...current,
        [playerId]: {
          selectedIndexes: [],
          committed: true,
        },
      };

      if (next.A.committed && next.B.committed) {
        window.setTimeout(() => setPhase("ready"), 0);
      }

      return next;
    });
  }

  function resolveRound() {
    if (phase !== "ready") {
      return;
    }

    setPhase("resolved");
  }

  return (
    <main className="app-shell">
      <section className="broadcast-bar" aria-label="Game status">
        <div>
          <p className="eyebrow">Basketball Poker</p>
          <h1>Prototype Court</h1>
        </div>
        <div className="action-row">
          <button
            className="icon-button"
            type="button"
            onClick={startDealSequence}
            disabled={phase === "dealing"}
            title="Deal one card at a time"
          >
            <Shuffle aria-hidden="true" />
            <span>{formatDealButtonLabel(phase)}</span>
          </button>
          <button
            className="icon-button primary"
            type="button"
            onClick={resolveRound}
            disabled={phase !== "ready"}
            title="Play"
          >
            <Play aria-hidden="true" />
            <span>Play</span>
          </button>
        </div>
      </section>

      <section className="score-band" aria-live="polite">
        {resolution ? (
          <Scoreboard resolution={resolution} />
        ) : (
          <PregameStatus dealingStep={dealingStep} phase={phase} />
        )}
      </section>

      <DeckStatus remainingCount={gameState.deck.length} dealtCount={dealtCount} />

      <section className="table-zone" aria-label="Texas Hold'em style table">
        <PlayerPanel
          playerId="B"
          cards={gameState.playerB}
          exchange={exchangeState.B}
          phase={phase}
          result={resolution?.playerB}
          boostBadges={boostBadges}
          onToggleExchangeCard={toggleExchangeCard}
          onCommitExchange={commitExchange}
        />

        <section className="community-strip" aria-label="Community cards">
          <div className="section-heading">
            <span>Community</span>
            <span className="deck-count">{gameState.deck.length}</span>
          </div>
          <div className="card-grid community-grid">
            {Array.from({ length: COMMUNITY_CARD_COUNT }, (_, index) => {
              const card = gameState.community[index];

              return (
                <CardSlot
                  key={card?.id ?? `community-${index}`}
                  card={card}
                  invalid={card ? invalidCommunityCardIds.has(card.id) : false}
                  boost={card ? boostBadges.get(card.id) : undefined}
                  slotLabel={`Board ${index + 1}`}
                />
              );
            })}
          </div>
        </section>

        <PlayerPanel
          playerId="A"
          cards={gameState.playerA}
          exchange={exchangeState.A}
          phase={phase}
          result={resolution?.playerA}
          boostBadges={boostBadges}
          onToggleExchangeCard={toggleExchangeCard}
          onCommitExchange={commitExchange}
        />
      </section>

      <SymbolGuide />
    </main>
  );
}

function DeckStatus({ dealtCount, remainingCount }: { dealtCount: number; remainingCount: number }) {
  return (
    <section className="deck-status" aria-label="Deck status">
      <div className="deck-metric">
        <span>Deck</span>
        <strong>{DECK_SIZE}</strong>
      </div>
      <div className="deck-metric">
        <span>Dealt</span>
        <strong>{dealtCount}</strong>
      </div>
      <div className="deck-metric">
        <span>Remaining</span>
        <strong>{remainingCount}</strong>
      </div>
      <p>One shuffled deck. Each card is drawn from the remaining stack.</p>
    </section>
  );
}

interface PlayerPanelProps {
  playerId: PlayerId;
  cards: Card[];
  exchange: ExchangeState;
  phase: Phase;
  result?: ScoringResult;
  boostBadges: ReadonlyMap<string, BoostBadge>;
  onToggleExchangeCard: (playerId: PlayerId, cardIndex: number) => void;
  onCommitExchange: (playerId: PlayerId) => void;
}

function PlayerPanel({
  playerId,
  cards,
  exchange,
  phase,
  result,
  boostBadges,
  onToggleExchangeCard,
  onCommitExchange,
}: PlayerPanelProps) {
  const canSelectCards = phase === "exchange" && !exchange.committed;
  const selectedCount = exchange.selectedIndexes.length;

  return (
    <section className={`player-panel seat-${playerId.toLowerCase()}`} aria-label={`Player ${playerId}`}>
      <div className="section-heading">
        <span>Player {playerId}</span>
        {result ? <ResultChip result={result} /> : <span className="phase-chip">{formatPanelPhase(phase)}</span>}
      </div>

      <div className="card-grid private-grid">
        {Array.from({ length: PRIVATE_CARD_COUNT }, (_, index) => (
          <CardSlot
            key={cards[index]?.id ?? `${playerId}-${index}`}
            card={cards[index]}
            boost={cards[index] ? boostBadges.get(cards[index].id) : undefined}
            selectable={Boolean(cards[index]) && canSelectCards}
            selected={exchange.selectedIndexes.includes(index)}
            slotLabel={`Hand ${index + 1}`}
            onClick={() => onToggleExchangeCard(playerId, index)}
          />
        ))}
      </div>

      <div className="exchange-controls" aria-label={`Player ${playerId} exchange options`}>
        {phase === "exchange" && !exchange.committed ? (
          <div className="exchange-prompt">
            <span>Tap cards to exchange</span>
            <strong>{selectedCount}/2 selected</strong>
          </div>
        ) : null}
        {phase === "exchange" && !exchange.committed ? (
          <button
            type="button"
            className={selectedCount > 0 ? "exchange-action primary" : "exchange-action"}
            onClick={() => onCommitExchange(playerId)}
          >
            {selectedCount > 0 ? (
              <>
                <ArrowRightLeft aria-hidden="true" />
                <span>{selectedCount === 1 ? "Change 1 card" : "Change 2 cards"}</span>
              </>
            ) : (
              <span>Keep hand</span>
            )}
          </button>
        ) : null}
        {exchange.committed ? (
          <span className="exchange-done">Exchange done</span>
        ) : null}
      </div>

      {result ? (
        <>
          <AttemptTrack result={result} />
          <ResolutionNote result={result} />
        </>
      ) : null}
    </section>
  );
}

interface CardSlotProps {
  card?: Card;
  invalid?: boolean;
  boost?: BoostBadge;
  selectable?: boolean;
  selected?: boolean;
  slotLabel: string;
  onClick?: () => void;
}

function CardSlot({
  card,
  invalid = false,
  boost,
  selectable = false,
  selected = false,
  slotLabel,
  onClick,
}: CardSlotProps) {
  return (
    <div className={`card-slot ${card ? "filled" : "empty"} ${invalid ? "invalid" : ""}`}>
      {card ? (
        <CardFace
          card={card}
          invalid={invalid}
          boost={boost}
          selectable={selectable}
          selected={selected}
          onClick={onClick}
        />
      ) : (
        <div className="card-placeholder" aria-label={`${slotLabel} empty`}>
          <span>{slotLabel}</span>
        </div>
      )}
      <span className="card-name">{card ? CARD_VISUALS[card.kind].name : slotLabel}</span>
      {card ? <span className={`card-role role-text-${card.role}`}>{ROLE_LABELS[card.role]}</span> : null}
    </div>
  );
}

interface CardFaceProps {
  card: Card;
  invalid?: boolean;
  boost?: BoostBadge;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

function CardFace({
  card,
  invalid = false,
  boost,
  selectable = false,
  selected = false,
  onClick,
}: CardFaceProps) {
  const Icon = KIND_ICONS[card.kind];
  const pointMarkers = Array.from({ length: card.points ?? 0 }, (_, index) => index);
  const cornerValue = card.number ?? card.points ?? (card.kind === "andOne" ? 1 : undefined);

  return (
    <button
      type="button"
      className={`card-face role-${card.role} kind-${card.kind} ${selected ? "selected" : ""} ${
        invalid ? "invalid" : ""
      }`}
      aria-label={`${formatCardAria(card)}${invalid ? ", invalid public duplicate" : ""}`}
      disabled={!selectable}
      onClick={onClick}
    >
      {boost && !invalid ? (
        <span className={`boost-badge ${boost.kind}`} aria-hidden="true">
          +{boost.value}
        </span>
      ) : null}
      {invalid ? (
        <span className="invalid-overlay" aria-hidden="true">
          無効
        </span>
      ) : null}
      <span className="role-rail" aria-hidden="true" />
      <span className="corner-number" aria-hidden="true">
        {cornerValue}
      </span>
      <Icon className="card-icon" aria-hidden="true" strokeWidth={2.4} />
      <span className="point-markers" aria-hidden="true">
        {pointMarkers.map((index) => (
          <span key={index} />
        ))}
      </span>
    </button>
  );
}

function PregameStatus({ dealingStep, phase }: { dealingStep: number; phase: Phase }) {
  return (
    <div className="pregame-status">
      <RefreshCw aria-hidden="true" />
      <span>{formatPhaseStatus(phase, dealingStep)}</span>
    </div>
  );
}

function Scoreboard({ resolution }: { resolution: GameResolution }) {
  const winnerText = resolution.winner === "draw" ? "Draw" : `Player ${resolution.winner}`;

  return (
    <div className="scoreboard">
      <ScoreCell playerId="A" result={resolution.playerA} />
      <div className="winner-cell">
        <Trophy aria-hidden="true" />
        <span>{winnerText}</span>
      </div>
      <ScoreCell playerId="B" result={resolution.playerB} />
    </div>
  );
}

function ScoreCell({ playerId, result }: { playerId: PlayerId; result: ScoringResult }) {
  return (
    <div className="score-cell">
      <span className="score-player">P{playerId}</span>
      <strong>{result.score}</strong>
      <span className="tie-number">#{result.shootTiebreaker}</span>
    </div>
  );
}

function ResultChip({ result }: { result: ScoringResult }) {
  return (
    <span className={`result-chip source-${result.source}`}>
      {result.score}
      <small>#{result.shootTiebreaker}</small>
    </span>
  );
}

function AttemptTrack({ result }: { result: ScoringResult }) {
  if (result.attempts.length === 0) {
    return <div className="attempt-track empty">0</div>;
  }

  return (
    <div className="attempt-track" aria-label="Resolution attempts">
      {result.attempts.map((attempt) => {
        const Icon = KIND_ICONS[attempt.shootKind];

        return (
          <span key={`${attempt.shootCardId}-${attempt.outcome}`} className={`attempt ${attempt.outcome}`}>
            <Icon aria-hidden="true" />
            <b>{attempt.scoreValue}</b>
            <small>{attempt.offenseValue}</small>
          </span>
        );
      })}
    </div>
  );
}

function ResolutionNote({ result }: { result: ScoringResult }) {
  const lines =
    result.attempts.length > 0
      ? result.attempts.map((attempt) => formatAttemptLine(result, attempt))
      : ["No valid scoring play."];

  return (
    <div className="resolution-note" aria-label="Resolution detail">
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
}

function SymbolGuide() {
  const guideGroups: Array<{ title: string; kinds: CardKind[] }> = [
    { title: "Shoot", kinds: ["freeThrow", "layup", "dunk", "threePoint", "deepThree"] },
    { title: "Defense", kinds: ["rimProtect", "faceGuard", "foul", "noFoul"] },
    { title: "Modifier", kinds: ["clutch", "andOne", "help"] },
  ];

  return (
    <section className="symbol-guide" aria-label="Card symbol guide">
      {guideGroups.map((group) => (
        <div className="guide-group" key={group.title}>
          <h2>{group.title}</h2>
          <div className="guide-items">
            {group.kinds.map((kind) => {
              const Icon = KIND_ICONS[kind];
              const visual = CARD_VISUALS[kind];

              return (
                <div className={`guide-item kind-${kind}`} key={kind}>
                  <Icon aria-hidden="true" />
                  <span>{visual.name}</span>
                  <small>{visual.guide}</small>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function formatAttemptLine(result: ScoringResult, attempt: ScoringResult["attempts"][number]): string {
  const shootName = CARD_VISUALS[attempt.shootKind].name;
  const defenseName = attempt.defenseKind ? CARD_VISUALS[attempt.defenseKind].name : undefined;

  if (attempt.outcome === "andOne") {
    const freeThrowBonus = result.score - attempt.scoreValue;
    return `${shootName}: forced Foul, And 1 keeps ${attempt.scoreValue} + bonus FT ${freeThrowBonus} = ${result.score}.`;
  }

  if (attempt.outcome === "foul") {
    return `${shootName}: forced Foul, normal shot stops, FT conversion = ${result.score}.`;
  }

  if (attempt.outcome === "stopped") {
    return `${shootName}: stopped by ${defenseName} ${attempt.defenseValue} vs ${attempt.offenseValue}.`;
  }

  if (defenseName && attempt.defenseValue !== undefined) {
    return `${shootName}: ${attempt.offenseValue} beats ${defenseName} ${attempt.defenseValue}, scores ${attempt.scoreValue}.`;
  }

  return `${shootName}: no matching defense, scores ${attempt.scoreValue}.`;
}

function formatCardAria(card: Card): string {
  const parts = [card.label];

  if (card.number) {
    parts.push(`number ${card.number}`);
  }

  if (card.points) {
    parts.push(`${card.points} points`);
  }

  return parts.join(", ");
}

function formatPanelPhase(phase: Phase): string {
  return phase === "deal" ? "empty" : phase;
}

function formatDealButtonLabel(phase: Phase): string {
  if (phase === "dealing") {
    return "Dealing";
  }

  return phase === "deal" ? "Deal" : "New Hand";
}

function formatPhaseStatus(phase: Phase, dealingStep: number): string {
  switch (phase) {
    case "deal":
      return "Press Deal";
    case "dealing":
      return `Dealing ${dealingStep}/${DEAL_SEQUENCE.length}`;
    case "exchange":
      return "Exchange phase";
    case "ready":
      return "Ready to play";
    case "resolved":
      return "Played";
  }
}

function buildBoostBadgeMap(resolution: GameResolution | undefined): ReadonlyMap<string, BoostBadge> {
  const boostBadges = new Map<string, BoostBadge>();

  if (!resolution) {
    return boostBadges;
  }

  for (const result of [resolution.playerA, resolution.playerB]) {
    for (const attempt of result.attempts) {
      if (attempt.offenseModifierValue) {
        addBoostBadge(boostBadges, attempt.shootCardId, {
          kind: "clutch",
          value: attempt.offenseModifierValue,
        });
      }

      if (attempt.defenseCardId && attempt.defenseModifierValue) {
        addBoostBadge(boostBadges, attempt.defenseCardId, {
          kind: "help",
          value: attempt.defenseModifierValue,
        });
      }
    }
  }

  return boostBadges;
}

function addBoostBadge(boostBadges: Map<string, BoostBadge>, cardId: string, nextBadge: BoostBadge) {
  const currentBadge = boostBadges.get(cardId);

  if (!currentBadge || nextBadge.value > currentBadge.value) {
    boostBadges.set(cardId, nextBadge);
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
