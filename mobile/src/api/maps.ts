import { apiClient, resolveMediaUrl } from './client';
import { appendFileToFormData } from './uploadFile';

export type DropTier = 'primary' | 'secondary' | 'extra';

export type MapImageSlot = 'overview' | 'primary' | 'secondary' | string;

export type MapDrop = {
  id: string;
  name: string;
  tier: DropTier;
  note: string;
  imageUrl: string;
  x: number;
  y: number;
  isCustomDrop?: boolean;
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
  canUpload?: boolean;
  isCustom?: boolean;
  primary: MapDrop;
  secondary: MapDrop;
  drops?: MapDrop[];
  vendingMachines: VendingMachine[];
};

type CatalogMap = FreeFireMap;

function absUrl(url: string) {
  return resolveMediaUrl(url) || url;
}

function withAbsoluteUrls(map: CatalogMap): FreeFireMap {
  const primary = { ...map.primary, imageUrl: absUrl(map.primary.imageUrl) };
  const secondary = {
    ...map.secondary,
    imageUrl: absUrl(map.secondary.imageUrl),
  };
  const drops = (map.drops ?? [primary, secondary]).map((d) => ({
    ...d,
    imageUrl: absUrl(d.imageUrl),
  }));
  return {
    ...map,
    canUpload: !!map.canUpload,
    isCustom: !!map.isCustom,
    imageUrl: absUrl(map.imageUrl),
    primary,
    secondary,
    drops,
    vendingMachines: map.vendingMachines.map((machine) => ({
      ...machine,
      imageUrl: absUrl(machine.imageUrl),
    })),
  };
}

export function mapPins(map: FreeFireMap): MapPin[] {
  const drops = map.drops?.length
    ? map.drops
    : [map.primary, map.secondary];
  return [
    ...drops.map((d): MapPin => ({ ...d, category: 'drop' })),
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

function stripMultipartContentType(data: unknown, headers?: object) {
  if (headers) {
    delete (headers as Record<string, unknown>)['Content-Type'];
    delete (headers as Record<string, unknown>)['content-type'];
  }
  return data;
}

export async function uploadMapImage(
  mapId: string,
  slot: MapImageSlot,
  file: { uri: string; fileName: string; mimeType: string },
) {
  const form = new FormData();
  await appendFileToFormData(form, {
    uri: file.uri,
    name: file.fileName,
    type: file.mimeType,
  });
  return apiClient
    .post<{ mapId: string; slot: string; imageUrl: string }>(
      `/maps/${encodeURIComponent(mapId)}/images/${encodeURIComponent(slot)}`,
      form,
      { timeout: 90_000, transformRequest: stripMultipartContentType },
    )
    .then((res) => ({
      ...res.data,
      imageUrl: absUrl(res.data.imageUrl),
    }));
}

export async function createMap(input: {
  name: string;
  theme?: string;
  size?: string;
  file: { uri: string; fileName: string; mimeType: string };
}) {
  const form = new FormData();
  form.append('name', input.name);
  if (input.theme) form.append('theme', input.theme);
  if (input.size) form.append('size', input.size);
  await appendFileToFormData(form, {
    uri: input.file.uri,
    name: input.file.fileName,
    type: input.file.mimeType,
  });
  return apiClient
    .post<{
      id: string;
      name: string;
      theme: string;
      size: string;
      imageUrl: string;
      isCustom: boolean;
    }>('/maps', form, {
      timeout: 90_000,
      transformRequest: stripMultipartContentType,
    })
    .then((res) => ({
      ...res.data,
      imageUrl: absUrl(res.data.imageUrl),
    }));
}

export async function addDropPoint(
  mapId: string,
  input: {
    name: string;
    tier?: DropTier;
    note?: string;
    x?: number;
    y?: number;
    file?: { uri: string; fileName: string; mimeType: string };
  },
) {
  const form = new FormData();
  form.append('name', input.name);
  if (input.tier) form.append('tier', input.tier);
  if (input.note) form.append('note', input.note);
  if (input.x != null) form.append('x', String(input.x));
  if (input.y != null) form.append('y', String(input.y));
  if (input.file) {
    await appendFileToFormData(form, {
      uri: input.file.uri,
      name: input.file.fileName,
      type: input.file.mimeType,
    });
  }
  return apiClient
    .post<MapDrop>(`/maps/${encodeURIComponent(mapId)}/drops`, form, {
      timeout: 90_000,
      transformRequest: stripMultipartContentType,
    })
    .then((res) => ({
      ...res.data,
      imageUrl: absUrl(res.data.imageUrl),
    }));
}

export function clearMapImage(mapId: string, slot: MapImageSlot) {
  return apiClient
    .delete<{ cleared: boolean }>(
      `/maps/${encodeURIComponent(mapId)}/images/${encodeURIComponent(slot)}`,
    )
    .then((res) => res.data);
}
