import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync, statSync } from 'fs';
import { join, normalize, sep } from 'path';
import { MAPS_CATALOG } from './maps.catalog';

const SAFE_FILE = /^[a-z0-9][a-z0-9/_-]*\.(jpg|jpeg|png|webp)$/i;

@Injectable()
export class MapsService {
  private readonly root = join(process.cwd(), 'assets', 'maps');

  constructor(private readonly config: ConfigService) {}

  /**
   * Public Cloudinary delivery base for static map art, e.g.
   * https://res.cloudinary.com/<cloud>/image/upload/team-coach/maps
   * Local/dev without Cloudinary falls back to GET /maps/files/...
   */
  private cloudinaryMapsBase(): string | null {
    const cloud = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    if (!cloud) return null;
    const folder =
      this.config.get<string>('CLOUDINARY_FOLDER')?.trim() || 'team-coach';
    return `https://res.cloudinary.com/${cloud}/image/upload/${folder}/maps`;
  }

  private imageUrlFor(imagePath: string): string {
    const base = this.cloudinaryMapsBase();
    if (base) return `${base}/${imagePath.replace(/^\/+/, '')}`;
    return `/maps/files/${imagePath}`;
  }

  listCatalog() {
    return MAPS_CATALOG.map((map) => ({
      id: map.id,
      name: map.name,
      theme: map.theme,
      size: map.size,
      imageUrl: this.imageUrlFor(map.imagePath),
      primary: {
        ...map.primary,
        imageUrl: this.imageUrlFor(map.primary.imagePath),
      },
      secondary: {
        ...map.secondary,
        imageUrl: this.imageUrlFor(map.secondary.imagePath),
      },
    }));
  }

  resolveFile(relativePath: string) {
    const cleaned = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
    if (!SAFE_FILE.test(cleaned) || cleaned.includes('..')) {
      throw new NotFoundException('Map asset not found');
    }

    const absolute = normalize(join(this.root, cleaned));
    const rootNorm = normalize(this.root + sep);
    if (!absolute.startsWith(rootNorm) && absolute !== normalize(this.root)) {
      throw new NotFoundException('Map asset not found');
    }
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      throw new NotFoundException('Map asset not found');
    }

    const ext = cleaned.split('.').pop()?.toLowerCase();
    const contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';

    return {
      stream: createReadStream(absolute),
      contentType,
      contentLength: statSync(absolute).size,
    };
  }
}
