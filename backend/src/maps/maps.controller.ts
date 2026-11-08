import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { mediaFileInterceptorOptions } from '../media/multer-options';
import { MapsService } from './maps.service';

@Controller('maps')
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.mapsService.listCatalog(user.userId);
  }

  /** Owner / coach / analyst — create a new org map with overview image. */
  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FileInterceptor('file', mediaFileInterceptorOptions(8 * 1024 * 1024)),
  )
  createMap(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body()
    body: { name?: string; theme?: string; size?: string },
  ) {
    if (!file) throw new BadRequestException('Overview image is required');
    return this.mapsService.createCustomMap(
      user.userId,
      {
        name: body.name ?? '',
        theme: body.theme,
        size: body.size,
      },
      file,
    );
  }

  /** Owner / coach / analyst — add a drop point (optional photo) to any map. */
  @UseGuards(JwtAuthGuard)
  @Post(':mapId/drops')
  @UseInterceptors(
    FileInterceptor('file', mediaFileInterceptorOptions(8 * 1024 * 1024)),
  )
  addDrop(
    @CurrentUser() user: { userId: string },
    @Param('mapId') mapId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body()
    body: {
      name?: string;
      tier?: string;
      note?: string;
      x?: string;
      y?: string;
    },
  ) {
    return this.mapsService.addDropPoint(
      user.userId,
      mapId,
      {
        name: body.name ?? '',
        tier: body.tier,
        note: body.note,
        x: body.x != null ? Number(body.x) : undefined,
        y: body.y != null ? Number(body.y) : undefined,
      },
      file,
    );
  }

  /**
   * Replace catalog/custom overview (or catalog primary/secondary/vending)
   * images — Cloudinary when configured.
   */
  @UseGuards(JwtAuthGuard)
  @Post(':mapId/images/:slot')
  @UseInterceptors(
    FileInterceptor('file', mediaFileInterceptorOptions(8 * 1024 * 1024)),
  )
  uploadImage(
    @CurrentUser() user: { userId: string },
    @Param('mapId') mapId: string,
    @Param('slot') slot: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Image file is required');
    return this.mapsService.uploadMapImage(user.userId, mapId, slot, file);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':mapId/images/:slot')
  clearImage(
    @CurrentUser() user: { userId: string },
    @Param('mapId') mapId: string,
    @Param('slot') slot: string,
  ) {
    return this.mapsService.clearMapImage(user.userId, mapId, slot);
  }

  @SkipThrottle()
  @Get('overrides/:fileKey')
  overrideFile(@Param('fileKey') fileKey: string, @Res() res: Response) {
    const decoded = decodeURIComponent(fileKey);
    const file = this.mapsService.resolveOverrideFile(decoded);
    if ('redirectUrl' in file && file.redirectUrl) {
      return res.redirect(file.redirectUrl);
    }
    if (!('stream' in file) || !file.stream) {
      throw new NotFoundException('Map image not found');
    }
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.contentLength));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    file.stream.pipe(res);
  }

  @SkipThrottle()
  @Get('files/*')
  file(@Req() req: Request, @Res() res: Response) {
    const relative = String((req.params as { '0'?: string })['0'] ?? '');
    if (!relative) throw new NotFoundException('Map asset not found');
    const file = this.mapsService.resolveFile(relative);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.contentLength));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    file.stream.pipe(res);
  }
}
