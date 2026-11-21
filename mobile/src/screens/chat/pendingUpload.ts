import { PendingUploadStatus } from './PendingMediaOverlay';

/** An outgoing media message that is still being uploaded. */
export type PendingUpload = {
  asset: {
    uri: string;
    fileName: string;
    mimeType: string;
    width?: number | null;
    height?: number | null;
  };
  mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO';
  text?: string;
  replyToId: string | null;
  sizeLabel: string | null;
  status: PendingUploadStatus;
  /** 0..1 */
  progress: number;
  label?: string;
  error?: string;
};
