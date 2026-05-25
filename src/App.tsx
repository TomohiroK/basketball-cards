import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
} from "./game/deck";
import { resolveGame } from "./game/engine";
import { replacePublicDuplicateCards } from "./game/publicDuplicates";
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
type Language = "en" | "ja";
type GuideGroupKey = "shoot" | "defense" | "modifier";
type NpcExchangeStatus = "idle" | "thinking" | "done";
type ExchangeOrder = readonly [PlayerId, PlayerId];

interface CardVisual {
  name: string;
  guide: string;
}

interface ExchangeState {
  selectedIndexes: number[];
  committed: boolean;
}

interface NpcExchangeState {
  changedCount: number;
  status: NpcExchangeStatus;
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
  control: {
    label: string;
    dealHint: string;
    exchangeHint: string;
    readyHint: string;
    resolvedHint: string;
  };
  actions: {
    deal: string;
    dealing: string;
    newGame: string;
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
  decision: {
    dealTitle: string;
    dealText: string;
    dealingTitle: string;
    dealingText: (step: number, total: number) => string;
    yourTurnTitle: string;
    yourTurnText: string;
    npcTurnTitle: string;
    npcTurnText: string;
    readyTitle: string;
    readyText: string;
    npcAction: (count: number) => string;
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
    hiddenCard: (index: number) => string;
    board: (index: number) => string;
    emptySlot: (slotLabel: string) => string;
    exchangeOptions: (playerId: PlayerId) => string;
    npcWaiting: string;
    npcThinking: string;
    npcChanged: (count: number) => string;
    npcReady: string;
    npcResolved: string;
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
  report: {
    title: string;
    finalScore: string;
    playDetails: string;
    winnerReasonScore: string;
    winnerReasonCard: string;
    winner: (playerId: PlayerId) => string;
    tieNumber: string;
    noAttempts: string;
    newGame: string;
    outcome: Record<ScoringResult["source"], string>;
  };
}

const PLAYER_KEYS = {
  A: "playerA",
  B: "playerB",
} as const;

const DEAL_STEP_MS = 280;
const NPC_EXCHANGE_DELAY_MS = 960;
const NPC_EXCHANGE_SCORE_THRESHOLD = 2;
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
const INITIAL_EXCHANGE_ORDER: ExchangeOrder = ["A", "B"];
const INITIAL_NPC_EXCHANGE: NpcExchangeState = {
  changedCount: 0,
  status: "idle",
};
const CONFETTI_VARIANT_COUNT = 10;
const VERTICAL_CONFETTI_PIECES = Array.from({ length: 72 }, (_, index) => index);
const SIDE_CONFETTI_PIECES = Array.from({ length: 56 }, (_, index) => index);
const LOSS_EFFECT_MARKS = Array.from({ length: 38 }, (_, index) => index);
const PRIMARY_SHOOT_KINDS: ReadonlySet<CardKind> = new Set([
  "layup",
  "dunk",
  "threePoint",
  "deepThree",
]);
const COUNTER_DEFENSE_KINDS: ReadonlySet<CardKind> = new Set(["rimProtect", "faceGuard"]);

const TRANSLATIONS: Record<Language, Translation> = {
  en: {
    app: {
      gameStatus: "Game status",
      productName: "Basketball Poker",
      title: "Court Duel",
      languageTitle: "Switch language",
      languageButton: "日本語",
      dealTitle: "Deal one card at a time",
      tableLabel: "Texas Hold'em style table",
      symbolGuide: "Card symbol guide",
    },
    control: {
      label: "Game control",
      dealHint: "Start a fresh hand.",
      exchangeHint: "Choose your exchange below.",
      readyHint: "Resolve this hand.",
      resolvedHint: "Start the next hand.",
    },
    actions: {
      deal: "Deal",
      dealing: "Dealing",
      newGame: "New Game",
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
    decision: {
      dealTitle: "NEW HAND",
      dealText: "Deal one card at a time.",
      dealingTitle: "DEALING",
      dealingText: (step, total) => `Card ${step}/${total}`,
      yourTurnTitle: "YOUR TURN",
      yourTurnText: "Choose 0-2 private cards.",
      npcTurnTitle: "NPC TURN",
      npcTurnText: "NPC is choosing a hidden exchange.",
      readyTitle: "BOTH READY",
      readyText: "Press Play to reveal the result.",
      npcAction: (count) =>
        count === 0 ? "NPC kept hand" : `NPC changed ${count} ${count === 1 ? "card" : "cards"}`,
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
      player: (playerId) => (playerId === "A" ? "You" : "NPC"),
      community: "Community",
      communityCards: "Community cards",
      hand: (index) => `Hand ${index}`,
      hiddenCard: (index) => `Hidden ${index}`,
      board: (index) => `Board ${index}`,
      emptySlot: (slotLabel) => `${slotLabel} empty`,
      exchangeOptions: (playerId) => `Player ${playerId} exchange options`,
      npcWaiting: "NPC ready",
      npcThinking: "NPC choosing...",
      npcChanged: (count) =>
        count === 0 ? "NPC kept hand" : `NPC changed ${count} ${count === 1 ? "card" : "cards"}`,
      npcReady: "NPC ready",
      npcResolved: "NPC hand hidden",
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
      player: (playerId) => (playerId === "A" ? "You" : "NPC"),
      wonByCard: (playerId) => `${playerId === "A" ? "You" : "NPC"} won by Card`,
    },
    resolution: {
      attempts: "Resolution attempts",
      detail: "Resolution detail",
      noValidPlay: "No valid scoring play.",
      andOne: (shootName, scoreValue, freeThrowBonus, score) =>
        `${shootName}: forced Foul, And 1 keeps ${scoreValue} + bonus FT ${freeThrowBonus} = ${score}.`,
      foul: (shootName, score) =>
        `${shootName}: forced Foul, normal shot misses, ${
          score > 0 ? `${score} free throw${score === 1 ? "" : "s"} made.` : "free throw missed."
        }`,
      stopped: (shootName, defenseName, defenseValue, offenseValue) =>
        `${shootName}: stopped by ${defenseName} ${defenseValue} vs ${offenseValue}.`,
      beats: (shootName, offenseValue, defenseName, defenseValue, scoreValue) =>
        `${shootName}: ${offenseValue} beats ${defenseName} ${defenseValue}, scores ${scoreValue}.`,
      noDefense: (shootName, scoreValue) =>
        `${shootName}: no matching defense, scores ${scoreValue}.`,
    },
    report: {
      title: "GAME REPORT",
      finalScore: "Final score",
      playDetails: "Play details",
      winnerReasonScore: "Higher score",
      winnerReasonCard: "Won by Card",
      winner: (playerId) => (playerId === "A" ? "You Win!" : "You Lose"),
      tieNumber: "Card",
      noAttempts: "No scoring attempt.",
      newGame: "New Game",
      outcome: {
        shoot: "Made shot",
        foulFreeThrows: "Foul conversion",
        andOne: "And 1",
        none: "No score",
      },
    },
  },
  ja: {
    app: {
      gameStatus: "ゲーム状況",
      productName: "バスケットボールポーカー",
      title: "コートデュエル",
      languageTitle: "言語を切り替え",
      languageButton: "English",
      dealTitle: "1枚ずつ配る",
      tableLabel: "テキサスホールデム形式のテーブル",
      symbolGuide: "カードシンボルガイド",
    },
    control: {
      label: "ゲーム操作",
      dealHint: "新しい手札を始めます。",
      exchangeHint: "下の自分の手札から交換を選びます。",
      readyHint: "この手札を判定します。",
      resolvedHint: "次の手札を始めます。",
    },
    actions: {
      deal: "ディール",
      dealing: "配布中",
      newGame: "ニューゲーム",
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
    decision: {
      dealTitle: "ニューゲーム",
      dealText: "1枚ずつ配布します。",
      dealingTitle: "配布中",
      dealingText: (step, total) => `${step}/${total} 枚目`,
      yourTurnTitle: "あなたのターン",
      yourTurnText: "手札から0-2枚を選びます。",
      npcTurnTitle: "NPCのターン",
      npcTurnText: "NPCが非公開で交換を選んでいます。",
      readyTitle: "両者準備完了",
      readyText: "プレイで判定します。",
      npcAction: (count) => (count === 0 ? "NPCキープ" : `NPC ${count}枚交換`),
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
      player: (playerId) => (playerId === "A" ? "あなた" : "NPC"),
      community: "場",
      communityCards: "場のカード",
      hand: (index) => `手札 ${index}`,
      hiddenCard: (index) => `非公開 ${index}`,
      board: (index) => `場 ${index}`,
      emptySlot: (slotLabel) => `${slotLabel} 空き`,
      exchangeOptions: (playerId) => `Player ${playerId} の交換操作`,
      npcWaiting: "NPC準備完了",
      npcThinking: "NPC選択中...",
      npcChanged: (count) => (count === 0 ? "NPCキープ" : `NPC ${count}枚交換`),
      npcReady: "NPC準備完了",
      npcResolved: "NPC手札は非公開",
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
      player: (playerId) => (playerId === "A" ? "あなた" : "NPC"),
      wonByCard: (playerId) => `${playerId === "A" ? "あなた" : "NPC"} がカード差で勝利`,
    },
    resolution: {
      attempts: "判定トラック",
      detail: "判定詳細",
      noValidPlay: "有効な得点プレイなし。",
      andOne: (shootName, scoreValue, freeThrowBonus, score) =>
        `${shootName}: ファール発生、And 1で${scoreValue}点を保持 + ボーナスFT ${freeThrowBonus} = ${score}。`,
      foul: (shootName, score) =>
        `${shootName}: ファール発生、通常シュートは失敗。${
          score > 0 ? `フリースロー${score}本成功。` : "フリースロー失敗。"
        }`,
      stopped: (shootName, defenseName, defenseValue, offenseValue) =>
        `${shootName}: ${defenseName} ${defenseValue} vs ${offenseValue} でブロック成功。`,
      beats: (shootName, offenseValue, defenseName, defenseValue, scoreValue) =>
        `${shootName}: ${offenseValue} が ${defenseName} ${defenseValue} を上回り、${scoreValue}点。`,
      noDefense: (shootName, scoreValue) =>
        `${shootName}: 対応する守備なし、${scoreValue}点。`,
    },
    report: {
      title: "ゲームレポート",
      finalScore: "最終スコア",
      playDetails: "プレイ詳細",
      winnerReasonScore: "スコア差",
      winnerReasonCard: "カード差",
      winner: (playerId) => (playerId === "A" ? "あなたの勝利!" : "You Lose"),
      tieNumber: "カード",
      noAttempts: "得点プレイなし。",
      newGame: "ニューゲーム",
      outcome: {
        shoot: "シュート成功",
        foulFreeThrows: "ファール変換",
        andOne: "And 1",
        none: "無得点",
      },
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
  const [exchangeOrder, setExchangeOrder] = useState<ExchangeOrder>(INITIAL_EXCHANGE_ORDER);
  const [npcExchange, setNpcExchange] = useState<NpcExchangeState>(INITIAL_NPC_EXCHANGE);
  const npcExchangeTimerRef = useRef<number | undefined>(undefined);
  const t = TRANSLATIONS[language];
  const resolution = useMemo(
    () => (phase === "resolved" ? resolveGame(gameState) : undefined),
    [gameState, phase],
  );
  const boostBadges = useMemo(() => buildBoostBadgeMap(resolution), [resolution]);
  const activeExchangePlayer = useMemo(
    () => getActiveExchangePlayer(phase, exchangeOrder, exchangeState, npcExchange),
    [exchangeOrder, exchangeState, npcExchange, phase],
  );
  useEffect(() => {
    document.documentElement.lang = language;

    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Language still works without persistence when storage is unavailable.
    }
  }, [language]);

  useEffect(() => () => clearNpcExchangeTimer(npcExchangeTimerRef), []);

  async function startDealSequence() {
    if (phase === "dealing") {
      return;
    }

    clearNpcExchangeTimer(npcExchangeTimerRef);

    const emptyGame = createEmptyGame();
    const deck = [...emptyGame.deck];
    const nextExchangeOrder = createRandomExchangeOrder();
    const dealState = {
      playerA: [] as Card[],
      playerB: [] as Card[],
      community: [] as Card[],
    };

    setExchangeState(INITIAL_EXCHANGE);
    setExchangeOrder(nextExchangeOrder);
    setNpcExchange(INITIAL_NPC_EXCHANGE);
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

    const duplicateReplacement = replacePublicDuplicateCards(dealState.community, deck);
    dealState.community = duplicateReplacement.publicCards;

    const dealtGameState: GameState = {
      deck: duplicateReplacement.deck,
      playerA: [...dealState.playerA],
      playerB: [...dealState.playerB],
      community: [...dealState.community],
      discards: duplicateReplacement.discards,
    };

    setGameState(dealtGameState);
    setPhase("exchange");

    if (nextExchangeOrder[0] === "B") {
      startNpcExchangeTurn(dealtGameState);
    }
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
    if (phase !== "exchange" || activeExchangePlayer !== playerId) {
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
    if (phase !== "exchange" || playerId !== "A" || activeExchangePlayer !== "A") {
      return;
    }

    const selectedIndexes = exchangeState.A.selectedIndexes;
    const gameAfterUserExchange =
      selectedIndexes.length > 0
        ? exchangeCards(gameState, PLAYER_KEYS.A, selectedIndexes)
        : gameState;

    clearNpcExchangeTimer(npcExchangeTimerRef);
    setGameState(gameAfterUserExchange);
    setExchangeState((current) => ({
      ...current,
      A: {
        selectedIndexes: [],
        committed: true,
      },
    }));

    if (!exchangeState.B.committed) {
      startNpcExchangeTurn(gameAfterUserExchange);
      return;
    }

    setPhase("ready");
  }

  function startNpcExchangeTurn(sourceGameState: GameState) {
    const npcSelectedIndexes = chooseNpcExchangeIndexes(sourceGameState.playerB, sourceGameState.community);

    clearNpcExchangeTimer(npcExchangeTimerRef);
    setNpcExchange({ changedCount: 0, status: "thinking" });

    npcExchangeTimerRef.current = window.setTimeout(() => {
      const gameAfterNpcExchange =
        npcSelectedIndexes.length > 0
          ? exchangeCards(sourceGameState, PLAYER_KEYS.B, npcSelectedIndexes)
          : sourceGameState;

      setGameState(gameAfterNpcExchange);
      setExchangeState((current) => {
        const next = {
          ...current,
          B: {
            selectedIndexes: [],
            committed: true,
          },
        };

        if (next.A.committed && next.B.committed) {
          window.setTimeout(() => setPhase("ready"), 0);
        }

        return next;
      });
      setNpcExchange({ changedCount: npcSelectedIndexes.length, status: "done" });
      npcExchangeTimerRef.current = undefined;
    }, NPC_EXCHANGE_DELAY_MS);
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
    <main className={`app-shell phase-${phase}`}>
      <button
        className="floating-language"
        type="button"
        onClick={toggleLanguage}
        title={t.app.languageTitle}
        aria-label={t.app.languageTitle}
      >
        <Languages aria-hidden="true" />
        <span>{t.app.languageButton}</span>
      </button>
      <section className="table-zone" aria-label={t.app.tableLabel}>
        <PlayerPanel
          playerId="B"
          hidePrivateCards
          showResolutionDetails={false}
          cards={gameState.playerB}
          exchange={exchangeState.B}
          phase={phase}
          result={resolution?.playerB}
          boostBadges={boostBadges}
          npcExchange={npcExchange}
          activeExchangePlayer={activeExchangePlayer}
          t={t}
          dealingStep={dealingStep}
          onDeal={startDealSequence}
          onPlay={resolveRound}
          onToggleExchangeCard={toggleExchangeCard}
          onCommitExchange={commitExchange}
        />

        <section className="community-strip" aria-label={t.table.communityCards}>
          <div className="section-heading">
            <span>{t.table.community}</span>
            {resolution ? <span className="winner-pill">{formatWinnerText(resolution, t)}</span> : null}
          </div>
          <div className="card-grid community-grid">
            {Array.from({ length: COMMUNITY_CARD_COUNT }, (_, index) => {
              const card = gameState.community[index];

              return (
                <CardSlot
                  key={card?.id ?? `community-${index}`}
                  card={card}
                  boost={card ? boostBadges.get(card.id) : undefined}
                  slotLabel={t.table.board(index + 1)}
                  t={t}
                />
              );
            })}
          </div>
          {resolution ? (
            <ResultBanner resolution={resolution} t={t} />
          ) : (
            <DecisionBanner
              phase={phase}
              dealingStep={dealingStep}
              userExchange={exchangeState.A}
              npcExchange={npcExchange}
              activeExchangePlayer={activeExchangePlayer}
              t={t}
            />
          )}
        </section>

        <PlayerPanel
          playerId="A"
          showResolutionDetails={false}
          cards={gameState.playerA}
          exchange={exchangeState.A}
          phase={phase}
          result={resolution?.playerA}
          boostBadges={boostBadges}
          activeExchangePlayer={activeExchangePlayer}
          t={t}
          dealingStep={dealingStep}
          onDeal={startDealSequence}
          onPlay={resolveRound}
          onToggleExchangeCard={toggleExchangeCard}
          onCommitExchange={commitExchange}
        />
      </section>
      {resolution ? (
        <GameReportOverlay resolution={resolution} t={t} onNewGame={startDealSequence} />
      ) : null}
    </main>
  );
}

function clearNpcExchangeTimer(timerRef: { current: number | undefined }) {
  if (timerRef.current === undefined) {
    return;
  }

  window.clearTimeout(timerRef.current);
  timerRef.current = undefined;
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

interface GameControlsProps {
  phase: Phase;
  dealingStep: number;
  t: Translation;
  onDeal: () => void;
  onPlay: () => void;
}

function GameControls({ phase, dealingStep, t, onDeal, onPlay }: GameControlsProps) {
  const isPlayReady = phase === "ready";
  const isDealAction = phase === "deal" || phase === "resolved";
  const ButtonIcon = isPlayReady ? Play : isDealAction ? Shuffle : RefreshCw;
  const label = isPlayReady ? t.actions.play : formatDealButtonLabel(phase, t);
  const hint = getGameControlHint(phase, dealingStep, t);
  const disabled = phase === "dealing" || phase === "exchange";
  const onClick = isPlayReady ? onPlay : onDeal;

  return (
    <section className="game-control-panel" aria-label={t.control.label}>
      <p>{hint}</p>
      <button
        className={`control-button ${isPlayReady ? "primary" : ""}`}
        type="button"
        onClick={onClick}
        disabled={disabled}
      >
        <ButtonIcon aria-hidden="true" />
        <span>{label}</span>
      </button>
    </section>
  );
}

interface DecisionBannerProps {
  phase: Phase;
  dealingStep: number;
  userExchange: ExchangeState;
  npcExchange: NpcExchangeState;
  activeExchangePlayer?: PlayerId;
  t: Translation;
}

function DecisionBanner({
  phase,
  dealingStep,
  userExchange,
  npcExchange,
  activeExchangePlayer,
  t,
}: DecisionBannerProps) {
  const content = getDecisionBannerContent(
    phase,
    dealingStep,
    userExchange,
    npcExchange,
    activeExchangePlayer,
    t,
  );
  const Icon = content.icon;

  return (
    <div className={`decision-banner ${content.tone}`} role="status" aria-live="polite">
      <Icon aria-hidden="true" />
      <div>
        <strong>{content.title}</strong>
        <span>{content.text}</span>
      </div>
    </div>
  );
}

function getDecisionBannerContent(
  phase: Phase,
  dealingStep: number,
  userExchange: ExchangeState,
  npcExchange: NpcExchangeState,
  activeExchangePlayer: PlayerId | undefined,
  t: Translation,
): {
  icon: LucideIcon;
  text: string;
  title: string;
  tone: "deal" | "you" | "npc" | "ready";
} {
  if (phase === "dealing") {
    return {
      icon: RefreshCw,
      text: t.decision.dealingText(dealingStep, DEAL_SEQUENCE.length),
      title: t.decision.dealingTitle,
      tone: "deal",
    };
  }

  if (phase === "exchange" && activeExchangePlayer === "B") {
    return {
      icon: ArrowRightLeft,
      text: t.decision.npcTurnText,
      title: t.decision.npcTurnTitle,
      tone: "npc",
    };
  }

  if (phase === "exchange" && activeExchangePlayer === "A") {
    return {
      icon: Hand,
      text: userExchange.committed ? t.exchange.done : t.decision.yourTurnText,
      title: t.decision.yourTurnTitle,
      tone: "you",
    };
  }

  if (phase === "ready") {
    return {
      icon: Play,
      text: npcExchange.status === "done" ? t.decision.npcAction(npcExchange.changedCount) : t.decision.readyText,
      title: t.decision.readyTitle,
      tone: "ready",
    };
  }

  return {
    icon: Shuffle,
    text: t.decision.dealText,
    title: t.decision.dealTitle,
    tone: "deal",
  };
}

interface PlayerPanelProps {
  playerId: PlayerId;
  hidePrivateCards?: boolean;
  showResolutionDetails: boolean;
  cards: Card[];
  exchange: ExchangeState;
  phase: Phase;
  result?: ScoringResult;
  boostBadges: ReadonlyMap<string, BoostBadge>;
  npcExchange?: NpcExchangeState;
  activeExchangePlayer?: PlayerId;
  t: Translation;
  dealingStep: number;
  onDeal: () => void;
  onPlay: () => void;
  onToggleExchangeCard: (playerId: PlayerId, cardIndex: number) => void;
  onCommitExchange: (playerId: PlayerId) => void;
}

function PlayerPanel({
  playerId,
  hidePrivateCards = false,
  showResolutionDetails,
  cards,
  exchange,
  phase,
  result,
  boostBadges,
  npcExchange,
  activeExchangePlayer,
  t,
  dealingStep,
  onDeal,
  onPlay,
  onToggleExchangeCard,
  onCommitExchange,
}: PlayerPanelProps) {
  const canSelectCards = phase === "exchange" && activeExchangePlayer === playerId && !exchange.committed;
  const selectedCount = exchange.selectedIndexes.length;
  const playerLabel = t.table.player(playerId);
  const npcPanelPhase = formatNpcPanelPhase(phase, t, npcExchange ?? INITIAL_NPC_EXCHANGE);
  const userPanelPhase =
    playerId === "A" && phase === "exchange" && activeExchangePlayer === "A"
      ? t.decision.yourTurnTitle
      : formatPanelPhase(phase, t);
  const activeDecision =
    (playerId === "A" && phase === "exchange" && activeExchangePlayer === "A") ||
    (hidePrivateCards && phase === "exchange" && activeExchangePlayer === "B");

  return (
    <section
      className={`player-panel seat-${playerId.toLowerCase()} ${hidePrivateCards ? "npc-panel" : "user-panel"} ${
        hidePrivateCards ? `npc-${npcExchange?.status ?? "idle"}` : ""
      } ${activeDecision ? "active-decision" : ""}`}
      aria-label={playerLabel}
    >
      <div className="section-heading">
        <span>{playerLabel}</span>
        {result ? (
          <ResultChip result={result} />
        ) : (
          <span className="phase-chip">
            {hidePrivateCards ? npcPanelPhase : userPanelPhase}
          </span>
        )}
      </div>

      <div className="card-grid private-grid">
        {Array.from({ length: PRIVATE_CARD_COUNT }, (_, index) =>
          hidePrivateCards ? (
            <HiddenCardSlot
              key={cards[index]?.id ?? `${playerId}-${index}`}
              filled={Boolean(cards[index])}
              slotLabel={t.table.hiddenCard(index + 1)}
              t={t}
            />
          ) : (
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
          ),
        )}
      </div>
      {hidePrivateCards ? <NpcActionCue phase={phase} npcExchange={npcExchange} t={t} /> : null}

      {hidePrivateCards ? (
        <div className="exchange-controls" aria-label={t.table.exchangeOptions(playerId)}>
          <span className="exchange-done">{npcPanelPhase}</span>
        </div>
      ) : (
        <PlayerActionArea
          phase={phase}
          dealingStep={dealingStep}
          selectedCount={selectedCount}
          exchangeCommitted={exchange.committed}
          canExchangeNow={activeExchangePlayer === "A"}
          waitingText={activeExchangePlayer === "B" ? t.decision.npcTurnTitle : t.exchange.done}
          t={t}
          onDeal={onDeal}
          onPlay={onPlay}
          onCommitExchange={() => onCommitExchange(playerId)}
        />
      )}

      {result && showResolutionDetails ? (
        <>
          <AttemptTrack result={result} t={t} />
          <ResolutionNote result={result} t={t} />
        </>
      ) : null}
    </section>
  );
}

function NpcActionCue({
  phase,
  npcExchange,
  t,
}: {
  phase: Phase;
  npcExchange: NpcExchangeState | undefined;
  t: Translation;
}) {
  if (!npcExchange || phase === "deal" || phase === "dealing" || phase === "resolved") {
    return null;
  }

  if (phase === "exchange" && npcExchange.status === "thinking") {
    return (
      <div className="npc-action-cue thinking" aria-live="polite">
        <ArrowRightLeft aria-hidden="true" />
        <span>{t.decision.npcTurnTitle}</span>
      </div>
    );
  }

  if (npcExchange.status === "done") {
    return (
      <div className="npc-action-cue done" aria-live="polite">
        <ArrowRightLeft aria-hidden="true" />
        <span>{t.decision.npcAction(npcExchange.changedCount)}</span>
      </div>
    );
  }

  return null;
}

interface PlayerActionAreaProps {
  phase: Phase;
  dealingStep: number;
  selectedCount: number;
  exchangeCommitted: boolean;
  canExchangeNow: boolean;
  waitingText: string;
  t: Translation;
  onDeal: () => void;
  onPlay: () => void;
  onCommitExchange: () => void;
}

function PlayerActionArea({
  phase,
  dealingStep,
  selectedCount,
  exchangeCommitted,
  canExchangeNow,
  waitingText,
  t,
  onDeal,
  onPlay,
  onCommitExchange,
}: PlayerActionAreaProps) {
  if (phase === "deal") {
    return (
      <div className="exchange-controls primary-controls" aria-label={t.control.label}>
        <button className="control-button primary" type="button" onClick={onDeal}>
          <Shuffle aria-hidden="true" />
          <span>{t.actions.deal}</span>
        </button>
      </div>
    );
  }

  if (phase === "dealing") {
    return (
      <div className="exchange-controls primary-controls" aria-label={t.control.label}>
        <span className="exchange-done">{t.status.dealing(dealingStep, DEAL_SEQUENCE.length)}</span>
      </div>
    );
  }

  if (phase === "exchange" && exchangeCommitted) {
    return (
      <div className="exchange-controls primary-controls" aria-label={t.control.label}>
        <span className="exchange-done">{t.exchange.done}</span>
      </div>
    );
  }

  if (phase === "exchange" && !canExchangeNow) {
    return (
      <div className="exchange-controls primary-controls" aria-label={t.control.label}>
        <span className="exchange-done turn-waiting">{waitingText}</span>
      </div>
    );
  }

  if (phase === "exchange") {
    return (
      <div className="exchange-controls" aria-label={t.control.label}>
        <div className="exchange-prompt">
          <small>{t.decision.yourTurnTitle}</small>
          <span>{t.exchange.tapCards}</span>
          <strong>{t.exchange.selected(selectedCount)}</strong>
        </div>
        <button
          type="button"
          className={selectedCount > 0 ? "exchange-action primary" : "exchange-action"}
          onClick={onCommitExchange}
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
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className="exchange-controls primary-controls" aria-label={t.control.label}>
        <button className="control-button primary" type="button" onClick={onPlay}>
          <Play aria-hidden="true" />
          <span>{t.actions.play}</span>
        </button>
      </div>
    );
  }

  if (phase === "resolved") {
    return (
      <div className="exchange-controls primary-controls" aria-label={t.control.label}>
        <button className="control-button" type="button" onClick={onDeal}>
          <Shuffle aria-hidden="true" />
          <span>{t.actions.newGame}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="exchange-controls primary-controls" aria-label={t.control.label}>
      <span className="exchange-done">{t.exchange.done}</span>
    </div>
  );
}

interface HiddenCardSlotProps {
  filled: boolean;
  slotLabel: string;
  t: Translation;
}

function HiddenCardSlot({ filled, slotLabel, t }: HiddenCardSlotProps) {
  return (
    <div className={`card-slot hidden-slot ${filled ? "filled" : "empty"}`}>
      {filled ? (
        <div className="card-back" aria-label={slotLabel}>
          <span className="card-back-mark" aria-hidden="true" />
        </div>
      ) : (
        <div className="card-placeholder" aria-label={t.table.emptySlot(slotLabel)}>
          <span>{slotLabel}</span>
        </div>
      )}
      <span className="card-name">{slotLabel}</span>
      <span className="card-role role-text-defense">{t.table.npcResolved}</span>
    </div>
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
      <span className={`card-art art-${card.kind}`} aria-hidden="true" />
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
      <ScoreCell playerId="A" result={resolution.playerA} t={t} />
      <div className="winner-cell">
        <Trophy aria-hidden="true" />
        <span>{winnerText}</span>
      </div>
      <ScoreCell playerId="B" result={resolution.playerB} t={t} />
    </div>
  );
}

function ResultBanner({ resolution, t }: { resolution: GameResolution; t: Translation }) {
  const winnerClass =
    resolution.winner === "draw" ? "draw" : resolution.winner === "A" ? "you-win" : "npc-win";

  return (
    <div className={`result-banner ${winnerClass}`} role="status" aria-live="polite">
      <Trophy aria-hidden="true" />
      <div>
        <strong>{formatWinnerText(resolution, t)}</strong>
        <span>
          {t.score.player("A")} {resolution.playerA.score} - {t.score.player("B")}{" "}
          {resolution.playerB.score}
        </span>
      </div>
    </div>
  );
}

function GameReportOverlay({
  resolution,
  t,
  onNewGame,
}: {
  resolution: GameResolution;
  t: Translation;
  onNewGame: () => void;
}) {
  const winnerClass =
    resolution.winner === "draw" ? "draw" : resolution.winner === "A" ? "you-win" : "npc-win";
  const winnerText = formatReportWinnerText(resolution, t);
  const reasonText = formatWinnerReason(resolution, t);

  return (
    <section className={`game-report ${winnerClass}`} role="dialog" aria-live="polite" aria-label={t.report.title}>
      {resolution.winner === "A" ? <VictoryConfetti /> : null}
      {resolution.winner === "B" ? <LossEffect /> : null}
      <div className="game-report-hero with-art">
        <span className={`report-result-art ${winnerClass}`} aria-hidden="true" />
        <div className="report-hero-copy">
          <span>{t.report.title}</span>
          <strong>{winnerText}</strong>
          <div className="report-score-line">
            <b>{resolution.playerA.score}</b>
            <small>{t.score.player("A")}</small>
            <em aria-hidden="true">-</em>
            <b>{resolution.playerB.score}</b>
            <small>{t.score.player("B")}</small>
          </div>
          <p>{reasonText}</p>
        </div>
      </div>

      <div className="report-details" aria-label={t.report.playDetails}>
        <ReportPlayer playerId="A" result={resolution.playerA} t={t} />
        <ReportPlayer playerId="B" result={resolution.playerB} t={t} />
      </div>

      <button className="control-button report-new-game" type="button" onClick={onNewGame}>
        <Shuffle aria-hidden="true" />
        <span>{t.report.newGame}</span>
      </button>
    </section>
  );
}

function LossEffect() {
  return (
    <div className="loss-effect" aria-hidden="true">
      {LOSS_EFFECT_MARKS.map((mark) => (
        <span
          key={mark}
          style={{
            animationDelay: `${(mark % 9) * 78}ms`,
            animationDuration: `${900 + (mark % 6) * 120}ms`,
            left: `${2 + ((mark * 29) % 94)}%`,
            top: `${8 + ((mark * 17) % 82)}%`,
            "--loss-tilt": `${-28 + (mark % 8) * 8}deg`,
            "--loss-drop": `${10 + (mark % 7) * 9}px`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function VictoryConfetti() {
  return (
    <div className="victory-confetti" aria-hidden="true">
      {VERTICAL_CONFETTI_PIECES.map((piece) => (
        <span
          className={`confetti-piece confetti-vertical piece-${piece % CONFETTI_VARIANT_COUNT}`}
          key={piece}
          style={{
            animationDelay: `${(piece % 11) * 72}ms`,
            animationDuration: `${2100 + (piece % 7) * 180}ms`,
            left: `${4 + ((piece * 23) % 92)}%`,
            top: `${-18 - (piece % 5) * 5}%`,
            "--confetti-drift-x": `${-32 + (piece % 9) * 8}px`,
            "--confetti-fall-y": `${108 + (piece % 4) * 8}vh`,
            "--confetti-rotation": `${460 + (piece % 6) * 70}deg`,
            "--confetti-scale": `${0.72 + (piece % 5) * 0.12}`,
          } as CSSProperties}
        />
      ))}
      {SIDE_CONFETTI_PIECES.map((piece) => {
        const fromLeft = piece % 2 === 0;

        return (
          <span
            className={`confetti-piece confetti-side ${fromLeft ? "from-left" : "from-right"} piece-${
              piece % CONFETTI_VARIANT_COUNT
            }`}
            key={`side-${piece}`}
            style={{
              animationDelay: `${(piece % 14) * 92}ms`,
              animationDuration: `${1850 + (piece % 8) * 160}ms`,
              [fromLeft ? "left" : "right"]: `${-9 - (piece % 4) * 3}%`,
              top: `${8 + ((piece * 19) % 78)}%`,
              "--confetti-drift-x": `${fromLeft ? 106 + (piece % 6) * 9 : -106 - (piece % 6) * 9}vw`,
              "--confetti-drift-y": `${-58 + (piece % 11) * 11}px`,
              "--confetti-rotation": `${360 + (piece % 7) * 85}deg`,
              "--confetti-scale": `${0.66 + (piece % 6) * 0.12}`,
            } as CSSProperties}
          />
        );
      })}
    </div>
  );
}

function ReportPlayer({
  playerId,
  result,
  t,
}: {
  playerId: PlayerId;
  result: ScoringResult;
  t: Translation;
}) {
  return (
    <article className="report-player">
      <header>
        <span>{t.score.player(playerId)}</span>
        <strong>{result.score}</strong>
      </header>
      <div className="report-player-meta">
        <span>{t.report.outcome[result.source]}</span>
        {result.successfulShoot?.number !== undefined ? (
          <span>
            {t.report.tieNumber} #{result.successfulShoot.number}
          </span>
        ) : null}
      </div>
      <ol className="report-attempts">
        {result.attempts.length > 0 ? (
          result.attempts.map((attempt, index) => {
            const Icon = KIND_ICONS[attempt.shootKind];

            return (
              <li className={`report-attempt ${attempt.outcome}`} key={`${attempt.shootCardId}-${index}`}>
                <Icon aria-hidden="true" />
                <div>
                  <b>
                    {index + 1}. {t.cards[attempt.shootKind].name}
                  </b>
                  <span>{formatAttemptLine(result, attempt, t)}</span>
                </div>
              </li>
            );
          })
        ) : (
          <li className="report-attempt none">
            <Circle aria-hidden="true" />
            <div>
              <b>{t.report.outcome.none}</b>
              <span>{t.report.noAttempts}</span>
            </div>
          </li>
        )}
      </ol>
    </article>
  );
}

function formatWinnerText(resolution: GameResolution, t: Translation): string {
  if (resolution.winner === "draw") {
    return t.score.draw;
  }

  return resolution.tiebreakerUsed ? t.score.wonByCard(resolution.winner) : t.score.player(resolution.winner);
}

function formatReportWinnerText(resolution: GameResolution, t: Translation): string {
  if (resolution.winner === "draw") {
    return t.score.draw;
  }

  return t.report.winner(resolution.winner);
}

function formatWinnerReason(resolution: GameResolution, t: Translation): string {
  if (resolution.winner === "draw") {
    return t.score.draw;
  }

  return resolution.tiebreakerUsed ? t.report.winnerReasonCard : t.report.winnerReasonScore;
}

function formatShootTiebreakerLabel(result: ScoringResult): string {
  return result.successfulShoot?.number === undefined ? "-" : `#${result.successfulShoot.number}`;
}

function ScoreCell({
  playerId,
  result,
  t,
}: {
  playerId: PlayerId;
  result: ScoringResult;
  t: Translation;
}) {
  return (
    <div className="score-cell">
      <span className="score-player">{t.score.player(playerId)}</span>
      <strong>{result.score}</strong>
      <span className="tie-number">{formatShootTiebreakerLabel(result)}</span>
    </div>
  );
}

function ResultChip({ result }: { result: ScoringResult }) {
  return (
    <span className={`result-chip source-${result.source}`}>
      {result.score}
      <small>{formatShootTiebreakerLabel(result)}</small>
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

function getGameControlHint(phase: Phase, dealingStep: number, t: Translation): string {
  switch (phase) {
    case "deal":
      return t.control.dealHint;
    case "dealing":
      return t.status.dealing(dealingStep, DEAL_SEQUENCE.length);
    case "exchange":
      return t.control.exchangeHint;
    case "ready":
      return t.control.readyHint;
    case "resolved":
      return t.control.resolvedHint;
  }
}

function formatNpcPanelPhase(
  phase: Phase,
  t: Translation,
  npcExchange: NpcExchangeState,
): string {
  if (phase === "resolved") {
    return t.table.npcResolved;
  }

  if (phase === "exchange" && npcExchange.status === "thinking") {
    return t.table.npcThinking;
  }

  if ((phase === "exchange" || phase === "ready") && npcExchange.status === "done") {
    return t.table.npcChanged(npcExchange.changedCount);
  }

  return phase === "deal" || phase === "dealing" || phase === "exchange"
    ? t.table.npcWaiting
    : t.table.npcReady;
}

function formatDealButtonLabel(phase: Phase, t: Translation): string {
  if (phase === "dealing") {
    return t.actions.dealing;
  }

  return phase === "deal" ? t.actions.deal : t.actions.newGame;
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

function createRandomExchangeOrder(): ExchangeOrder {
  return Math.random() < 0.5 ? ["A", "B"] : ["B", "A"];
}

function getActiveExchangePlayer(
  phase: Phase,
  exchangeOrder: ExchangeOrder,
  exchangeState: Record<PlayerId, ExchangeState>,
  npcExchange: NpcExchangeState,
): PlayerId | undefined {
  if (phase !== "exchange") {
    return undefined;
  }

  if (npcExchange.status === "thinking") {
    return "B";
  }

  return exchangeOrder.find((playerId) => !exchangeState[playerId].committed);
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

function chooseNpcExchangeIndexes(
  privateCards: readonly Card[],
  communityCards: readonly Card[],
): number[] {
  const availableCards = [...privateCards, ...communityCards];
  const context = {
    hasCounterDefense: availableCards.some((card) => COUNTER_DEFENSE_KINDS.has(card.kind)),
    hasFoul: availableCards.some((card) => card.kind === "foul"),
    hasFreeThrow: availableCards.some((card) => card.kind === "freeThrow"),
    hasPrimaryShoot: availableCards.some((card) => PRIMARY_SHOOT_KINDS.has(card.kind)),
  };

  return privateCards
    .map((card, index) => ({
      index,
      score: getNpcPrivateCardKeepScore(card, context),
    }))
    .filter((candidate) => candidate.score <= NPC_EXCHANGE_SCORE_THRESHOLD)
    .sort((left, right) => left.score - right.score)
    .slice(0, PRIVATE_CARD_COUNT)
    .map((candidate) => candidate.index);
}

function getNpcPrivateCardKeepScore(
  card: Card,
  context: {
    hasCounterDefense: boolean;
    hasFoul: boolean;
    hasFreeThrow: boolean;
    hasPrimaryShoot: boolean;
  },
): number {
  switch (card.kind) {
    case "deepThree":
      return 6;
    case "threePoint":
      return 5;
    case "dunk":
    case "layup":
    case "rimProtect":
    case "foul":
      return 4;
    case "faceGuard":
      return 3;
    case "andOne":
      return context.hasPrimaryShoot && context.hasFreeThrow ? 4 : 2;
    case "clutch":
      return context.hasPrimaryShoot ? 3 : 1;
    case "help":
      return context.hasCounterDefense ? 3 : 1;
    case "freeThrow":
      return context.hasFoul || context.hasFreeThrow ? 2 : 1;
    case "noFoul":
      return 2;
  }
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
