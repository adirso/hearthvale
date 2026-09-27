// Core data types for the Hearthvale rules engine. Nothing in this folder
// depends on React or the browser, so the engine can run headless in tests
// and simulations.

export const RESOURCES = ['timber', 'clay', 'fleece', 'harvest', 'stone'] as const;
export type Resource = (typeof RESOURCES)[number];
export type Terrain = Resource | 'waste';

export type ResourceBag = Record<Resource, number>;

export const DEV_CARDS = ['warden', 'monument', 'embargo', 'bounty', 'surveyor'] as const;
/**
 * warden   – move the raider and steal (counts toward the Strongest Guard)
 * monument – worth one hidden victory point
 * embargo  – name a resource; every opponent hands you all of theirs
 * bounty   – take any two resources from the bank
 * surveyor – build two roads for free
 */
export type DevCard = (typeof DEV_CARDS)[number];

export type Difficulty = 'basic' | 'intermediate';

export interface Hex {
  id: number;
  q: number;
  r: number;
  terrain: Terrain;
  /** Production number, null for the wasteland. */
  token: number | null;
}

export interface Port {
  /** Edge on the coast the harbor is attached to. */
  edge: number;
  /** null = generic 3:1 harbor; otherwise a 2:1 harbor for that resource. */
  resource: Resource | null;
}

export interface Building {
  owner: number;
  kind: 'settlement' | 'city';
}

export interface Player {
  id: number;
  name: string;
  color: string;
  isHuman: boolean;
  difficulty: Difficulty;
  resources: ResourceBag;
  /** Development cards that may be played (bought on an earlier turn). */
  devCards: DevCard[];
  /** Development cards bought during the current turn (not yet playable). */
  newDevCards: DevCard[];
  wardensPlayed: number;
  roadsLeft: number;
  settlementsLeft: number;
  citiesLeft: number;
}

export type Phase =
  | 'setup' // initial placement
  | 'roll' // waiting for the current player to roll
  | 'discard' // a 7 was rolled; players with >7 cards must discard
  | 'moveRaider' // current player must move the raider
  | 'steal' // current player must choose whom to steal from
  | 'main' // build / trade / play cards / end turn
  | 'roadBuilding' // placing free roads from a surveyor card
  | 'gameOver';

/** The most recent development card played, with what it did, for on-screen reveals. */
export interface CardPlay {
  /** Increments with every card played in the game. */
  id: number;
  player: number;
  card: Exclude<DevCard, 'monument'>;
  /** Embargo: the resource named and how many each rival handed over. */
  resource?: Resource;
  taken?: Record<number, number>;
  /** Bounty: the two resources taken from the bank. */
  resources?: [Resource, Resource];
  /** Warden: wardens played so far, and whether this one won the Strongest Guard. */
  wardens?: number;
  gainedArmy?: boolean;
}

/** The most recent robbery. Only the thief and the victim may be told the resource. */
export interface Steal {
  /** Increments with every robbery in the game. */
  id: number;
  thief: number;
  victim: number;
  resource: Resource;
}

export type OfferAnswer = 'pending' | 'accept' | 'decline';

/** An open trade proposal from the current player to everyone else. */
export interface TradeOffer {
  id: number;
  from: number;
  /** What the proposer hands over. */
  give: ResourceBag;
  /** What the proposer wants in return. */
  get: ResourceBag;
  responses: Record<number, OfferAnswer>;
  /** Optional short explanations from responders, for display. */
  reasons: Record<number, string>;
}

export interface LogEntry {
  turn: number;
  player: number | null;
  text: string;
}

export interface GameState {
  version: 1;
  rngState: number;
  hexes: Hex[];
  ports: Port[];
  /** Indexed by vertex id. */
  buildings: (Building | null)[];
  /** Indexed by edge id; value is the owning player id. */
  roads: (number | null)[];
  raiderHex: number;
  players: Player[];
  currentPlayer: number;
  phase: Phase;
  turn: number;
  setup: {
    round: 1 | 2;
    /** Index into setupOrder. */
    index: number;
    order: number[];
    step: 'settlement' | 'road';
    lastSettlement: number | null;
  } | null;
  dice: [number, number] | null;
  hasRolled: boolean;
  bank: ResourceBag;
  devDeck: DevCard[];
  devCardPlayedThisTurn: boolean;
  /** Players who still need to discard, and how many cards each. */
  pendingDiscards: Record<number, number>;
  /** Phase to return to after the raider or free roads are resolved. */
  resumePhase: 'roll' | 'main';
  stealCandidates: number[];
  freeRoadsLeft: number;
  longestRoadHolder: number | null;
  largestArmyHolder: number | null;
  winner: number | null;
  log: LogEntry[];
  /** Bank trades made during the current turn (used by AI to avoid loops). */
  tradesThisTurn: number;
  /** Absent in saves from older versions. */
  lastCardPlay?: CardPlay | null;
  /** Absent in saves from older versions. */
  lastSteal?: Steal | null;
  /** Open trade offer; while set, only offer actions are allowed. Absent in older saves. */
  tradeOffer?: TradeOffer | null;
  /** Offers made during the current turn (lets the AI avoid spamming). */
  offersThisTurn?: number;
  /** Increments with every offer made in the game. */
  offerCount?: number;
  /** Most recent board change, for UI highlighting. */
  lastChange: { kind: 'vertex' | 'edge' | 'hex'; id: number } | null;
}

export type Action =
  | { type: 'placeSetupSettlement'; vertex: number }
  | { type: 'placeSetupRoad'; edge: number }
  | { type: 'rollDice' }
  | { type: 'discard'; player: number; cards: ResourceBag }
  | { type: 'moveRaider'; hex: number }
  | { type: 'steal'; victim: number }
  | { type: 'buildRoad'; edge: number }
  | { type: 'buildSettlement'; vertex: number }
  | { type: 'buildCity'; vertex: number }
  | { type: 'buyDevCard' }
  | { type: 'playWarden' }
  | { type: 'playEmbargo'; resource: Resource }
  | { type: 'playBounty'; resources: [Resource, Resource] }
  | { type: 'playSurveyor' }
  | { type: 'placeFreeRoad'; edge: number }
  | { type: 'bankTrade'; give: Resource; get: Resource }
  | { type: 'playerTrade'; partner: number; give: ResourceBag; get: ResourceBag }
  | { type: 'offerTrade'; give: ResourceBag; get: ResourceBag }
  | { type: 'respondToOffer'; player: number; accept: boolean; reason?: string }
  | { type: 'confirmTrade'; partner: number }
  | { type: 'cancelOffer' }
  | { type: 'endTurn' };

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}
