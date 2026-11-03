import { Controller, Get, NotFoundException, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MapsService } from './maps.service';

@Controller('maps')
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  /** Catalog for the Maps page — auth required (same as /app/maps). */
  @UseGuards(JwtAuthGuard)
  @Get()
  list() {
    return this.mapsService.listCatalog();
  }

  /**
   * Public image bytes for <img src>.
   * Example: GET /maps/files/drops/bermuda/mill.jpg
   */
  @SkipThrottle()
  @Get('files/*')
  file(@Req() req: Request, @Res() res: Response) {
    // Express splat: /maps/files/foo/bar → params[0] === 'foo/bar'
    const relative = String((req.params as { '0'?: string })['0'] ?? '');
    if (!relative) throw new NotFoundException('Map asset not found');
    const file = this.mapsService.resolveFile(relative);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.contentLength));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    file.stream.pipe(res);
  }
}
