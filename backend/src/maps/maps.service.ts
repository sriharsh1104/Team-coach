import { Injectable, NotFoundException } from '@nestjs/common';
import { createReadStream, existsSync, statSync } from 'fs';
import { join, normalize, sep } from 'path';
import { MAPS_CATALOG } from './maps.catalog';

const SAFE_FILE = /^[a-z0-9][a-z0-9/_-]*\.(jpg|jpeg|png|webp)$/i;

@Injectable()
export class MapsService {
  private readonly root = join(process.cwd(), 'assets', 'maps');

  listCatalog() {
    return MAPS_CATALOG.map((map) => ({
      id: map.id,
      name: map.name,
      theme: map.theme,
      size: map.size,
      imageUrl: `/maps/files/${map.imagePath}`,
      primary: {
        ...map.primary,
        imageUrl: `/maps/files/${map.primary.imagePath}`,
      },
      secondary: {
        ...map.secondary,
        imageUrl: `/maps/files/${map.secondary.imagePath}`,
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
