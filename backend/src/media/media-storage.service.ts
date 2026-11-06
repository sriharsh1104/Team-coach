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

// Extension allowlist only — anything not listed here (including .svg/.html,
// which can't end up here anyway since multer-options.ts rejects svg+xml and
// everything non-image/video) falls back to the inert application/octet-stream
// rather than letting a browser sniff the raw bytes and render/execute them.
const LOCAL_MEDIA_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

export function localMediaType(fileKey: string): string {
  return LOCAL_MEDIA_TYPES[extname(fileKey).toLowerCase()] ?? 'application/octet-stream';
}

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
export type CloudinaryDirectUploadSign = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  resourceType: 'image' | 'video';
  type: 'authenticated';
  /** Full Cloudinary upload endpoint for the mobile client. */
  uploadUrl: string;
};

@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);
  private readonly uploadDir: string;
  private readonly folder: string;
  private readonly cloudName: string | null;
  private readonly apiKey: string | null;
  private readonly apiSecret: string | null;
  readonly cloudinaryEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.uploadDir = join(
      process.cwd(),
      this.config.get<string>('MEDIA_UPLOAD_DIR', 'uploads'),
    );
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }

    this.cloudName =
      this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim() || null;
    this.apiKey = this.config.get<string>('CLOUDINARY_API_KEY')?.trim() || null;
    this.apiSecret =
      this.config.get<string>('CLOUDINARY_API_SECRET')?.trim() || null;
    this.folder =
      this.config.get<string>('CLOUDINARY_FOLDER')?.trim() || 'team-coach';

    this.cloudinaryEnabled = Boolean(
      this.cloudName && this.apiKey && this.apiSecret,
    );
    if (this.cloudinaryEnabled) {
      cloudinary.config({
        cloud_name: this.cloudName!,
        api_key: this.apiKey!,
        api_secret: this.apiSecret!,
        secure: true,
      });
      this.logger.log(`Cloudinary storage enabled (folder=${this.folder})`);
    } else {
      this.logger.log('Cloudinary not configured — using local MEDIA_UPLOAD_DIR');
    }
  }

  /**
   * Signed params so the phone can POST the file straight to Cloudinary
   * (WhatsApp-style: CDN holds bytes, our API never buffers the upload).
   */
  createDirectUploadSign(
    resourceType: 'image' | 'video' = 'image',
  ): CloudinaryDirectUploadSign | null {
    if (!this.cloudinaryEnabled || !this.cloudName || !this.apiKey) {
      return null;
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = generateLocalKey();
    const paramsToSign = {
      timestamp,
      folder: this.folder,
      public_id: publicId,
      type: 'authenticated' as const,
    };
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      this.apiSecret!,
    );
    return {
      cloudName: this.cloudName,
      apiKey: this.apiKey,
      timestamp,
      signature,
      folder: this.folder,
      publicId,
      resourceType,
      type: 'authenticated',
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`,
    };
  }

  /** After a direct client upload — `public_id` from Cloudinary's response. */
  fileKeyFromCloudinaryPublicId(
    publicId: string,
    resourceType: 'image' | 'video',
  ): string {
    return `${resourceType}:${publicId}`;
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
    const bytes = file.buffer?.length ?? file.size ?? 0;
    this.logger.log(
      `[media] store start type=${resourceType} mime=${file.mimetype} bytes=${bytes} name=${file.originalname || 'n/a'} via=${this.cloudinaryEnabled ? 'cloudinary' : 'local'}`,
    );

    const stored = this.cloudinaryEnabled
      ? await this.uploadToCloudinary(file, resourceType)
      : await this.saveLocal(file, resourceType);

    this.logger.log(
      `[media] store ok fileKey=${stored.fileKey} type=${stored.resourceType}`,
    );
    return stored;
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
    return { buffer, mediaType: localMediaType(fileKey) };
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
