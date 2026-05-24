import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  BadgePlus,
  Circle,
  CircleDot,
  CircleDotDashed,
  Crosshair,
  Flame,
  Hand,
  Languages,
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
} from "../src/game/deck";
import { resolveGame } from "../src/game/engine";
import { getPublicInvalidDuplicateCardIds } from "../src/game/publicDuplicates";
import type {
  Card,
  CardKind,
  CardRole,
  GameResolution,
  GameState,
  PlayerId,
  ScoringResult,
} from "../src/game/types";

type Phase = "deal" | "dealing" | "exchange" | "ready" | "resolved";
type DealTarget = "playerA" | "playerB" | "community";
type Language = "en" | "ja";
type GuideGroupKey = "shoot" | "defense" | "modifier";

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

interface Translation {
  app: {
    gameStatus: string;
    productName: string;
    title: string;
    languageTitle: string;
    languageButton: string;
    dealTitle: string;
    tableLabel: string;
    symbolGuide: string;
  };
  actions: {
    deal: string;
    dealing: string;
    newHand: string;
    play: string;
  };
  deck: {
    label: string;
    dealt: string;
    remaining: string;
    statusLabel: string;
    note: string;
  };
  exchange: {
    tapCards: string;
    selected: (count: number) => string;
    changeOne: string;
    changeTwo: string;
    keep: string;
    done: string;
  };
  phase: Record<Phase | "empty", string>;
  status: {
    pressDeal: string;
    dealing: (step: number, total: number) => string;
  };
  table: {
    player: (playerId: PlayerId) => string;
    community: string;
    communityCards: string;
    hand: (index: number) => string;
    board: (index: number) => string;
    emptySlot: (slotLabel: string) => string;
    exchangeOptions: (playerId: PlayerId) => string;
  };
  card: {
    invalid: string;
    invalidDuplicate: string;
    number: (number: number) => string;
    points: (points: number) => string;
  };
  cards: Record<CardKind, CardVisual>;
  roles: Record<CardRole, string>;
  guideGroups: Record<GuideGroupKey, string>;
  score: {
    draw: string;
    player: (playerId: PlayerId) => string;
    wonByCard: (playerId: PlayerId) => string;
  };
  resolution: {
    attempts: string;
    detail: string;
    noValidPlay: string;
    andOne: (shootName: string, scoreValue: number, freeThrowBonus: number, score: number) => string;
    foul: (shootName: string, score: number) => string;
    stopped: (shootName: string, defenseName: string | undefined, defenseValue: number | undefined, offenseValue: number) => string;
    beats: (shootName: string, offenseValue: number, defenseName: string, defenseValue: number, scoreValue: number) => string;
    noDefense: (shootName: string, scoreValue: number) => string;
  };
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

const LANGUAGE_STORAGE_KEY = "basketball-poker-language";

const TRANSLATIONS: Record<Language, Translation> = {
  en: {
    app: {
      gameStatus: "Game status",
      productName: "Basketball Poker",
      title: "Prototype Court",
      languageTitle: "Switch language",
      languageButton: "日本語",
      dealTitle: "Deal one card at a time",
      tableLabel: "Texas Hold'em style table",
      symbolGuide: "Card symbol guide",
    },
    actions: {
      deal: "Deal",
      dealing: "Dealing",
      newHand: "New Hand",
      play: "Play",
    },
    deck: {
      label: "Deck",
      dealt: "Dealt",
      remaining: "Remaining",
      statusLabel: "Deck status",
      note: "One shuffled deck. Each card is drawn from the remaining stack.",
    },
    exchange: {
      tapCards: "Tap cards to exchange",
      selected: (count) => `${count}/2 selected`,
      changeOne: "Change 1 card",
      changeTwo: "Change 2 cards",
      keep: "Keep hand",
      done: "Exchange done",
    },
    phase: {
      deal: "empty",
      dealing: "dealing",
      exchange: "exchange",
      ready: "ready",
      resolved: "played",
      empty: "empty",
    },
    status: {
      pressDeal: "Press Deal",
      dealing: (step, total) => `Dealing ${step}/${total}`,
    },
    table: {
      player: (playerId) => `Player ${playerId}`,
      community: "Community",
      communityCards: "Community cards",
      hand: (index) => `Hand ${index}`,
      board: (index) => `Board ${index}`,
      emptySlot: (slotLabel) => `${slotLabel} empty`,
      exchangeOptions: (playerId) => `Player ${playerId} exchange options`,
    },
    card: {
      invalid: "Invalid",
      invalidDuplicate: "invalid public duplicate",
      number: (number) => `number ${number}`,
      points: (points) => `${points} ${points === 1 ? "point" : "points"}`,
    },
    cards: {
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
    },
    roles: {
      shoot: "Shoot",
      offense: "Offense",
      defense: "Defense",
    },
    guideGroups: {
      shoot: "Shoot",
      defense: "Defense",
      modifier: "Modifier",
    },
    score: {
      draw: "Draw",
      player: (playerId) => `Player ${playerId}`,
      wonByCard: (playerId) => `Player ${playerId} won by Card`,
    },
    resolution: {
      attempts: "Resolution attempts",
      detail: "Resolution detail",
      noValidPlay: "No valid scoring play.",
      andOne: (shootName, scoreValue, freeThrowBonus, score) =>
        `${shootName}: forced Foul, And 1 keeps ${scoreValue} + bonus FT ${freeThrowBonus} = ${score}.`,
      foul: (shootName, score) =>
        `${shootName}: forced Foul, normal shot stops, FT conversion = ${score}.`,
      stopped: (shootName, defenseName, defenseValue, offenseValue) =>
        `${shootName}: stopped by ${defenseName} ${defenseValue} vs ${offenseValue}.`,
      beats: (shootName, offenseValue, defenseName, defenseValue, scoreValue) =>
        `${shootName}: ${offenseValue} beats ${defenseName} ${defenseValue}, scores ${scoreValue}.`,
      noDefense: (shootName, scoreValue) =>
        `${shootName}: no matching defense, scores ${scoreValue}.`,
    },
  },
  ja: {
    app: {
      gameStatus: "ゲーム状況",
      productName: "バスケットボールポーカー",
      title: "プロトタイプコート",
      languageTitle: "言語を切り替え",
      languageButton: "English",
      dealTitle: "1枚ずつ配る",
      tableLabel: "テキサスホールデム形式のテーブル",
      symbolGuide: "カードシンボルガイド",
    },
    actions: {
      deal: "ディール",
      dealing: "配布中",
      newHand: "新しい手札",
      play: "プレイ",
    },
    deck: {
      label: "デッキ",
      dealt: "配布",
      remaining: "残り",
      statusLabel: "デッキ状況",
      note: "1つのシャッフル済みデッキから、残り山札を1枚ずつ引きます。",
    },
    exchange: {
      tapCards: "交換するカードをタップ",
      selected: (count) => `${count}/2 選択中`,
      changeOne: "1枚交換",
      changeTwo: "2枚交換",
      keep: "キープ",
      done: "交換完了",
    },
    phase: {
      deal: "未配布",
      dealing: "配布中",
      exchange: "交換",
      ready: "プレイ待ち",
      resolved: "プレイ済み",
      empty: "未配布",
    },
    status: {
      pressDeal: "ディールを押してください",
      dealing: (step, total) => `配布中 ${step}/${total}`,
    },
    table: {
      player: (playerId) => `Player ${playerId}`,
      community: "場",
      communityCards: "場のカード",
      hand: (index) => `手札 ${index}`,
      board: (index) => `場 ${index}`,
      emptySlot: (slotLabel) => `${slotLabel} 空き`,
      exchangeOptions: (playerId) => `Player ${playerId} の交換操作`,
    },
    card: {
      invalid: "無効",
      invalidDuplicate: "公開重複により無効",
      number: (number) => `数字 ${number}`,
      points: (points) => `${points}点`,
    },
    cards: {
      freeThrow: { name: "フリースロー", guide: "FT変換" },
      layup: { name: "レイアップ", guide: "2点シュート" },
      dunk: { name: "ダンク", guide: "2点シュート" },
      threePoint: { name: "3PT", guide: "3点シュート" },
      deepThree: { name: "ディープ3", guide: "3点、通常カウンターなし" },
      clutch: { name: "クラッチ", guide: "シュートに数字を加算" },
      andOne: { name: "And 1", guide: "シュート保持 + FT 1本" },
      rimProtect: { name: "リムプロテクト", guide: "レイアップ/ダンクを止める" },
      faceGuard: { name: "フェイスガード", guide: "3PTを止める" },
      help: { name: "ヘルプ", guide: "守備に数字を加算" },
      foul: { name: "ファール", guide: "強制FT変換" },
      noFoul: { name: "ノーファール", guide: "And 1のみ取消" },
    },
    roles: {
      shoot: "シュート",
      offense: "オフェンス",
      defense: "ディフェンス",
    },
    guideGroups: {
      shoot: "シュート",
      defense: "ディフェンス",
      modifier: "モディファイア",
    },
    score: {
      draw: "引き分け",
      player: (playerId) => `Player ${playerId}`,
      wonByCard: (playerId) => `Player ${playerId} がカード差で勝利`,
    },
    resolution: {
      attempts: "判定トラック",
      detail: "判定詳細",
      noValidPlay: "有効な得点プレイなし。",
      andOne: (shootName, scoreValue, freeThrowBonus, score) =>
        `${shootName}: ファール発生、And 1で${scoreValue}点を保持 + ボーナスFT ${freeThrowBonus} = ${score}。`,
      foul: (shootName, score) =>
        `${shootName}: ファール発生、通常シュートは停止、FT変換 = ${score}。`,
      stopped: (shootName, defenseName, defenseValue, offenseValue) =>
        `${shootName}: ${defenseName} ${defenseValue} vs ${offenseValue} で停止。`,
      beats: (shootName, offenseValue, defenseName, defenseValue, scoreValue) =>
        `${shootName}: ${offenseValue} が ${defenseName} ${defenseValue} を上回り、${scoreValue}点。`,
      noDefense: (shootName, scoreValue) =>
        `${shootName}: 対応する守備なし、${scoreValue}点。`,
    },
  },
};

const INITIAL_EXCHANGE: Record<PlayerId, ExchangeState> = {
  A: { selectedIndexes: [], committed: false },
  B: { selectedIndexes: [], committed: false },
};

export default function App() {
  const [language, setLanguage] = useState<Language>(() => getInitialLanguage());
  const [gameState, setGameState] = useState<GameState>(() => createEmptyGame());
  const [phase, setPhase] = useState<Phase>("deal");
  const [dealingStep, setDealingStep] = useState(0);
  const [exchangeState, setExchangeState] =
    useState<Record<PlayerId, ExchangeState>>(INITIAL_EXCHANGE);
  const t = TRANSLATIONS[language];
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

  useEffect(() => {
    document.documentElement.lang = language;

    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Language still works without persistence when storage is unavailable.
    }
  }, [language]);

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

