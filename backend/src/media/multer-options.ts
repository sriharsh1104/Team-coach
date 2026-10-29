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
      const isAllowed = /^(image|video)\//.test(file.mimetype);
      cb(
        isAllowed
          ? null
          : new BadRequestException('Only image or video files are allowed'),
        isAllowed,
      );
    },
  };
}
