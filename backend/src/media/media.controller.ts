import {
  Body,
  Controller,
  Get,
  Logger,
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
import { MediaStorageService, localMediaType } from './media-storage.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { mediaFileInterceptorOptions } from './multer-options';

@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

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
    this.logger.log(
      `[media] POST /media (arena feed / tournament result) user=${user.userId} type=${dto.type} caption=${dto.caption?.slice(0, 80) || '-'}`,
    );
    const stored = await this.storage.storeUploadedFile(file);
    const post = await this.mediaService.saveUpload(
      user.userId,
      stored.fileKey,
      dto,
    );
    this.logger.log(
      `[media] POST /media ok user=${user.userId} postId=${post.id} fileKey=${stored.fileKey}`,
    );
    return post;
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
    // Without an explicit Content-Type, the browser MIME-sniffs the raw
    // bytes — an uploaded file whose content looks like HTML/SVG could then
    // be rendered and executed in this origin. nosniff forces it to trust
    // the (safely-allowlisted, see localMediaType) type declared here instead.
    res.setHeader('Content-Type', localMediaType(key));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return createReadStream(result.filePath).pipe(res);
  }
}
