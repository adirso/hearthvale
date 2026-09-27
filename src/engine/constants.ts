import type { DevCard, Resource, ResourceBag, Terrain } from './types';

export const VICTORY_POINTS_TO_WIN = 10;
export const BANK_SUPPLY_PER_RESOURCE = 19;
export const MAX_HAND_BEFORE_DISCARD = 7;
export const MIN_LONGEST_ROAD = 5;
export const MIN_LARGEST_ARMY = 3;

export const PIECES = { roads: 15, settlements: 5, cities: 4 };

export function bag(partial: Partial<ResourceBag> = {}): ResourceBag {
  return {
    timber: partial.timber ?? 0,
    clay: partial.clay ?? 0,
    fleece: partial.fleece ?? 0,
    harvest: partial.harvest ?? 0,
    stone: partial.stone ?? 0,
  };
}

export const COSTS = {
  road: bag({ timber: 1, clay: 1 }),
  settlement: bag({ timber: 1, clay: 1, fleece: 1, harvest: 1 }),
  city: bag({ harvest: 2, stone: 3 }),
  devCard: bag({ fleece: 1, harvest: 1, stone: 1 }),
} as const;

export type BuildKind = keyof typeof COSTS;

export const TERRAIN_DECK: Terrain[] = [
  ...Array<Terrain>(4).fill('timber'),
  ...Array<Terrain>(3).fill('clay'),
  ...Array<Terrain>(4).fill('fleece'),
  ...Array<Terrain>(4).fill('harvest'),
  ...Array<Terrain>(3).fill('stone'),
  'waste',
];

export const TOKEN_DECK = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];

export const PORT_DECK: (Resource | null)[] = [
  null,
  null,
  null,
  null,
  'timber',
  'clay',
  'fleece',
  'harvest',
  'stone',
];

export const DEV_DECK: DevCard[] = [
  ...Array<DevCard>(14).fill('warden'),
  ...Array<DevCard>(5).fill('monument'),
  'embargo',
  'embargo',
  'bounty',
  'bounty',
  'surveyor',
  'surveyor',
];

/** Number of dice combinations (out of 36) that produce each token. */
export function pips(token: number | null): number {
  if (token === null) return 0;
  return 6 - Math.abs(7 - token);
}

export const RESOURCE_LABEL: Record<Resource, string> = {
  timber: 'Timber',
  clay: 'Clay',
  fleece: 'Fleece',
  harvest: 'Harvest',
  stone: 'Stone',
};

export const DEV_LABEL: Record<DevCard, string> = {
  warden: 'Warden',
  monument: 'Monument',
  embargo: 'Embargo',
  bounty: 'Bounty',
  surveyor: 'Surveyor',
};

export const DEV_DESCRIPTION: Record<DevCard, string> = {
  warden: 'Move the raider and take a card from a rival next to it. Counts toward the Strongest Guard.',
  monument: 'Worth 1 victory point. Stays hidden from rivals.',
  embargo: 'Name a resource. Every rival hands you all of that resource.',
  bounty: 'Take any 2 resources from the bank.',
  surveyor: 'Lay 2 roads at no cost.',
};
