import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

/**
 * Always memory — MediaStorageService writes to Cloudinary or local disk.
 * `allowAudio` opts a route into accepting voice notes too (only chat's
 * general attachment upload does — avatars, group photos and the Media
 * Feed stay image/video only).
 */
export function mediaFileInterceptorOptions(
  maxBytes: number,
  allowAudio = false,
) {
  const pattern = allowAudio ? /^(image|video|audio)\// : /^(image|video)\//;
  return {
    storage: memoryStorage(),
    limits: { fileSize: maxBytes },
    fileFilter: (
      _req: unknown,
      file: Express.Multer.File,
      cb: (error: Error | null, acceptFile: boolean) => void,
    ) => {
      // SVG is excluded even though it matches image/* — it can embed
      // <script>, and would otherwise be stored and served back to other
      // members as a scoreboard screenshot / chat attachment.
      const isAllowed =
        pattern.test(file.mimetype) &&
        file.mimetype.toLowerCase() !== 'image/svg+xml';
      cb(
        isAllowed
          ? null
          : new BadRequestException(
              allowAudio
                ? 'Only image, video or audio files are allowed'
                : 'Only image or video files are allowed',
            ),
        isAllowed,
      );
    },
  };
}
