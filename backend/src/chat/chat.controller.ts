import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { customAlphabet } from 'nanoid';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatService, ORG_CHANNEL } from './chat.service';
import { MarkReadDto } from './dto/mark-read.dto';

const generateFileKey = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  32,
);

const uploadDir = join(process.cwd(), process.env.MEDIA_UPLOAD_DIR ?? 'uploads');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('channels')
  listChannels(@CurrentUser() user: { userId: string }) {
    return this.chatService.listChannels(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('unread')
  unreadSummary(@CurrentUser() user: { userId: string }) {
    return this.chatService.getUnreadSummary(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('messages')
  listMessages(
    @CurrentUser() user: { userId: string },
    @Query('channelKey') channelKey?: string,
  ) {
    return this.chatService.listMessages(
      user.userId,
      channelKey?.trim() || ORG_CHANNEL,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('read')
  markRead(
    @CurrentUser() user: { userId: string },
    @Body() dto: MarkReadDto,
  ) {
    return this.chatService.markRead(
      user.userId,
      dto.channelKey?.trim() || ORG_CHANNEL,
    );
  }

  /** Chat-only media upload — does not create a MediaPost / coach notify. */
  @UseGuards(JwtAuthGuard)
  @Post('media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          cb(null, `${generateFileKey()}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const isAllowed = /^(image|video)\//.test(file.mimetype);
        cb(
          isAllowed
            ? null
            : new BadRequestException('Only image or video files are allowed'),
          isAllowed,
        );
      },
    }),
  )
  async uploadChatMedia(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    await this.chatService.getOrgIdForUser(user.userId);
    const mediaType = file.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE';
    const token = await this.jwtService.signAsync(
      { sub: user.userId, fileKey: file.filename, purpose: 'chat-file' },
      { expiresIn: '7d' },
    );
    return {
      mediaUrl: `/chat/files/${file.filename}?token=${token}`,
      mediaType,
      fileKey: file.filename,
    };
  }

  @Get('files/:fileKey')
  async downloadChatFile(
    @Param('fileKey') fileKey: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    let payload: { sub: string; fileKey: string; purpose: string } | undefined;
    try {
      payload = await this.jwtService.verifyAsync(token ?? '');
    } catch {
      payload = undefined;
    }
    if (
      !payload ||
      payload.purpose !== 'chat-file' ||
      payload.fileKey !== fileKey
    ) {
      throw new NotFoundException('File not found');
    }
    await this.chatService.getOrgIdForUser(payload.sub);
    const filePath = join(uploadDir, fileKey);
    if (!existsSync(filePath)) throw new NotFoundException('File not found');
    return res.sendFile(filePath);
  }
}
