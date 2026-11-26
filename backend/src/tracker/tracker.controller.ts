import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CompleteRoutineDto,
  CreateRoutineDto,
  HealthTodayQueryDto,
  RoutinesQueryDto,
  UpdateHealthGoalsDto,
  UpdateRoutineDto,
  UpsertHealthDayDto,
} from './dto';
import { TrackerService } from './tracker.service';

function todayLocalFallback(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Controller('tracker')
@UseGuards(JwtAuthGuard)
export class TrackerController {
  constructor(private readonly tracker: TrackerService) {}

  @Get('health/goals')
  getGoals(@CurrentUser() user: { userId: string }) {
    return this.tracker.getGoals(user.userId);
  }

  @Patch('health/goals')
  updateGoals(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateHealthGoalsDto,
  ) {
    return this.tracker.updateGoals(user.userId, dto);
  }

  @Get('health/today')
  getToday(
    @CurrentUser() user: { userId: string },
    @Query() query: HealthTodayQueryDto,
  ) {
    return this.tracker.getToday(
      user.userId,
      query.day ?? todayLocalFallback(),
    );
  }

  @Put('health/day')
  upsertDay(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpsertHealthDayDto,
  ) {
    return this.tracker.upsertDay(user.userId, dto);
  }

  @Get('routines')
  listRoutines(
    @CurrentUser() user: { userId: string },
    @Query() query: RoutinesQueryDto,
  ) {
    return this.tracker.listRoutines(
      user.userId,
      query.day ?? todayLocalFallback(),
    );
  }

  @Post('routines')
  createRoutine(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateRoutineDto,
  ) {
    return this.tracker.createRoutine(user.userId, dto);
  }

  @Patch('routines/:id')
  updateRoutine(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateRoutineDto,
  ) {
    return this.tracker.updateRoutine(user.userId, id, dto);
  }

  @Delete('routines/:id')
  deleteRoutine(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
  ) {
    return this.tracker.deleteRoutine(user.userId, id);
  }

  @Post('routines/:id/complete')
  completeRoutine(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: CompleteRoutineDto,
  ) {
    return this.tracker.completeRoutine(user.userId, id, dto);
  }

  @Delete('routines/:id/complete')
  uncompleteRoutine(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: CompleteRoutineDto,
  ) {
    return this.tracker.uncompleteRoutine(user.userId, id, dto.day);
  }
}
