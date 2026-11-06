import { apiClient } from './client';
import { MediaPost } from './types';
import { appendFileToFormData } from './uploadFile';
import { compressForUpload } from '../media/compressForUpload';

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
  width?: number | null;
  height?: number | null;
}) {
  const prepared = await compressForUpload(file);
  const form = new FormData();
  form.append('type', prepared.mimeType.startsWith('video/') ? 'VIDEO' : 'IMAGE');
  if (file.caption) form.append('caption', file.caption);
  await appendFileToFormData(form, {
    uri: prepared.uri,
    name: prepared.fileName,
    type: prepared.mimeType,
  });
  const res = await apiClient.post<MediaPost>('/media', form, {
    // Let axios/RN set multipart boundary — see uploadChatMedia.
    timeout: 120_000,
    transformRequest: (data, headers) => {
      if (headers && typeof headers === 'object') {
        delete (headers as Record<string, unknown>)['Content-Type'];
        delete (headers as Record<string, unknown>)['content-type'];
      }
      return data;
    },
  });
  return res.data;
}
