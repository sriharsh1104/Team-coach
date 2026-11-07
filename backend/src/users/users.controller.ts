import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { CreateDeviceDto } from './dto/create-device.dto';
import { SetPushTokenDto } from './dto/set-push-token.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMyProfile(@CurrentUser() user: { userId: string }) {
    return this.usersService.getMyProfile(user.userId);
  }

  @Patch('me')
  updateMyProfile(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateMyProfile(user.userId, dto);
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

  @Get(':id/profile')
  getMemberProfile(
    @CurrentUser() user: { userId: string },
    @Param('id') targetUserId: string,
  ) {
    return this.usersService.getMemberProfile(user.userId, targetUserId);
  }
}
