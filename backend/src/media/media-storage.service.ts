import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { Readable } from 'stream';
import { customAlphabet } from 'nanoid';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

const generateLocalKey = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  32,
);

export type StoredMedia = {
  /** DB fileKey — local filename OR `image:public_id` / `video:public_id`. */
  fileKey: string;
  /** Public HTTPS URL when Cloudinary is on; otherwise null (use signed local route). */
  deliveryUrl: string | null;
  resourceType: 'image' | 'video';
};

/**
 * Local disk (tests / offline) or Cloudinary (when CLOUDINARY_* is set).
 * fileKey stays the single source of truth in MediaPost / chat tokens.
 */
@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);
  private readonly uploadDir: string;
  private readonly folder: string;
  readonly cloudinaryEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.uploadDir = join(
      process.cwd(),
      this.config.get<string>('MEDIA_UPLOAD_DIR', 'uploads'),
    );
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }

    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')?.trim();
    this.folder =
      this.config.get<string>('CLOUDINARY_FOLDER')?.trim() || 'team-coach';

    this.cloudinaryEnabled = Boolean(cloudName && apiKey && apiSecret);
    if (this.cloudinaryEnabled) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.logger.log(`Cloudinary storage enabled (folder=${this.folder})`);
    } else {
      this.logger.log('Cloudinary not configured — using local MEDIA_UPLOAD_DIR');
    }
  }

  isCloudinaryKey(fileKey: string): boolean {
    return fileKey.startsWith('image:') || fileKey.startsWith('video:');
  }

  parseCloudinaryKey(fileKey: string): {
    resourceType: 'image' | 'video';
    publicId: string;
  } {
    const idx = fileKey.indexOf(':');
    const resourceType = fileKey.slice(0, idx) as 'image' | 'video';
    const publicId = fileKey.slice(idx + 1);
    return { resourceType, publicId };
  }

  async storeUploadedFile(file: Express.Multer.File): Promise<StoredMedia> {
    const resourceType: 'image' | 'video' = file.mimetype.startsWith('video/')
      ? 'video'
      : 'image';

    if (this.cloudinaryEnabled) {
      return this.uploadToCloudinary(file, resourceType);
    }
    return this.saveLocal(file, resourceType);
  }

  /** Absolute path for local keys only. */
  localFilePath(fileKey: string): string {
    return join(this.uploadDir, fileKey);
  }

  /**
   * Delivery URL for API responses. Cloudinary → signed HTTPS.
   * Local → null (caller builds JWT query URL).
   */
  buildDeliveryUrl(fileKey: string): string | null {
    if (!this.isCloudinaryKey(fileKey)) return null;
    const { resourceType, publicId } = this.parseCloudinaryKey(fileKey);
    return cloudinary.url(publicId, {
      resource_type: resourceType,
      type: 'authenticated',
      sign_url: true,
      secure: true,
      // 1 hour — clients refresh URLs on list/reload.
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
  }

  /** Bytes for OCR / processing — works for local + Cloudinary. */
  async readFileBuffer(fileKey: string): Promise<{
    buffer: Buffer;
    mediaType: string;
  }> {
    if (this.isCloudinaryKey(fileKey)) {
      const { resourceType, publicId } = this.parseCloudinaryKey(fileKey);
      const url = cloudinary.url(publicId, {
        resource_type: resourceType,
        type: 'authenticated',
        sign_url: true,
        secure: true,
        expires_at: Math.floor(Date.now() / 1000) + 600,
      });
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Cloudinary fetch failed (${res.status}) for ${publicId}`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const mediaType =
        res.headers.get('content-type') ||
        (resourceType === 'video' ? 'video/mp4' : 'image/jpeg');
      return { buffer, mediaType };
    }

    const { readFile } = await import('fs/promises');
    const buffer = await readFile(this.localFilePath(fileKey));
    const ext = extname(fileKey).toLowerCase();
    const mediaType =
      (
        {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.mp4': 'video/mp4',
          '.mov': 'video/quicktime',
          '.webm': 'video/webm',
        } as Record<string, string>
      )[ext] ?? 'application/octet-stream';
    return { buffer, mediaType };
  }

  private async uploadToCloudinary(
    file: Express.Multer.File,
    resourceType: 'image' | 'video',
  ): Promise<StoredMedia> {
    if (!file.buffer?.length) {
      throw new Error('Uploaded file buffer is empty');
    }
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: this.folder,
          public_id: generateLocalKey(),
          resource_type: resourceType,
          type: 'authenticated',
          overwrite: false,
        },
        (err, uploaded) => {
          if (err || !uploaded) reject(err ?? new Error('Cloudinary upload failed'));
          else resolve(uploaded);
        },
      );
      Readable.from(file.buffer).pipe(stream);
    });

    const fileKey = `${resourceType}:${result.public_id}`;
    return {
      fileKey,
      deliveryUrl: this.buildDeliveryUrl(fileKey),
      resourceType,
    };
  }

  private async saveLocal(
    file: Express.Multer.File,
    resourceType: 'image' | 'video',
  ): Promise<StoredMedia> {
    if (!file.buffer?.length) {
      throw new Error('Uploaded file buffer is empty');
    }
    const ext =
      extname(file.originalname) ||
      (resourceType === 'video' ? '.mp4' : '.jpg');
    const fileKey = `${generateLocalKey()}${ext}`;
    const { writeFile } = await import('fs/promises');
    await writeFile(this.localFilePath(fileKey), file.buffer);
    return { fileKey, deliveryUrl: null, resourceType };
  }
}
