import { apiClient, resolveMediaUrl } from './client';

export type DropTier = 'primary' | 'secondary';

export type MapDrop = {
  id: string;
  name: string;
  tier: DropTier;
  note: string;
  imageUrl: string;
};

export type FreeFireMap = {
  id: string;
  name: string;
  theme: string;
  size: string;
  imageUrl: string;
  primary: MapDrop;
  secondary: MapDrop;
};

type CatalogDrop = Omit<MapDrop, 'imageUrl'> & { imageUrl: string };
type CatalogMap = Omit<FreeFireMap, 'imageUrl' | 'primary' | 'secondary'> & {
  imageUrl: string;
  primary: CatalogDrop;
  secondary: CatalogDrop;
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
  };
}

export function listMaps() {
  return apiClient
    .get<CatalogMap[]>('/maps')
    .then((res) => res.data.map(withAbsoluteUrls));
}