  function toggleLanguage() {
    setLanguage((currentLanguage) => (currentLanguage === "en" ? "ja" : "en"));
  }

  return (
    <main className="app-shell">
      <section className="broadcast-bar" aria-label={t.app.gameStatus}>
        <div>
          <p className="eyebrow">{t.app.productName}</p>
          <h1>{t.app.title}</h1>
        </div>
        <div className="action-row">
          <button
            className="icon-button language-button"
            type="button"
            onClick={toggleLanguage}
            title={t.app.languageTitle}
            aria-label={t.app.languageTitle}
          >
            <Languages aria-hidden="true" />
            <span>{t.app.languageButton}</span>
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={startDealSequence}
            disabled={phase === "dealing"}
            title={t.app.dealTitle}
          >
            <Shuffle aria-hidden="true" />
            <span>{formatDealButtonLabel(phase, t)}</span>
          </button>
          <button
            className="icon-button primary"
            type="button"
            onClick={resolveRound}
            disabled={phase !== "ready"}
            title={t.actions.play}
          >
            <Play aria-hidden="true" />
            <span>{t.actions.play}</span>
          </button>
        </div>
      </section>

      <section className="score-band" aria-live="polite">
        {resolution ? (
          <Scoreboard resolution={resolution} t={t} />
        ) : (
          <PregameStatus dealingStep={dealingStep} phase={phase} t={t} />
        )}
      </section>

      <DeckStatus remainingCount={gameState.deck.length} dealtCount={dealtCount} t={t} />

      <section className="table-zone" aria-label={t.app.tableLabel}>
        <PlayerPanel
          playerId="B"
          cards={gameState.playerB}
          exchange={exchangeState.B}
          phase={phase}
          result={resolution?.playerB}
          boostBadges={boostBadges}
          t={t}
          onToggleExchangeCard={toggleExchangeCard}
          onCommitExchange={commitExchange}
        />

        <section className="community-strip" aria-label={t.table.communityCards}>
          <div className="section-heading">
            <span>{t.table.community}</span>
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
                  slotLabel={t.table.board(index + 1)}
                  t={t}
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
          t={t}
          onToggleExchangeCard={toggleExchangeCard}
          onCommitExchange={commitExchange}
        />
      </section>

      <SymbolGuide t={t} />
    </main>
  );
}

