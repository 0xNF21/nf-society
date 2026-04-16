/**
 * Blackjack — Pure game logic
 *
 * Classic rules:
 * - 6 decks, shuffled each hand
 * - Dealer stands on all 17s (S17)
 * - Blackjack pays 3:2
 * - Double down on any 2 cards
 * - Split up to 4 hands
 * - Split aces get 1 card only
 * - No surrender
 * - Insurance when dealer shows Ace (pays 2:1)
 */

// ── Types ──────────────────────────────────────────────

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export type Card = {
  rank: Rank;
  suit: Suit;
};

export type Hand = {
  cards: Card[];
  bet: number;
  doubled: boolean;
  splitFromAces: boolean;
  stood: boolean;
  busted: boolean;
  outcome?: HandOutcome;
  payout?: number;
};

export type HandOutcome = "blackjack" | "win" | "loss" | "push" | "bust";

export type Action = "hit" | "stand" | "double" | "split" | "insurance";

export type BlackjackState = {
  deck: Card[];
  playerHands: Hand[];
  dealerHand: Card[];
  currentHandIndex: number;
  insuranceBet: number;
  status: "dealing" | "playing" | "dealer_turn" | "finished";
  baseBet: number;
  totalPayout: number;
};

// ── Suit/Rank display ──────────────────────────────────

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
  spades: "\u2660",
};

const SUIT_COLORS: Record<Suit, "red" | "black"> = {
  hearts: "red",
  diamonds: "red",
  clubs: "black",
  spades: "black",
};

export function cardDisplay(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

export function cardColor(card: Card): "red" | "black" {
  return SUIT_COLORS[card.suit];
}

// ── Deck ───────────────────────────────────────────────

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function createDeck(numDecks: number = 6): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ rank, suit });
      }
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function drawCard(deck: Card[]): Card {
  const card = deck.pop();
  if (!card) throw new Error("Deck is empty");
  return card;
}

// ── Hand value ─────────────────────────────────────────

function cardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  return parseInt(rank);
}

export function calculateHandValue(cards: Card[]): { value: number; soft: boolean } {
  let value = 0;
  let aces = 0;

  for (const card of cards) {
    value += cardValue(card.rank);
    if (card.rank === "A") aces++;
  }

  // Convert aces from 11 to 1 as needed
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  // "Soft" = has an ace counted as 11
  const soft = aces > 0 && value <= 21;
  return { value, soft };
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && calculateHandValue(cards).value === 21;
}

export function isBusted(cards: Card[]): boolean {
  return calculateHandValue(cards).value > 21;
}

// ── Initial deal ───────────────────────────────────────

export function dealInitialHands(deck: Card[], betCrc: number): BlackjackState {
  const playerCard1 = drawCard(deck);
  const dealerCard1 = drawCard(deck);
  const playerCard2 = drawCard(deck);
  const dealerCard2 = drawCard(deck);

  const playerHand: Hand = {
    cards: [playerCard1, playerCard2],
    bet: betCrc,
    doubled: false,
    splitFromAces: false,
    stood: false,
    busted: false,
  };

  const state: BlackjackState = {
    deck,
    playerHands: [playerHand],
    dealerHand: [dealerCard1, dealerCard2],
    currentHandIndex: 0,
    insuranceBet: 0,
    status: "playing",
    baseBet: betCrc,
    totalPayout: 0,
  };

  // Check for dealer blackjack + player blackjack immediately
  const dealerBJ = isBlackjack([dealerCard1, dealerCard2]);
  const playerBJ = isBlackjack(playerHand.cards);

  if (dealerBJ || playerBJ) {
    state.status = "finished";
    if (dealerBJ && playerBJ) {
      playerHand.outcome = "push";
      playerHand.payout = betCrc; // Return bet
    } else if (playerBJ) {
      playerHand.outcome = "blackjack";
      playerHand.payout = Math.round((betCrc + betCrc * 1.5) * 1000) / 1000; // 3:2
    } else {
      playerHand.outcome = "loss";
      playerHand.payout = 0;
    }
    state.totalPayout = playerHand.payout;
  }

  return state;
}

// ── Action validation ──────────────────────────────────

export function getAvailableActions(state: BlackjackState): Action[] {
  if (state.status !== "playing") return [];

  const hand = state.playerHands[state.currentHandIndex];
  if (!hand || hand.stood || hand.busted) return [];

  const actions: Action[] = ["hit", "stand"];

  // Double: only on first 2 cards, not after split aces
  if (hand.cards.length === 2 && !hand.splitFromAces) {
    actions.push("double");
  }

  // Split: 2 cards of same rank, max 4 hands
  if (
    hand.cards.length === 2 &&
    hand.cards[0].rank === hand.cards[1].rank &&
    state.playerHands.length < 4
  ) {
    actions.push("split");
  }

  // Insurance: only on first action, dealer shows Ace
  if (
    hand.cards.length === 2 &&
    state.dealerHand[0].rank === "A" &&
    state.insuranceBet === 0 &&
    state.currentHandIndex === 0 &&
    state.playerHands.length === 1
  ) {
    actions.push("insurance");
  }

  return actions;
}

export function canPerformAction(state: BlackjackState, action: Action): boolean {
  return getAvailableActions(state).includes(action);
}

// ── Apply action ───────────────────────────────────────

