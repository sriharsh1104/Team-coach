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
import { createReadStream, existsSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MediaService } from '../media/media.service';
import { MediaStorageService } from '../media/media-storage.service';
import { mediaFileInterceptorOptions } from '../media/multer-options';
import { ChatService, ORG_CHANNEL } from './chat.service';
import { MarkReadDto } from './dto/mark-read.dto';

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly mediaService: MediaService,
    private readonly storage: MediaStorageService,
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
    FileInterceptor('file', mediaFileInterceptorOptions(50 * 1024 * 1024)),
  )
  async uploadChatMedia(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    await this.chatService.getOrgIdForUser(user.userId);
    const mediaType = file.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE';
    const stored = await this.storage.storeUploadedFile(file);

    const cloudUrl = this.storage.buildDeliveryUrl(stored.fileKey);
    const token = await this.jwtService.signAsync(
      { sub: user.userId, fileKey: stored.fileKey, purpose: 'chat-file' },
      { expiresIn: '7d' },
    );
    const mediaUrl =
      cloudUrl ??
      `/chat/files/${encodeURIComponent(stored.fileKey)}?token=${token}`;

    // Mirror into Media feed so Gemini OCR / leaderboard can use the same file.
    let mediaPostId: string | null = null;
    try {
      const post = await this.mediaService.createPost(
        user.userId,
        stored.fileKey,
        mediaType,
      );
      mediaPostId = post.id;
    } catch (err) {
      this.logger.warn(
        `Failed to mirror chat upload into Media feed: ${(err as Error).message}`,
      );
    }

    return {
      mediaUrl,
      mediaType,
      fileKey: stored.fileKey,
      mediaPostId,
    };
  }

  @Get('files/:fileKey')
  async downloadChatFile(
    @Param('fileKey') fileKey: string,
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ) {
    const key = decodeURIComponent(fileKey);
    let payload: { sub: string; fileKey: string; purpose: string } | undefined;
    try {
      payload = await this.jwtService.verifyAsync(token ?? '');
    } catch {
      payload = undefined;
    }
    if (
      !payload ||
      payload.purpose !== 'chat-file' ||
      payload.fileKey !== key
    ) {
      throw new NotFoundException('File not found');
    }
    await this.chatService.getOrgIdForUser(payload.sub);

    if (this.storage.isCloudinaryKey(key)) {
      const redirectUrl = this.storage.buildDeliveryUrl(key);
      if (!redirectUrl) throw new NotFoundException('File not found');
      return res.redirect(redirectUrl);
    }

    const filePath = this.storage.localFilePath(key);
    if (!existsSync(filePath)) throw new NotFoundException('File not found');
    return createReadStream(filePath).pipe(res);
  }
}
