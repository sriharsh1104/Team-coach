import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { mediaFileInterceptorOptions } from '../media/multer-options';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpsertGameProfileDto } from './dto/upsert-game-profile.dto';
import { GameProfileVisibilityDto } from './dto/game-profile-visibility.dto';
import { CreateDeviceDto } from './dto/create-device.dto';
import { SetPushTokenDto } from './dto/set-push-token.dto';
import { ConfirmAccountActionDto } from './dto/confirm-account-action.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMyProfile(@CurrentUser() user: { userId: string }) {
    return this.usersService.getMyProfile(user.userId);
  }

  @Post('me/deactivate')
  deactivateMyAccount(
    @CurrentUser() user: { userId: string },
    @Body() dto: ConfirmAccountActionDto,
  ) {
    return this.usersService.deactivateMyAccount(user.userId, dto);
  }

  @Post('me/delete')
  deleteMyAccount(
    @CurrentUser() user: { userId: string },
    @Body() dto: ConfirmAccountActionDto,
  ) {
    return this.usersService.deleteMyAccount(user.userId, dto);
  }

  @Patch('me')
  updateMyProfile(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateMyProfile(user.userId, dto);
  }

  @Put('me/game-profiles')
  upsertGameProfile(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpsertGameProfileDto,
  ) {
    return this.usersService.upsertGameProfile(user.userId, dto);
  }

  @Patch('me/game-profiles/visibility')
  setGameProfileVisibility(
    @CurrentUser() user: { userId: string },
    @Body() dto: GameProfileVisibilityDto,
  ) {
    return this.usersService.setGameProfileVisibility(user.userId, dto);
  }

  @Delete('me/game-profiles/:game')
  removeGameProfile(
    @CurrentUser() user: { userId: string },
    @Param('game') game: string,
  ) {
    return this.usersService.removeGameProfile(user.userId, game);
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', mediaFileInterceptorOptions(5 * 1024 * 1024)),
  )
  setMyAvatar(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Image file is required');
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed for avatars');
    }
    return this.usersService.setMyAvatar(user.userId, file);
  }

  @Get('me/devices')
  listMyDevices(@CurrentUser() user: { userId: string }) {
    return this.usersService.listMyDevices(user.userId);
  }

  @Post('me/devices')
  addDevice(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateDeviceDto,
  ) {
    return this.usersService.addDevice(user.userId, dto);
  }

  @Delete('me/devices/:id')
  removeDevice(
    @CurrentUser() user: { userId: string },
    @Param('id') deviceId: string,
  ) {
    return this.usersService.removeDevice(user.userId, deviceId);
  }

  @Patch('me/push-token')
  setPushToken(
    @CurrentUser() user: { userId: string },
    @Body() dto: SetPushTokenDto,
  ) {
    return this.usersService.setPushToken(user.userId, dto);
  }

  @Delete('me/push-token')
  clearPushToken(
    @CurrentUser() user: { userId: string },
    @Body() dto: SetPushTokenDto,
  ) {
    return this.usersService.clearPushToken(user.userId, dto);
  }

  @Get(':id/profile')
  getMemberProfile(
    @CurrentUser() user: { userId: string },
    @Param('id') targetUserId: string,
  ) {
    return this.usersService.getMemberProfile(user.userId, targetUserId);
  }
}
