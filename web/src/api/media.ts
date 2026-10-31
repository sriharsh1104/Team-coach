import { apiClient } from './client';
import { MediaPost } from './types';

export async function uploadMediaFile(
  file: File,
  caption?: string,
): Promise<MediaPost> {
  const form = new FormData();
  form.append('type', file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE');
  if (caption) form.append('caption', caption);
  form.append('file', file, file.name || `upload-${Date.now()}.jpg`);
  const res = await apiClient.post<MediaPost>('/media', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}
