export type FreeFireMap = {
  id: string;
  name: string;
  theme: string;
  size: string;
  /** Official overview from Garena maps portal (web/public/maps). */
  image: string;
};

/**
 * Current Free Fire World Series competitive map pool (FFWS 2026 —
 * Alpine removed). Source: FFWS Africa 2026 Fall / MENA 2026 Spring rulebooks.
 */
export const FREE_FIRE_MAPS: FreeFireMap[] = [
  {
    id: 'bermuda',
    name: 'Bermuda',
    theme: 'Classic island — balanced loot & mid fights',
    size: '~1.9 × 1.9 km',
    image: '/maps/bermuda.jpg',
  },
  {
    id: 'purgatory',
    name: 'Purgatory',
    theme: 'Rural islands — longer range & rotations',
    size: '~1.9 × 1.9 km',
    image: '/maps/purgatory.jpg',
  },
  {
    id: 'kalahari',
    name: 'Kalahari',
    theme: 'Desert high ground — aggressive third parties',
    size: '~1.4 × 1.4 km',
    image: '/maps/kalahari.jpg',
  },
  {
    id: 'nexterra',
    name: 'NeXTerra',
    theme: 'Futuristic vertical — portals & zip fights',
    size: '~1.3 × 1.3 km',
    image: '/maps/nexterra.jpg',
  },
  {
    id: 'solara',
    name: 'Solara',
    theme: 'Coastal port city — slide rails & pace',
    size: '~1.4 × 1.4 km',
    image: '/maps/solara.jpg',
  },
];
