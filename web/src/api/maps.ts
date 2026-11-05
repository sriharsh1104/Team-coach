import { apiClient, resolveMediaUrl } from './client';

export type DropTier = 'primary' | 'secondary';

export type MapDrop = {
  id: string;
  name: string;
  tier: DropTier;
  note: string;
  imageUrl: string;
  /** Pin position on the square map overview image, 0–1 fraction. */
  x: number;
  y: number;
};

export type VendingMachine = {
  id: string;
  name: string;
  note: string;
  imageUrl: string;
  x: number;
  y: number;
};

export type MapPin =
  | ({ category: 'drop' } & MapDrop)
  | ({ category: 'vending_machine' } & VendingMachine);

export type FreeFireMap = {
  id: string;
  name: string;
  theme: string;
  size: string;
  imageUrl: string;
  primary: MapDrop;
  secondary: MapDrop;
  vendingMachines: VendingMachine[];
};

type CatalogDrop = Omit<MapDrop, 'imageUrl'> & { imageUrl: string };
type CatalogVendingMachine = Omit<VendingMachine, 'imageUrl'> & {
  imageUrl: string;
};
type CatalogMap = Omit<
  FreeFireMap,
  'imageUrl' | 'primary' | 'secondary' | 'vendingMachines'
> & {
  imageUrl: string;
  primary: CatalogDrop;
  secondary: CatalogDrop;
  vendingMachines: CatalogVendingMachine[];
};

function withAbsoluteUrls(map: CatalogMap): FreeFireMap {
  return {
    ...map,
    imageUrl: resolveMediaUrl(map.imageUrl) || map.imageUrl,
    primary: {
      ...map.primary,
      imageUrl: resolveMediaUrl(map.primary.imageUrl) || map.primary.imageUrl,
    },
    secondary: {
      ...map.secondary,
      imageUrl:
        resolveMediaUrl(map.secondary.imageUrl) || map.secondary.imageUrl,
    },
    vendingMachines: map.vendingMachines.map((machine) => ({
      ...machine,
      imageUrl: resolveMediaUrl(machine.imageUrl) || machine.imageUrl,
    })),
  };
}

export function mapPins(map: FreeFireMap): MapPin[] {
  return [
    { ...map.primary, category: 'drop' },
    { ...map.secondary, category: 'drop' },
    ...map.vendingMachines.map(
      (machine): MapPin => ({ ...machine, category: 'vending_machine' }),
    ),
  ];
}

export function listMaps() {
  return apiClient
    .get<CatalogMap[]>('/maps')
    .then((res) => res.data.map(withAbsoluteUrls));
}
