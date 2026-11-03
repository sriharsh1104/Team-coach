import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

/** Always memory — MediaStorageService writes to Cloudinary or local disk. */
export function mediaFileInterceptorOptions(maxBytes: number) {
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
        /^(image|video)\//.test(file.mimetype) &&
        file.mimetype.toLowerCase() !== 'image/svg+xml';
      cb(
        isAllowed
          ? null
          : new BadRequestException('Only image or video files are allowed'),
        isAllowed,
      );
    },
  };
}
