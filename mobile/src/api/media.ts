import { apiClient } from './client';
import { MediaPost } from './types';
import { appendFileToFormData } from './uploadFile';

export function listMedia(uploaderId?: string) {
  return apiClient
    .get<MediaPost[]>('/media', { params: uploaderId ? { uploaderId } : {} })
    .then((res) => res.data);
}

export async function uploadMedia(file: {
  uri: string;
  fileName: string;
  mimeType: string;
  caption?: string;
}) {
  const form = new FormData();
  form.append('type', file.mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE');
  if (file.caption) form.append('caption', file.caption);
  await appendFileToFormData(form, {
    uri: file.uri,
    name: file.fileName,
    type: file.mimeType,
  });
  const res = await apiClient.post<MediaPost>('/media', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}
