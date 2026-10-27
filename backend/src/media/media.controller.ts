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
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { customAlphabet } from 'nanoid';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';

const generateFileKey = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  32,
);

const uploadDir = join(process.cwd(), process.env.MEDIA_UPLOAD_DIR ?? 'uploads');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          cb(null, `${generateFileKey()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 100 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const isAllowed = /^(image|video)\//.test(file.mimetype);
        cb(isAllowed ? null : new BadRequestException('Only image or video files are allowed'), isAllowed);
      },
    }),
  )
  async upload(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.mediaService.saveUpload(user.userId, file.filename, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Query('uploaderId') uploaderId?: string,
  ) {
    return this.mediaService.listOrgMedia(user.userId, uploaderId);
  }

  // No JwtAuthGuard here on purpose: <Image>/<Video>/Linking.openURL can't
  // attach an Authorization header, so this route authenticates via the
  // short-lived, single-file-scoped `token` query param that
  // MediaService.buildFileUrl embeds in every URL it hands out — see
  // MediaService.getFileForDownload for the verification.
  @Get('files/:fileKey')
  async getFile(
    @Param('fileKey') fileKey: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const { filePath } = await this.mediaService.getFileForDownload(
      fileKey,
      token,
    );
    res.sendFile(filePath);
  }
}
