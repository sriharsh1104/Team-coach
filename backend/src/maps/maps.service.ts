import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipRole } from '@prisma/client';
import { createReadStream, existsSync, statSync } from 'fs';
import { join, normalize, sep } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { MediaStorageService } from '../media/media-storage.service';
import { MAPS_CATALOG, FreeFireMapDto } from './maps.catalog';

const SAFE_FILE = /^[a-z0-9][a-z0-9/_-]*\.(jpg|jpeg|png|webp)$/i;
const SLOT_OVERVIEW = 'overview';
const SLOT_PRIMARY = 'primary';
const SLOT_SECONDARY = 'secondary';
const PLACEHOLDER_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

@Injectable()
export class MapsService {
  private readonly root = join(process.cwd(), 'assets', 'maps');

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
  ) {}

  private cloudinaryMapsBase(): string | null {
    const cloud = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    if (!cloud) return null;
    const folder =
      this.config.get<string>('CLOUDINARY_FOLDER')?.trim() || 'team-coach';
    return `https://res.cloudinary.com/${cloud}/image/upload/${folder}/maps`;
  }

  private catalogImageUrl(imagePath: string): string {
    const base = this.cloudinaryMapsBase();
    if (base) return `${base}/${imagePath.replace(/^\/+/, '')}`;
    return `/maps/files/${imagePath}`;
  }

  private deliveryForFileKey(fileKey: string | null | undefined): string {
    if (!fileKey) return PLACEHOLDER_IMAGE;
    const cloud = this.storage.buildDeliveryUrl(fileKey);
    if (cloud) return cloud;
    return `/maps/overrides/${encodeURIComponent(fileKey)}`;
  }

  private findCatalogMap(mapId: string): FreeFireMapDto {
    const map = MAPS_CATALOG.find((m) => m.id === mapId);
    if (!map) throw new NotFoundException('Map not found');
    return map;
  }

  private assertCatalogSlot(map: FreeFireMapDto, slot: string) {
    if (
      slot === SLOT_OVERVIEW ||
      slot === SLOT_PRIMARY ||
      slot === SLOT_SECONDARY
    ) {
      return;
    }
    if (slot.startsWith('vending:')) {
      const machineId = slot.slice('vending:'.length);
      if (map.vendingMachines.some((m) => m.id === machineId)) return;
    }
    throw new BadRequestException('Unknown map image slot');
  }

  private canManageMaps(membership: {
    isOwner: boolean;
    role: MembershipRole | null;
  }) {
    return (
      membership.isOwner ||
      membership.role === MembershipRole.COACH ||
      membership.role === MembershipRole.ANALYST
    );
  }

  private async requireMapManager(userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId },
    });
    if (!membership) {
      throw new ForbiddenException('Join an org roster to manage maps');
    }
    if (!this.canManageMaps(membership)) {
      throw new ForbiddenException(
        'Only the owner, coach, or analyst can manage maps',
      );
    }
    return membership;
  }

  private normalizeTier(tier: string | undefined): 'primary' | 'secondary' | 'extra' {
    if (tier === 'primary' || tier === 'secondary') return tier;
    return 'extra';
  }

  private clamp01(n: number, fallback = 0.5) {
    if (!Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
  }

  async listCatalog(userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId },
    });
    const canUpload = membership ? this.canManageMaps(membership) : false;
    const orgId = membership?.orgId;

    const [overrides, catalogDrops, customMaps] = orgId
      ? await Promise.all([
          this.prisma.orgMapImage.findMany({ where: { orgId } }),
          this.prisma.orgMapDropPoint.findMany({
            where: { orgId, catalogMapId: { not: null } },
          }),
          this.prisma.orgCustomMap.findMany({
            where: { orgId },
            include: { drops: { orderBy: { createdAt: 'asc' } } },
            orderBy: { createdAt: 'asc' },
          }),
        ])
      : [[], [], []];

    const byKey = new Map(
      overrides.map((row) => [`${row.mapId}:${row.slot}`, row.fileKey] as const),
    );

    const resolve = (mapId: string, slot: string, fallbackPath: string) => {
      const fileKey = byKey.get(`${mapId}:${slot}`);
      if (fileKey) return this.deliveryForFileKey(fileKey);
      return this.catalogImageUrl(fallbackPath);
    };

    const catalog = MAPS_CATALOG.map((map) => {
      const extras = catalogDrops
        .filter((d) => d.catalogMapId === map.id)
        .map((d) => ({
          id: d.id,
          name: d.name,
          tier: this.normalizeTier(d.tier),
          note: d.note,
          imageUrl: this.deliveryForFileKey(d.fileKey),
          x: d.x,
          y: d.y,
          isCustomDrop: true,
        }));

      const primary = {
        ...map.primary,
        imageUrl: resolve(map.id, SLOT_PRIMARY, map.primary.imagePath),
        isCustomDrop: false,
      };
      const secondary = {
        ...map.secondary,
        imageUrl: resolve(map.id, SLOT_SECONDARY, map.secondary.imagePath),
        isCustomDrop: false,
      };

      return {
        id: map.id,
        name: map.name,
        theme: map.theme,
        size: map.size,
        isCustom: false,
        canUpload,
        imageUrl: resolve(map.id, SLOT_OVERVIEW, map.imagePath),
        primary,
        secondary,
        drops: [primary, secondary, ...extras],
        vendingMachines: map.vendingMachines.map((machine) => ({
          ...machine,
          imageUrl: resolve(
            map.id,
            `vending:${machine.id}`,
            machine.imagePath,
          ),
        })),
      };
    });

    const customs = customMaps.map((map) => {
      const dropDtos = map.drops.map((d) => ({
        id: d.id,
        name: d.name,
        tier: this.normalizeTier(d.tier),
        note: d.note,
        imageUrl: this.deliveryForFileKey(d.fileKey),
        x: d.x,
        y: d.y,
        isCustomDrop: true,
      }));
      const primary =
        dropDtos.find((d) => d.tier === 'primary') ??
        dropDtos[0] ?? {
          id: `${map.id}-primary`,
          name: 'Primary drop',
          tier: 'primary' as const,
          note: 'Add a drop point',
          imageUrl: PLACEHOLDER_IMAGE,
          x: 0.5,
          y: 0.5,
          isCustomDrop: true,
        };
      const secondary =
        dropDtos.find((d) => d.tier === 'secondary' && d.id !== primary.id) ??
        dropDtos.find((d) => d.id !== primary.id) ?? {
          id: `${map.id}-secondary`,
          name: 'Secondary drop',
          tier: 'secondary' as const,
          note: 'Add a drop point',
          imageUrl: PLACEHOLDER_IMAGE,
          x: 0.5,
          y: 0.5,
          isCustomDrop: true,
        };

      return {
        id: map.id,
        name: map.name,
        theme: map.theme,
        size: map.size,
        isCustom: true,
        canUpload,
        imageUrl: this.deliveryForFileKey(map.overviewFileKey),
        primary,
        secondary,
        drops: dropDtos.length > 0 ? dropDtos : [primary, secondary],
        vendingMachines: [],
      };
    });

    return [...catalog, ...customs];
  }

  async createCustomMap(
    userId: string,
    input: { name: string; theme?: string; size?: string },
    file: Express.Multer.File,
  ) {
    if (!file?.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Overview image is required');
    }
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Map name is required');
    const membership = await this.requireMapManager(userId);
    const stored = await this.storage.storeUploadedFile(file);
    const map = await this.prisma.orgCustomMap.create({
      data: {
        orgId: membership.orgId,
        name,
        theme: input.theme?.trim() || '',
        size: input.size?.trim() || '',
        overviewFileKey: stored.fileKey,
      },
    });
    return {
      id: map.id,
      name: map.name,
      theme: map.theme,
      size: map.size,
      imageUrl: this.deliveryForFileKey(map.overviewFileKey),
      isCustom: true,
    };
  }

  async addDropPoint(
    userId: string,
    mapId: string,
    input: {
      name: string;
      tier?: string;
      note?: string;
      x?: number;
      y?: number;
    },
    file?: Express.Multer.File,
  ) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('Drop name is required');
    const membership = await this.requireMapManager(userId);
    const tier = this.normalizeTier(input.tier);

    const catalog = MAPS_CATALOG.find((m) => m.id === mapId);
    const custom = catalog
      ? null
      : await this.prisma.orgCustomMap.findFirst({
          where: { id: mapId, orgId: membership.orgId },
        });
    if (!catalog && !custom) throw new NotFoundException('Map not found');

    let fileKey: string | null = null;
    if (file) {
      if (!file.mimetype?.startsWith('image/')) {
        throw new BadRequestException('Only image files are allowed');
      }
      const stored = await this.storage.storeUploadedFile(file);
      fileKey = stored.fileKey;
    }

    const drop = await this.prisma.orgMapDropPoint.create({
      data: {
        orgId: membership.orgId,
        catalogMapId: catalog ? mapId : null,
        customMapId: custom ? mapId : null,
        name,
        tier,
        note: input.note?.trim() || '',
        x: this.clamp01(Number(input.x)),
        y: this.clamp01(Number(input.y)),
        fileKey,
      },
    });

    return {
      id: drop.id,
      name: drop.name,
      tier: this.normalizeTier(drop.tier),
      note: drop.note,
      imageUrl: this.deliveryForFileKey(drop.fileKey),
      x: drop.x,
      y: drop.y,
      isCustomDrop: true,
    };
  }

  async uploadMapImage(
    userId: string,
    mapId: string,
    slot: string,
    file: Express.Multer.File,
  ) {
    if (!file?.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed');
    }
    const membership = await this.requireMapManager(userId);

    // Custom map overview replace
    const custom = await this.prisma.orgCustomMap.findFirst({
      where: { id: mapId, orgId: membership.orgId },
    });
    if (custom) {
      if (slot !== SLOT_OVERVIEW) {
        throw new BadRequestException(
          'Use drop-point upload for custom map drop photos',
        );
      }
      const stored = await this.storage.storeUploadedFile(file);
      const prev = custom.overviewFileKey;
      await this.prisma.orgCustomMap.update({
        where: { id: custom.id },
        data: { overviewFileKey: stored.fileKey },
      });
      if (prev && prev !== stored.fileKey) {
        await this.storage.deleteFile(prev).catch(() => undefined);
      }
      return {
        mapId,
        slot,
        imageUrl: this.deliveryForFileKey(stored.fileKey),
      };
    }

    const map = this.findCatalogMap(mapId);
    this.assertCatalogSlot(map, slot);

    const stored = await this.storage.storeUploadedFile(file);
    const existing = await this.prisma.orgMapImage.findUnique({
      where: {
        orgId_mapId_slot: {
          orgId: membership.orgId,
          mapId,
          slot,
        },
      },
    });

    const row = await this.prisma.orgMapImage.upsert({
      where: {
        orgId_mapId_slot: {
          orgId: membership.orgId,
          mapId,
          slot,
        },
      },
      create: {
        orgId: membership.orgId,
        mapId,
        slot,
        fileKey: stored.fileKey,
      },
      update: { fileKey: stored.fileKey },
    });

    if (existing?.fileKey && existing.fileKey !== stored.fileKey) {
      await this.storage.deleteFile(existing.fileKey).catch(() => undefined);
    }

    return {
      mapId,
      slot,
      imageUrl: this.deliveryForFileKey(row.fileKey),
    };
  }

  async clearMapImage(userId: string, mapId: string, slot: string) {
    const map = this.findCatalogMap(mapId);
    this.assertCatalogSlot(map, slot);
    const membership = await this.requireMapManager(userId);
    const existing = await this.prisma.orgMapImage.findUnique({
      where: {
        orgId_mapId_slot: {
          orgId: membership.orgId,
          mapId,
          slot,
        },
      },
    });
    if (!existing) return { cleared: false };
    await this.prisma.orgMapImage.delete({ where: { id: existing.id } });
    await this.storage.deleteFile(existing.fileKey).catch(() => undefined);
    return { cleared: true };
  }

  resolveOverrideFile(fileKey: string) {
    if (this.storage.isCloudinaryKey(fileKey)) {
      const url = this.storage.buildDeliveryUrl(fileKey);
      if (!url) throw new NotFoundException('Map image not found');
      return { redirectUrl: url as string };
    }
    const filePath = this.storage.localFilePath(fileKey);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      throw new NotFoundException('Map image not found');
    }
    const ext = fileKey.split('.').pop()?.toLowerCase();
    const contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
    return {
      stream: createReadStream(filePath),
      contentType,
      contentLength: statSync(filePath).size,
    };
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
