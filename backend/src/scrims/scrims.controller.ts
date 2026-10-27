import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ScrimsService } from './scrims.service';
import { CreateScrimEventDto } from './dto/create-scrim-event.dto';
import { UpdateScrimEventDto } from './dto/update-scrim-event.dto';

@UseGuards(JwtAuthGuard)
@Controller('scrims')
export class ScrimsController {
  constructor(private readonly scrimsService: ScrimsService) {}

  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateScrimEventDto,
  ) {
    return this.scrimsService.create(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: { userId: string }) {
    return this.scrimsService.list(user.userId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateScrimEventDto,
  ) {
    return this.scrimsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.scrimsService.remove(user.userId, id);
  }
}