function DeckStatus({
  dealtCount,
  remainingCount,
  t,
}: {
  dealtCount: number;
  remainingCount: number;
  t: Translation;
}) {
  return (
    <section className="deck-status" aria-label={t.deck.statusLabel}>
      <div className="deck-metric">
        <span>{t.deck.label}</span>
        <strong>{DECK_SIZE}</strong>
      </div>
      <div className="deck-metric">
        <span>{t.deck.dealt}</span>
        <strong>{dealtCount}</strong>
      </div>
      <div className="deck-metric">
        <span>{t.deck.remaining}</span>
        <strong>{remainingCount}</strong>
      </div>
      <p>{t.deck.note}</p>
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
  t: Translation;
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
  t,
  onToggleExchangeCard,
  onCommitExchange,
}: PlayerPanelProps) {
  const canSelectCards = phase === "exchange" && !exchange.committed;
  const selectedCount = exchange.selectedIndexes.length;

  return (
    <section className={`player-panel seat-${playerId.toLowerCase()}`} aria-label={t.table.player(playerId)}>
      <div className="section-heading">
        <span>{t.table.player(playerId)}</span>
        {result ? <ResultChip result={result} /> : <span className="phase-chip">{formatPanelPhase(phase, t)}</span>}
      </div>

      <div className="card-grid private-grid">
        {Array.from({ length: PRIVATE_CARD_COUNT }, (_, index) => (
          <CardSlot
            key={cards[index]?.id ?? `${playerId}-${index}`}
            card={cards[index]}
            boost={cards[index] ? boostBadges.get(cards[index].id) : undefined}
            selectable={Boolean(cards[index]) && canSelectCards}
            selected={exchange.selectedIndexes.includes(index)}
            slotLabel={t.table.hand(index + 1)}
            t={t}
            onClick={() => onToggleExchangeCard(playerId, index)}
          />
        ))}
      </div>

      <div className="exchange-controls" aria-label={t.table.exchangeOptions(playerId)}>
        {phase === "exchange" && !exchange.committed ? (
          <div className="exchange-prompt">
            <span>{t.exchange.tapCards}</span>
            <strong>{t.exchange.selected(selectedCount)}</strong>
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
                <span>{selectedCount === 1 ? t.exchange.changeOne : t.exchange.changeTwo}</span>
              </>
            ) : (
              <span>{t.exchange.keep}</span>
            )}
          </button>
        ) : null}
        {exchange.committed ? (
          <span className="exchange-done">{t.exchange.done}</span>
        ) : null}
      </div>

      {result ? (
        <>
          <AttemptTrack result={result} t={t} />
          <ResolutionNote result={result} t={t} />
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
  t: Translation;
  onClick?: () => void;
}

function CardSlot({
  card,
  invalid = false,
  boost,
  selectable = false,
  selected = false,
  slotLabel,
  t,
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
          t={t}
          onClick={onClick}
        />
      ) : (
        <div className="card-placeholder" aria-label={t.table.emptySlot(slotLabel)}>
          <span>{slotLabel}</span>
        </div>
      )}
      <span className="card-name">{card ? t.cards[card.kind].name : slotLabel}</span>
      {card ? <span className={`card-role role-text-${card.role}`}>{t.roles[card.role]}</span> : null}
    </div>
  );
}

