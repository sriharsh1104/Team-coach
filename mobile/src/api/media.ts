import { apiClient } from './client';
import { MediaPost } from './types';

export function listMedia(uploaderId?: string) {
  return apiClient
    .get<MediaPost[]>('/media', { params: uploaderId ? { uploaderId } : {} })
    .then((res) => res.data);
}