export function applyAction(state: BlackjackState, action: Action): BlackjackState {
  if (!canPerformAction(state, action)) {
    throw new Error(`Cannot perform action: ${action}`);
  }

  // Clone state deeply
  const s: BlackjackState = JSON.parse(JSON.stringify(state));
  const hand = s.playerHands[s.currentHandIndex];

  switch (action) {
    case "hit": {
      hand.cards.push(drawCard(s.deck));
      if (isBusted(hand.cards)) {
        hand.busted = true;
        advanceToNextHand(s);
      } else if (calculateHandValue(hand.cards).value === 21) {
        // Auto-stand on 21 — no reason to keep hitting
        hand.stood = true;
        advanceToNextHand(s);
      } else if (hand.splitFromAces) {
        // Split aces: only 1 card allowed
        hand.stood = true;
        advanceToNextHand(s);
      }
      break;
    }

    case "stand": {
      hand.stood = true;
      advanceToNextHand(s);
      break;
    }

    case "double": {
      hand.doubled = true;
      hand.bet *= 2;
      hand.cards.push(drawCard(s.deck));
      if (isBusted(hand.cards)) {
        hand.busted = true;
      }
      hand.stood = true;
      advanceToNextHand(s);
      break;
    }

    case "split": {
      const card1 = hand.cards[0];
      const card2 = hand.cards[1];
      const isAces = card1.rank === "A";

      // Original hand keeps first card
      hand.cards = [card1, drawCard(s.deck)];
      hand.splitFromAces = isAces;

      // New hand with second card
      const newHand: Hand = {
        cards: [card2, drawCard(s.deck)],
        bet: hand.bet,
        doubled: false,
        splitFromAces: isAces,
        stood: false,
        busted: false,
      };

      // Insert new hand after current
      s.playerHands.splice(s.currentHandIndex + 1, 0, newHand);

      // Split aces: stand immediately on both
      if (isAces) {
        hand.stood = true;
        newHand.stood = true;
        advanceToNextHand(s);
      }
      break;
    }

    case "insurance": {
      s.insuranceBet = Math.round(s.baseBet / 2 * 1000) / 1000;
      break;
    }
  }

  return s;
}

function advanceToNextHand(state: BlackjackState): void {
  // Find next playable hand
  for (let i = state.currentHandIndex + 1; i < state.playerHands.length; i++) {
    const h = state.playerHands[i];
    if (!h.stood && !h.busted) {
      state.currentHandIndex = i;
      return;
    }
  }

  // All hands done — check if all busted
  const allBusted = state.playerHands.every((h) => h.busted);
  if (allBusted) {
    state.status = "finished";
    resolveAllHands(state);
  } else {
    state.status = "dealer_turn";
    playDealerHand(state);
  }
}

// ── Dealer play ────────────────────────────────────────

export function playDealerHand(state: BlackjackState): void {
  // Dealer hits until 17+
  while (calculateHandValue(state.dealerHand).value < 17) {
    state.dealerHand.push(drawCard(state.deck));
  }

  state.status = "finished";
  resolveAllHands(state);
}

// ── Resolve outcomes ───────────────────────────────────

function resolveAllHands(state: BlackjackState): void {
  const dealerValue = calculateHandValue(state.dealerHand).value;
  const dealerBusted = dealerValue > 21;
  const dealerBJ = isBlackjack(state.dealerHand);

  let totalPayout = 0;

  for (const hand of state.playerHands) {
    if (hand.outcome) {
      // Already resolved (e.g., natural blackjack)
      totalPayout += hand.payout || 0;
      continue;
    }

    if (hand.busted) {
      hand.outcome = "bust";
      hand.payout = 0;
    } else {
      const playerValue = calculateHandValue(hand.cards).value;
      const playerBJ = isBlackjack(hand.cards) && !hand.splitFromAces;

      if (playerBJ && !dealerBJ) {
        hand.outcome = "blackjack";
        hand.payout = Math.round((hand.bet + hand.bet * 1.5) * 1000) / 1000;
      } else if (dealerBusted) {
        hand.outcome = "win";
        hand.payout = hand.bet * 2;
      } else if (playerValue > dealerValue) {
        hand.outcome = "win";
        hand.payout = hand.bet * 2;
      } else if (playerValue === dealerValue) {
        hand.outcome = "push";
        hand.payout = hand.bet;
      } else {
        hand.outcome = "loss";
        hand.payout = 0;
      }
    }

    totalPayout += hand.payout || 0;
  }

  // Insurance payout
  if (state.insuranceBet > 0) {
    if (dealerBJ) {
      totalPayout += state.insuranceBet * 3; // 2:1 + original
    }
    // If dealer doesn't have BJ, insurance bet is lost (already not counted)
  }

  state.totalPayout = totalPayout;
}

// ── Payout calculation ─────────────────────────────────

export function calculateTotalBet(state: BlackjackState): number {
  let total = 0;
  for (const hand of state.playerHands) {
    total += hand.bet;
  }
  total += state.insuranceBet;
  return total;
}

export function getNetGain(state: BlackjackState): number {
  return state.totalPayout - calculateTotalBet(state);
}

// ── Visible state (hide dealer hole card) ──────────────

export type VisibleState = {
  playerHands: Hand[];
  dealerVisibleCards: Card[];
  dealerHoleHidden: boolean;
  currentHandIndex: number;
  insuranceBet: number;
  status: BlackjackState["status"];
  baseBet: number;
  totalPayout: number;
  availableActions: Action[];
};

export function getVisibleState(state: BlackjackState): VisibleState {
  const hideHole = state.status === "playing" || state.status === "dealing";

  return {
    playerHands: state.playerHands,
    dealerVisibleCards: hideHole
      ? [state.dealerHand[0]] // Only show first card
      : state.dealerHand, // Show all
    dealerHoleHidden: hideHole,
    currentHandIndex: state.currentHandIndex,
    insuranceBet: state.insuranceBet,
    status: state.status,
    baseBet: state.baseBet,
    totalPayout: state.totalPayout,
    availableActions: getAvailableActions(state),
  };
}
