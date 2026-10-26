import { apiClient } from './client';
import { MediaPost } from './types';

export function listMedia(uploaderId?: string) {
  return apiClient
    .get<MediaPost[]>('/media', { params: uploaderId ? { uploaderId } : {} })
    .then((res) => res.data);
}

export function uploadMedia(params: {
  uri: string;
  fileName: string;
  mimeType: string;
  type: 'IMAGE' | 'VIDEO';
  caption?: string;
}) {
  const form = new FormData();
  // React Native's FormData expects this object shape for a file, not a Blob.
  form.append('file', {
    uri: params.uri,
    name: params.fileName,
    type: params.mimeType,
  } as unknown as Blob);
  form.append('type', params.type);
  if (params.caption) {
    form.append('caption', params.caption);
  }

  return apiClient
    .post<MediaPost>('/media', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data);
}