interface CardFaceProps {
  card: Card;
  invalid?: boolean;
  boost?: BoostBadge;
  selectable?: boolean;
  selected?: boolean;
  t: Translation;
  onClick?: () => void;
}

function CardFace({
  card,
  invalid = false,
  boost,
  selectable = false,
  selected = false,
  t,
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
      aria-label={`${formatCardAria(card, t)}${invalid ? `, ${t.card.invalidDuplicate}` : ""}`}
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
          {t.card.invalid}
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

function PregameStatus({
  dealingStep,
  phase,
  t,
}: {
  dealingStep: number;
  phase: Phase;
  t: Translation;
}) {
  return (
    <div className="pregame-status">
      <RefreshCw aria-hidden="true" />
      <span>{formatPhaseStatus(phase, dealingStep, t)}</span>
    </div>
  );
}

function Scoreboard({ resolution, t }: { resolution: GameResolution; t: Translation }) {
  const winnerText = formatWinnerText(resolution, t);

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

function formatWinnerText(resolution: GameResolution, t: Translation): string {
  if (resolution.winner === "draw") {
    return t.score.draw;
  }

  return resolution.tiebreakerUsed ? t.score.wonByCard(resolution.winner) : t.score.player(resolution.winner);
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

function AttemptTrack({ result, t }: { result: ScoringResult; t: Translation }) {
  if (result.attempts.length === 0) {
    return <div className="attempt-track empty">0</div>;
  }

  return (
    <div className="attempt-track" aria-label={t.resolution.attempts}>
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

function ResolutionNote({ result, t }: { result: ScoringResult; t: Translation }) {
  const lines =
    result.attempts.length > 0
      ? result.attempts.map((attempt) => formatAttemptLine(result, attempt, t))
      : [t.resolution.noValidPlay];

  return (
    <div className="resolution-note" aria-label={t.resolution.detail}>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  );
}

function SymbolGuide({ t }: { t: Translation }) {
  const guideGroups: Array<{ title: string; kinds: CardKind[] }> = [
    { title: t.guideGroups.shoot, kinds: ["freeThrow", "layup", "dunk", "threePoint", "deepThree"] },
    { title: t.guideGroups.defense, kinds: ["rimProtect", "faceGuard", "foul", "noFoul"] },
    { title: t.guideGroups.modifier, kinds: ["clutch", "andOne", "help"] },
  ];

  return (
    <section className="symbol-guide" aria-label={t.app.symbolGuide}>
      {guideGroups.map((group) => (
        <div className="guide-group" key={group.title}>
          <h2>{group.title}</h2>
          <div className="guide-items">
            {group.kinds.map((kind) => {
              const Icon = KIND_ICONS[kind];
              const visual = t.cards[kind];

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

function formatAttemptLine(
  result: ScoringResult,
  attempt: ScoringResult["attempts"][number],
  t: Translation,
): string {
  const shootName = t.cards[attempt.shootKind].name;
  const defenseName = attempt.defenseKind ? t.cards[attempt.defenseKind].name : undefined;

  if (attempt.outcome === "andOne") {
    const freeThrowBonus = result.score - attempt.scoreValue;
    return t.resolution.andOne(shootName, attempt.scoreValue, freeThrowBonus, result.score);
  }

  if (attempt.outcome === "foul") {
    return t.resolution.foul(shootName, result.score);
  }

  if (attempt.outcome === "stopped") {
    return t.resolution.stopped(shootName, defenseName, attempt.defenseValue, attempt.offenseValue);
  }

  if (defenseName && attempt.defenseValue !== undefined) {
    return t.resolution.beats(
      shootName,
      attempt.offenseValue,
      defenseName,
      attempt.defenseValue,
      attempt.scoreValue,
    );
  }

  return t.resolution.noDefense(shootName, attempt.scoreValue);
}

function formatCardAria(card: Card, t: Translation): string {
  const parts = [t.cards[card.kind].name];

  if (card.number) {
    parts.push(t.card.number(card.number));
  }

  if (card.points) {
    parts.push(t.card.points(card.points));
  }

  return parts.join(", ");
}

function formatPanelPhase(phase: Phase, t: Translation): string {
  return t.phase[phase === "deal" ? "empty" : phase];
}

function formatDealButtonLabel(phase: Phase, t: Translation): string {
  if (phase === "dealing") {
    return t.actions.dealing;
  }

  return phase === "deal" ? t.actions.deal : t.actions.newHand;
}

function formatPhaseStatus(phase: Phase, dealingStep: number, t: Translation): string {
  switch (phase) {
    case "deal":
      return t.status.pressDeal;
    case "dealing":
      return t.status.dealing(dealingStep, DEAL_SEQUENCE.length);
    case "exchange":
      return t.phase.exchange;
    case "ready":
      return t.phase.ready;
    case "resolved":
      return t.phase.resolved;
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

function getInitialLanguage(): Language {
  const storedLanguage = getStoredLanguage();

  if (storedLanguage) {
    return storedLanguage;
  }

  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ja")) {
    return "ja";
  }

  return "en";
}

function getStoredLanguage(): Language | undefined {
  try {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return storedLanguage === "en" || storedLanguage === "ja" ? storedLanguage : undefined;
  } catch {
    return undefined;
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
