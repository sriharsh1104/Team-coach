import {
  Body,
  Controller,
  Get,
  Logger,
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
import { MediaService } from '../media/media.service';
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
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly mediaService: MediaService,
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
    @Query('before') before?: string,
  ) {
    return this.chatService.listMessages(
      user.userId,
      channelKey?.trim() || ORG_CHANNEL,
      before,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('media')
  listMedia(
    @CurrentUser() user: { userId: string },
    @Query('channelKey') channelKey?: string,
    @Query('before') before?: string,
  ) {
    return this.chatService.listMedia(
      user.userId,
      channelKey?.trim() || ORG_CHANNEL,
      before,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('links')
  listLinks(
    @CurrentUser() user: { userId: string },
    @Query('channelKey') channelKey?: string,
    @Query('before') before?: string,
  ) {
    return this.chatService.listLinks(
      user.userId,
      channelKey?.trim() || ORG_CHANNEL,
      before,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('read-receipts')
  readReceipts(
    @CurrentUser() user: { userId: string },
    @Query('channelKey') channelKey?: string,
  ) {
    return this.chatService.getReadReceipts(
      user.userId,
      channelKey?.trim() || ORG_CHANNEL,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('delivery-receipts')
  deliveryReceipts(
    @CurrentUser() user: { userId: string },
    @Query('channelKey') channelKey?: string,
  ) {
    return this.chatService.getDeliveryReceipts(
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

    // Mirror into Media feed so Gemini OCR / leaderboard can use the same file.
    // Awaited so chat can return mediaPostId and trigger extraction immediately.
    let mediaPostId: string | null = null;
    try {
      const post = await this.mediaService.createPost(
        user.userId,
        file.filename,
        mediaType,
      );
      mediaPostId = post.id;
    } catch (err) {
      this.logger.warn(
        `Failed to mirror chat upload into Media feed: ${(err as Error).message}`,
      );
    }

    return {
      mediaUrl: `/chat/files/${file.filename}?token=${token}`,
      mediaType,
      fileKey: file.filename,
      mediaPostId,
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
