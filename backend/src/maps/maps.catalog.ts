export type DropTier = 'primary' | 'secondary';

export type MapDropDto = {
  id: string;
  name: string;
  tier: DropTier;
  note: string;
  /** Relative path under Cloudinary …/maps/ (or local assets/maps). */
  imagePath: string;
};

export type FreeFireMapDto = {
  id: string;
  name: string;
  theme: string;
  size: string;
  imagePath: string;
  primary: MapDropDto;
  secondary: MapDropDto;
};

function drop(
  mapId: string,
  slug: string,
  name: string,
  tier: DropTier,
  note: string,
): MapDropDto {
  return {
    id: `${mapId}-${slug}`,
    name,
    tier,
    note,
    imagePath: `drops/${mapId}/${slug}.jpg`,
  };
}

/** FFWS 2026 competitive pool + Sacred primary/secondary drops. */
export const MAPS_CATALOG: FreeFireMapDto[] = [
  {
    id: 'bermuda',
    name: 'Bermuda',
    theme: 'Classic island — balanced loot & mid fights',
    size: '~1.9 × 1.9 km',
    imagePath: 'bermuda.jpg',
    primary: drop('bermuda', 'mill', 'Mill', 'primary', 'Team primary drop'),
    secondary: drop(
      'bermuda',
      'sentosa',
      'Sentosa',
      'secondary',
      'Team secondary drop',
    ),
  },
  {
    id: 'purgatory',
    name: 'Purgatory',
    theme: 'Rural islands — longer range & rotations',
    size: '~1.9 × 1.9 km',
    imagePath: 'purgatory.jpg',
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
    id: 'kalahari',
    name: 'Kalahari',
    theme: 'Desert high ground — aggressive third parties',
    size: '~1.4 × 1.4 km',
    imagePath: 'kalahari.jpg',
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
    id: 'nexterra',
    name: 'NeXTerra',
    theme: 'Futuristic vertical — portals & zip fights',
    size: '~1.3 × 1.3 km',
    imagePath: 'nexterra.jpg',
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
  {
    id: 'solara',
    name: 'Solara',
    theme: 'Coastal port city — slide rails & pace',
    size: '~1.4 × 1.4 km',
    imagePath: 'solara.jpg',
    primary: drop(
      'solara',
      'deca-square',
      'Deca Square',
      'primary',
      'Team primary drop',
    ),
    secondary: drop(
      'solara',
      'the-hub',
      'HUB',
      'secondary',
      'Team secondary drop',
    ),
  },
];
