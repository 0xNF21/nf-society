/**
 * Hi-Lo — Pure game logic
 *
 * Rules:
 * - Standard 52-card deck (no jokers), single deck
 * - Card values: A=1, 2-10=face value, J=11, Q=12, K=13
 * - Player guesses if next card is higher or lower
 * - Equal card = loss (house edge source)
 * - Dynamic multiplier per round: (13 / winning_outcomes) * 0.97
 * - Cash out after minimum 1 correct prediction
 * - RTP ~97% (3% house edge)
 */

// ── Types ──────────────────────────────────────────────

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Card = { rank: Rank; suit: Suit };
export type Prediction = "higher" | "lower";
export type HiLoAction = "higher" | "lower" | "cashout";

export type HiLoRound = {
  card: Card;
  prediction: Prediction;
  correct: boolean;
  isEqual: boolean;
  multiplierAfter: number;
};

export type HiLoState = {
  deck: Card[];
  currentCard: Card;
  history: HiLoRound[];
  streak: number;
  currentMultiplier: number;
  status: "playing" | "cashed_out" | "lost";
  betCrc: number;
};

export type VisibleState = {
  currentCard: Card;
  history: HiLoRound[];
  streak: number;
  currentMultiplier: number;
  status: HiLoState["status"];
  betCrc: number;
  potentialPayout: number;
  higherOdds: number;
  lowerOdds: number;
  higherMultiplier: number;
  lowerMultiplier: number;
  canHigher: boolean;
  canLower: boolean;
  canCashout: boolean;
  wasEqual: boolean;
};

// ── Constants ──────────────────────────────────────────

/** House edge factor: 0.97 = 3% edge → RTP ~97% */
const HOUSE_EDGE_FACTOR = 0.97;

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];

// ── Functions ──────────────────────────────────────────

/** Get numeric value of a rank: A=1, 2-10=face, J=11, Q=12, K=13 */
export function rankValue(rank: Rank): number {
  const idx = RANKS.indexOf(rank);
  return idx + 1;
}

/** Suit symbol for display */
export function suitSymbol(suit: Suit): string {
  const symbols: Record<Suit, string> = {
    hearts: "\u2665",
    diamonds: "\u2666",
    clubs: "\u2663",
    spades: "\u2660",
  };
  return symbols[suit];
}

/** Card color */
export function cardColor(card: Card): "red" | "black" {
  return card.suit === "hearts" || card.suit === "diamonds" ? "red" : "black";
}

/** Create and shuffle a deck */
export function createDeck(numDecks = 1): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ rank, suit });
      }
    }
  }
  // Fisher-Yates shuffle
  if (typeof globalThis.process !== "undefined" && globalThis.process.versions?.node) {
    const { randomInt } = require("crypto") as typeof import("crypto"); // eslint-disable-line
    for (let i = deck.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  } else {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  return deck;
}

/** Count winning outcomes for a prediction given current card value (1-13) */
export function calculateWinningOutcomes(currentValue: number, prediction: Prediction): number {
  if (prediction === "higher") return 13 - currentValue;
  return currentValue - 1; // "lower"
}

/** Calculate the multiplier for a single round */
export function calculateRoundMultiplier(currentValue: number, prediction: Prediction): number {
  const winning = calculateWinningOutcomes(currentValue, prediction);
  if (winning === 0) return 0;
  return Math.round((13 / winning) * HOUSE_EDGE_FACTOR * 1000) / 1000;
}

/** Check if a prediction is possible (has at least 1 winning outcome) */
export function canPredict(currentValue: number, prediction: Prediction): boolean {
  return calculateWinningOutcomes(currentValue, prediction) > 0;
}

/** Deal the initial card and create initial state */
export function dealInitialCard(deck: Card[], betCrc: number): HiLoState {
  const d = [...deck];
  const currentCard = d.pop()!;
  return {
    deck: d,
    currentCard,
    history: [],
    streak: 0,
    currentMultiplier: 1.0,
    status: "playing",
    betCrc,
  };
}

/** Apply an action to the game state — returns a new state */
export function applyAction(state: HiLoState, action: HiLoAction): HiLoState {
  if (state.status !== "playing") {
    throw new Error("Game is already finished");
  }

  const s: HiLoState = {
    ...state,
    deck: [...state.deck],
    history: [...state.history],
  };

  if (action === "cashout") {
    if (s.streak < 1) {
      throw new Error("Must make at least one prediction before cashing out");
    }
    s.status = "cashed_out";
    return s;
  }

  // "higher" or "lower"
  const prediction = action as Prediction;
  const currentValue = rankValue(s.currentCard.rank);

  if (!canPredict(currentValue, prediction)) {
    throw new Error("Impossible prediction");
  }

  if (s.deck.length === 0) {
    throw new Error("No cards left in deck");
  }

  const nextCard = s.deck.pop()!;
  const nextValue = rankValue(nextCard.rank);

  let correct = false;
  if (prediction === "higher" && nextValue > currentValue) correct = true;
  if (prediction === "lower" && nextValue < currentValue) correct = true;
  // Equal = loss

  const roundMultiplier = calculateRoundMultiplier(currentValue, prediction);

  const isEqual = nextValue === currentValue;

  if (correct) {
    const newMultiplier = Math.round(s.currentMultiplier * roundMultiplier * 1000) / 1000;
    s.history.push({ card: nextCard, prediction, correct: true, isEqual: false, multiplierAfter: newMultiplier });
    s.currentCard = nextCard;
    s.streak += 1;
    s.currentMultiplier = newMultiplier;
  } else {
    s.history.push({ card: nextCard, prediction, correct: false, isEqual, multiplierAfter: 0 });
    s.status = "lost";
  }

  return s;
}

/** Get the visible state (safe to send to client — hides deck) */
export function getVisibleState(state: HiLoState): VisibleState {
  const currentValue = rankValue(state.currentCard.rank);
  const higherOdds = calculateWinningOutcomes(currentValue, "higher");
  const lowerOdds = calculateWinningOutcomes(currentValue, "lower");
  const higherMul = higherOdds > 0 ? calculateRoundMultiplier(currentValue, "higher") : 0;
  const lowerMul = lowerOdds > 0 ? calculateRoundMultiplier(currentValue, "lower") : 0;

  return {
    currentCard: state.currentCard,
    history: state.history,
    streak: state.streak,
    currentMultiplier: state.currentMultiplier,
    status: state.status,
    betCrc: state.betCrc,
    potentialPayout: calculatePayout(state),
    higherOdds,
    lowerOdds,
    higherMultiplier: higherMul,
    lowerMultiplier: lowerMul,
    canHigher: canPredict(currentValue, "higher"),
    canLower: canPredict(currentValue, "lower"),
    canCashout: state.streak >= 1 && state.status === "playing",
    wasEqual: state.status === "lost" && state.history.length > 0 && state.history[state.history.length - 1].isEqual,
  };
}

/** Calculate the payout amount */
export function calculatePayout(state: HiLoState): number {
  if (state.status === "cashed_out" || (state.status === "playing" && state.streak >= 1)) {
    return Math.floor(state.betCrc * state.currentMultiplier * 100) / 100;
  }
  return 0;
}

/** Valid action type guard */
export function isValidAction(action: string): action is HiLoAction {
  return action === "higher" || action === "lower" || action === "cashout";
}
