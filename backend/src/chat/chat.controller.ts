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
import { MediaStorageService, localMediaType } from '../media/media-storage.service';
import { mediaFileInterceptorOptions } from '../media/multer-options';
import { ChatService, ORG_CHANNEL } from './chat.service';
import { MarkReadDto } from './dto/mark-read.dto';
import { DeleteMessagesDto } from './dto/delete-messages.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { MuteChannelDto } from './dto/mute-channel.dto';
import { PinMessageDto } from './dto/pin-message.dto';
import { StarMessageDto } from './dto/star-message.dto';
import { ClearChatDto } from './dto/clear-chat.dto';
import { UpdateChannelMetaDto } from './dto/update-channel-meta.dto';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { ChatReminderService } from './chat-reminder.service';

@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatService: ChatService,
    private readonly chatReminders: ChatReminderService,
    private readonly jwtService: JwtService,
    private readonly mediaService: MediaService,
    private readonly storage: MediaStorageService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('reminders')
  createReminder(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateReminderDto,
  ) {
    return this.chatReminders.create(user.userId, {
      channelKey: dto.channelKey,
      message: dto.message,
      fireAt: dto.fireAt,
    });
  }

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
    @Query('starred') starred?: string,
  ) {
    return this.chatService.listMessages(
      user.userId,
      channelKey?.trim() || ORG_CHANNEL,
      before,
      { starredOnly: starred === '1' || starred === 'true' },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('messages/delete')
  deleteMessages(
    @CurrentUser() user: { userId: string },
    @Body() dto: DeleteMessagesDto,
  ) {
    return this.chatService.deleteOwnMessages(user.userId, dto.ids);
  }

  @UseGuards(JwtAuthGuard)
  @Post('messages/edit')
  editMessage(
    @CurrentUser() user: { userId: string },
    @Body() dto: EditMessageDto,
  ) {
    return this.chatService.editOwnMessage(user.userId, dto.id, dto.text);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mute')
  muteChannel(
    @CurrentUser() user: { userId: string },
    @Body() dto: MuteChannelDto,
  ) {
    return this.chatService.setChannelMuted(
      user.userId,
      dto.channelKey,
      dto.muted,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('clear')
  clearChat(
    @CurrentUser() user: { userId: string },
    @Body() dto: ClearChatDto,
  ) {
    return this.chatService.clearChatForMe(user.userId, dto.channelKey);
  }

  @UseGuards(JwtAuthGuard)
  @Post('pin')
  pinMessage(
    @CurrentUser() user: { userId: string },
    @Body() dto: PinMessageDto,
  ) {
    return this.chatService.setMessagePinned(
      user.userId,
      dto.channelKey,
      dto.messageId,
      dto.pinned,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('pins')
  listPins(
    @CurrentUser() user: { userId: string },
    @Query('channelKey') channelKey?: string,
  ) {
    return this.chatService.listPinnedMessages(
      user.userId,
      channelKey?.trim() || ORG_CHANNEL,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('star')
  starMessage(
    @CurrentUser() user: { userId: string },
    @Body() dto: StarMessageDto,
  ) {
    return this.chatService.setMessageStarred(
      user.userId,
      dto.channelKey,
      dto.messageId,
      dto.starred,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('meta')
  getMeta(
    @CurrentUser() user: { userId: string },
    @Query('channelKey') channelKey?: string,
  ) {
    return this.chatService.getChannelMeta(
      user.userId,
      channelKey?.trim() || ORG_CHANNEL,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('meta')
  updateMeta(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateChannelMetaDto,
  ) {
    return this.chatService.updateChannelMeta(
      user.userId,
      dto.channelKey?.trim() || ORG_CHANNEL,
      {
        description: dto.description,
        disappearAfterSec: dto.disappearAfterSec,
      },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('meta/avatar')
  @UseInterceptors(FileInterceptor('file', mediaFileInterceptorOptions(8 * 1024 * 1024)))
  async uploadChannelAvatar(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('channelKey') channelKey?: string,
  ) {
    if (!file) throw new BadRequestException('Image file is required');
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed for avatars');
    }
    const stored = await this.storage.storeUploadedFile(file);
    return this.chatService.setChannelAvatar(
      user.userId,
      channelKey?.trim() || ORG_CHANNEL,
      stored,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  searchMessages(
    @CurrentUser() user: { userId: string },
    @Query('channelKey') channelKey?: string,
    @Query('q') q?: string,
    @Query('before') before?: string,
  ) {
    return this.chatService.searchMessages(
      user.userId,
      channelKey?.trim() || ORG_CHANNEL,
      q ?? '',
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

  /**
   * Mobile asks for a Cloudinary signature, uploads the file straight to the
   * CDN, then calls POST /chat/media/register — our API never sees the bytes.
   * Returns null fields when Cloudinary is off (client falls back to POST /media).
   */
  @UseGuards(JwtAuthGuard)
  @Get('media/upload-sign')
  async chatMediaUploadSign(
    @CurrentUser() user: { userId: string },
    @Query('resourceType') resourceTypeRaw?: string,
  ) {
    await this.chatService.getChatContext(user.userId);
    const resourceType =
      resourceTypeRaw === 'video' ? ('video' as const) : ('image' as const);
    const sign = this.storage.createDirectUploadSign(resourceType);
    if (!sign) {
      return { enabled: false as const };
    }
    return { enabled: true as const, ...sign };
  }

  /** After a successful direct Cloudinary upload — mint delivery URL + feed row. */
  @UseGuards(JwtAuthGuard)
  @Post('media/register')
  async registerChatMedia(
    @CurrentUser() user: { userId: string },
    @Body()
    body: { publicId?: string; resourceType?: 'image' | 'video' },
  ) {
    await this.chatService.getChatContext(user.userId);
    const publicId = body.publicId?.trim();
    if (!publicId) {
      throw new BadRequestException('publicId is required');
    }
    const resourceType = body.resourceType === 'video' ? 'video' : 'image';
    const fileKey = this.storage.fileKeyFromCloudinaryPublicId(
      publicId,
      resourceType,
    );
    return this.finalizeChatMedia(user.userId, fileKey, resourceType);
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
    this.logger.log(
      `[chat-media] POST /chat/media (guild/org/DM attachment) user=${user.userId} mime=${file.mimetype} bytes=${file.buffer?.length ?? file.size ?? 0}`,
    );
    await this.chatService.getChatContext(user.userId);
    const resourceType = file.mimetype.startsWith('video/') ? 'video' : 'image';
    const stored = await this.storage.storeUploadedFile(file);
    return this.finalizeChatMedia(user.userId, stored.fileKey, resourceType);
  }

  private async finalizeChatMedia(
    userId: string,
    fileKey: string,
    resourceType: 'image' | 'video',
  ) {
    const mediaType = resourceType === 'video' ? 'VIDEO' : 'IMAGE';
    // Always store the API proxy path (not a raw Cloudinary delivery URL).
    // Signed CDN URLs expire (~1h) and then chat history thumbnails die;
    // listMessages/rescope regenerates a fresh delivery URL from this fileKey
    // on every read, same pattern as the Media feed.
    const token = await this.jwtService.signAsync(
      { sub: userId, fileKey, purpose: 'chat-file' },
      { expiresIn: '7d' },
    );
    const mediaUrl = `/chat/files/${encodeURIComponent(fileKey)}?token=${token}`;

    let mediaPostId: string | null = null;
    try {
      const post = await this.mediaService.createPost(
        userId,
        fileKey,
        mediaType,
      );
      mediaPostId = post.id;
      this.logger.log(
        `[chat-media] mirrored to Media feed postId=${mediaPostId} fileKey=${fileKey}`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to mirror chat upload into Media feed: ${(err as Error).message}`,
      );
    }

    this.logger.log(
      `[chat-media] ok user=${userId} mediaType=${mediaType} fileKey=${fileKey} mediaPostId=${mediaPostId ?? 'none'}`,
    );
    return {
      mediaUrl,
      mediaType,
      fileKey,
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
    await this.chatService.getChatContext(payload.sub);

    if (this.storage.isCloudinaryKey(key)) {
      const redirectUrl = this.storage.buildDeliveryUrl(key);
      if (!redirectUrl) throw new NotFoundException('File not found');
      return res.redirect(redirectUrl);
    }

    const filePath = this.storage.localFilePath(key);
    if (!existsSync(filePath)) throw new NotFoundException('File not found');
    // Without an explicit Content-Type, the browser MIME-sniffs the raw
    // bytes — an uploaded file whose content looks like HTML/SVG (regardless
    // of what MIME type it was uploaded with) could then be rendered and
    // executed in this origin. nosniff forces it to trust the (safely
    // allowlisted, see localMediaType) type declared here instead. Mirrors
    // media.controller.ts's getFile, which already does this correctly.
    res.setHeader('Content-Type', localMediaType(key));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return createReadStream(filePath).pipe(res);
  }
}
