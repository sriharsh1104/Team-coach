import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { MediaStorageService } from './media-storage.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { mediaFileInterceptorOptions } from './multer-options';

@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly storage: MediaStorageService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FileInterceptor('file', mediaFileInterceptorOptions(100 * 1024 * 1024)),
  )
  async upload(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const stored = await this.storage.storeUploadedFile(file);
    return this.mediaService.saveUpload(user.userId, stored.fileKey, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Query('uploaderId') uploaderId?: string,
  ) {
    return this.mediaService.listOrgMedia(user.userId, uploaderId);
  }

  // No JwtAuthGuard — <Image> can't send Authorization; short-lived token
  // query param is verified in MediaService.getFileForDownload.
  @Get('files/:fileKey')
  async getFile(
    @Param('fileKey') fileKey: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    // Express may decode `image:foo/bar` oddly — accept encoded keys too.
    const key = decodeURIComponent(fileKey);
    const result = await this.mediaService.getFileForDownload(key, token);
    if (result.redirectUrl) {
      return res.redirect(result.redirectUrl);
    }
    if (!result.filePath || !existsSync(result.filePath)) {
      return res.status(404).end();
    }
    return createReadStream(result.filePath).pipe(res);
  }
}
