export type DropTier = 'primary' | 'secondary';

export type MapDropDto = {
  id: string;
  name: string;
  tier: DropTier;
  note: string;
  /** Relative path under Cloudinary …/maps/ (or local assets/maps). */
  imagePath: string;
  /** Pin position on the square map overview image, 0–1 fraction (left→right). */
  x: number;
  /** Pin position on the square map overview image, 0–1 fraction (top→bottom). */
  y: number;
};

export type VendingMachineDto = {
  id: string;
  name: string;
  note: string;
  imagePath: string;
  x: number;
  y: number;
};

export type FreeFireMapDto = {
  id: string;
  name: string;
  theme: string;
  size: string;
  imagePath: string;
  primary: MapDropDto;
  secondary: MapDropDto;
  vendingMachines: VendingMachineDto[];
};

function drop(
  mapId: string,
  slug: string,
  name: string,
  tier: DropTier,
  note: string,
  x: number,
  y: number,
): MapDropDto {
  return {
    id: `${mapId}-${slug}`,
    name,
    tier,
    note,
    imagePath: `drops/${mapId}/${slug}.jpg`,
    x,
    y,
  };
}

function vendingMachine(
  mapId: string,
  slug: string,
  name: string,
  note: string,
  x: number,
  y: number,
): VendingMachineDto {
  return {
    id: `${mapId}-vending-${slug}`,
    name,
    note,
    imagePath: `vending/${mapId}/${slug}.jpg`,
    x,
    y,
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
    primary: drop(
      'bermuda',
      'mill',
      'Mill',
      'primary',
      'Team primary drop',
      0.32,
      0.38,
    ),
    secondary: drop(
      'bermuda',
      'sentosa',
      'Sentosa',
      'secondary',
      'Team secondary drop',
      0.58,
      0.64,
    ),
    vendingMachines: [
      vendingMachine(
        'bermuda',
        'mill-yard',
        'Mill Yard Vending',
        'Vending machine near the Mill loading dock',
        0.36,
        0.33,
      ),
      vendingMachine(
        'bermuda',
        'clock-tower',
        'Clock Tower Vending',
        'Vending machine by the Clock Tower courtyard',
        0.48,
        0.5,
      ),
      vendingMachine(
        'bermuda',
        'sentosa-pier',
        'Sentosa Pier Vending',
        'Vending machine on the Sentosa pier walkway',
        0.62,
        0.6,
      ),
    ],
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
      0.5,
      0.42,
    ),
    secondary: drop(
      'purgatory',
      'moathouse',
      'Moath House',
      'secondary',
      'Team secondary drop',
      0.4,
      0.6,
    ),
    vendingMachines: [],
  },
  {
    id: 'kalahari',
    name: 'Kalahari',
    theme: 'Desert high ground — aggressive third parties',
    size: '~1.4 × 1.4 km',
    imagePath: 'kalahari.jpg',
    primary: drop(
      'kalahari',
      'the-sub',
      'SUB',
      'primary',
      'Team primary drop',
      0.5,
      0.42,
    ),
    secondary: drop(
      'kalahari',
      'foundation',
      'Foundation',
      'secondary',
      'Team secondary drop',
      0.4,
      0.6,
    ),
    vendingMachines: [],
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
      0.5,
      0.42,
    ),
    secondary: drop(
      'nexterra',
      'boxing-gym',
      'Boxing Gym',
      'secondary',
      'Team secondary drop',
      0.4,
      0.6,
    ),
    vendingMachines: [],
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
      0.5,
      0.42,
    ),
    secondary: drop(
      'solara',
      'the-hub',
      'HUB',
      'secondary',
      'Team secondary drop',
      0.4,
      0.6,
    ),
    vendingMachines: [],
  },
];
