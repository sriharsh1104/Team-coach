import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompleteRoutineDto,
  CreateRoutineDto,
  UpdateHealthGoalsDto,
  UpdateRoutineDto,
  UpsertHealthDayDto,
} from './dto';

const DEFAULT_STEP_GOAL = 10000;
const DEFAULT_HEART_GOAL = 30;

@Injectable()
export class TrackerService {
  constructor(private readonly prisma: PrismaService) {}

  async getGoals(userId: string) {
    const row = await this.prisma.healthGoal.findUnique({ where: { userId } });
    return {
      stepGoal: row?.stepGoal ?? DEFAULT_STEP_GOAL,
      heartGoal: row?.heartGoal ?? DEFAULT_HEART_GOAL,
    };
  }

  async updateGoals(userId: string, dto: UpdateHealthGoalsDto) {
    const current = await this.getGoals(userId);
    const stepGoal = dto.stepGoal ?? current.stepGoal;
    const heartGoal = dto.heartGoal ?? current.heartGoal;
    const row = await this.prisma.healthGoal.upsert({
      where: { userId },
      create: { userId, stepGoal, heartGoal },
      update: { stepGoal, heartGoal },
    });
    return { stepGoal: row.stepGoal, heartGoal: row.heartGoal };
  }

  async getToday(userId: string, day: string) {
    const [goals, sample] = await Promise.all([
      this.getGoals(userId),
      this.prisma.dailyHealthSample.findUnique({
        where: { userId_day: { userId, day } },
      }),
    ]);
    const steps = sample?.steps ?? 0;
    const heartPoints = sample?.heartPoints ?? 0;
    return {
      day,
      steps,
      heartPoints,
      source: sample?.source ?? null,
      syncedAt: sample?.syncedAt?.toISOString() ?? null,
      stepGoal: goals.stepGoal,
      heartGoal: goals.heartGoal,
      stepsRemaining: Math.max(0, goals.stepGoal - steps),
      heartRemaining: Math.max(0, goals.heartGoal - heartPoints),
    };
  }

  async upsertDay(userId: string, dto: UpsertHealthDayDto) {
    const heartPoints = dto.heartPoints ?? 0;
    const sample = await this.prisma.dailyHealthSample.upsert({
      where: { userId_day: { userId, day: dto.day } },
      create: {
        userId,
        day: dto.day,
        steps: dto.steps,
        heartPoints,
        source: dto.source ?? null,
      },
      update: {
        steps: dto.steps,
        heartPoints,
        source: dto.source ?? null,
        syncedAt: new Date(),
      },
    });
    return this.getToday(userId, sample.day);
  }

  async listRoutines(userId: string, day: string) {
    const items = await this.prisma.routineItem.findMany({
      where: { userId, active: true },
      orderBy: [{ timeLocal: 'asc' }, { createdAt: 'asc' }],
      include: {
        completions: {
          where: { day },
          take: 1,
        },
      },
    });
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      timeLocal: item.timeLocal,
      alarmEnabled: item.alarmEnabled,
      sortOrder: item.sortOrder,
      doneToday: item.completions.length > 0,
      completedAt: item.completions[0]?.completedAt.toISOString() ?? null,
    }));
  }

  async createRoutine(userId: string, dto: CreateRoutineDto) {
    const count = await this.prisma.routineItem.count({
      where: { userId, active: true },
    });
    if (count >= 40) {
      throw new ForbiddenException('You can have at most 40 active routines');
    }
    const item = await this.prisma.routineItem.create({
      data: {
        userId,
        title: dto.title.trim(),
        timeLocal: dto.timeLocal,
        alarmEnabled: dto.alarmEnabled ?? true,
        sortOrder: count,
      },
    });
    return {
      id: item.id,
      title: item.title,
      timeLocal: item.timeLocal,
      alarmEnabled: item.alarmEnabled,
      sortOrder: item.sortOrder,
      doneToday: false,
      completedAt: null,
    };
  }

  async updateRoutine(userId: string, id: string, dto: UpdateRoutineDto) {
    await this.requireOwnedRoutine(userId, id);
    const item = await this.prisma.routineItem.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.timeLocal !== undefined ? { timeLocal: dto.timeLocal } : {}),
        ...(dto.alarmEnabled !== undefined
          ? { alarmEnabled: dto.alarmEnabled }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    return {
      id: item.id,
      title: item.title,
      timeLocal: item.timeLocal,
      alarmEnabled: item.alarmEnabled,
      sortOrder: item.sortOrder,
      active: item.active,
    };
  }

  async deleteRoutine(userId: string, id: string) {
    await this.requireOwnedRoutine(userId, id);
    await this.prisma.routineItem.delete({ where: { id } });
    return { ok: true };
  }

  async completeRoutine(userId: string, id: string, dto: CompleteRoutineDto) {
    await this.requireOwnedRoutine(userId, id);
    const row = await this.prisma.routineCompletion.upsert({
      where: {
        routineItemId_day: { routineItemId: id, day: dto.day },
      },
      create: { routineItemId: id, userId, day: dto.day },
      update: { completedAt: new Date() },
    });
    return {
      routineItemId: id,
      day: row.day,
      completedAt: row.completedAt.toISOString(),
      doneToday: true,
    };
  }

  async uncompleteRoutine(userId: string, id: string, day: string) {
    await this.requireOwnedRoutine(userId, id);
    await this.prisma.routineCompletion.deleteMany({
      where: { routineItemId: id, userId, day },
    });
    return { routineItemId: id, day, doneToday: false };
  }

  private async requireOwnedRoutine(userId: string, id: string) {
    const item = await this.prisma.routineItem.findUnique({ where: { id } });
    if (!item || item.userId !== userId) {
      throw new NotFoundException('Routine not found');
    }
    return item;
  }
}
