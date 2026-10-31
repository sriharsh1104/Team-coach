export type DropTier = 'primary' | 'secondary';

export type DropPoint = {
  id: string;
  name: string;
  tier: DropTier;
  note: string;
  /** Drone / aerial view for clash-landing plans (web/public/maps/drops). */
  image: string;
};

export type MapDropPool = {
  mapId: string;
  primary: DropPoint;
  secondary: DropPoint;
};

function drop(
  mapId: string,
  slug: string,
  name: string,
  tier: DropTier,
  note: string,
): DropPoint {
  return {
    id: `${mapId}-${slug}`,
    name,
    tier,
    note,
    image: `/maps/drops/${mapId}/${slug}.jpg`,
  };
}

/**
 * Sacred Esports team drop points only (primary + secondary per map).
 */
export const MAP_DROP_POOLS: MapDropPool[] = [
  {
    mapId: 'bermuda',
    primary: drop('bermuda', 'mill', 'Mill', 'primary', 'Team primary drop'),
    secondary: drop('bermuda', 'sentosa', 'Sentosa', 'secondary', 'Team secondary drop'),
  },
  {
    mapId: 'purgatory',
    primary: drop(
      'purgatory',
      'mt-villa',
      'Mount Villa',
      'primary',
      'Team primary drop',
    ),
    secondary: drop(
      'purgatory',
      'moathouse',
      'Moath House',
      'secondary',
      'Team secondary drop',
    ),
  },
  {
    mapId: 'kalahari',
    primary: drop('kalahari', 'the-sub', 'SUB', 'primary', 'Team primary drop'),
    secondary: drop(
      'kalahari',
      'foundation',
      'Foundation',
      'secondary',
      'Team secondary drop',
    ),
  },
  {
    mapId: 'solara',
    primary: drop(
      'solara',
      'deca-square',
      'Deca Square',
      'primary',
      'Team primary drop',
    ),
    secondary: drop('solara', 'the-hub', 'HUB', 'secondary', 'Team secondary drop'),
  },
  {
    mapId: 'nexterra',
    primary: drop(
      'nexterra',
      'intellect-center',
      'Intellect',
      'primary',
      'Team primary drop',
    ),
    secondary: drop(
      'nexterra',
      'boxing-gym',
      'Boxing Gym',
      'secondary',
      'Team secondary drop',
    ),
  },
];

export function getDropPool(mapId: string): MapDropPool | undefined {
  return MAP_DROP_POOLS.find((p) => p.mapId === mapId);
}

export function allDropsForMap(mapId: string): DropPoint[] {
  const pool = getDropPool(mapId);
  if (!pool) return [];
  return [pool.primary, pool.secondary];
}
