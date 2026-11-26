import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TrackerService } from './tracker.service';

describe('TrackerService', () => {
  const prisma = {
    healthGoal: { findUnique: jest.fn(), upsert: jest.fn() },
    dailyHealthSample: { findUnique: jest.fn(), upsert: jest.fn() },
    routineItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    routineCompletion: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  let service: TrackerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TrackerService(prisma as any);
  });

  describe('getGoals / getToday', () => {
    it('returns defaults when the user has no HealthGoal row yet', async () => {
      prisma.healthGoal.findUnique.mockResolvedValue(null);
      await expect(service.getGoals('u1')).resolves.toEqual({
        stepGoal: 10000,
        heartGoal: 30,
      });
    });

    it('computes remaining steps and heart points from the synced sample', async () => {
      prisma.healthGoal.findUnique.mockResolvedValue({
        stepGoal: 10000,
        heartGoal: 30,
      });
      prisma.dailyHealthSample.findUnique.mockResolvedValue({
        steps: 7500,
        heartPoints: 12,
        source: 'health_connect',
        syncedAt: new Date('2026-11-26T10:00:00Z'),
      });

      const today = await service.getToday('u1', '2026-11-26');
      expect(today).toMatchObject({
        day: '2026-11-26',
        steps: 7500,
        heartPoints: 12,
        stepsRemaining: 2500,
        heartRemaining: 18,
        stepGoal: 10000,
        heartGoal: 30,
      });
    });
  });

  describe('upsertDay', () => {
    it('upserts the sample then returns the today view', async () => {
      prisma.dailyHealthSample.upsert.mockResolvedValue({
        day: '2026-11-26',
        steps: 100,
        heartPoints: 2,
      });
      prisma.healthGoal.findUnique.mockResolvedValue(null);
      prisma.dailyHealthSample.findUnique.mockResolvedValue({
        steps: 100,
        heartPoints: 2,
        source: 'health_connect',
        syncedAt: new Date(),
      });

      const result = await service.upsertDay('u1', {
        day: '2026-11-26',
        steps: 100,
        heartPoints: 2,
        source: 'health_connect',
      });
      expect(prisma.dailyHealthSample.upsert).toHaveBeenCalled();
      expect(result.steps).toBe(100);
      expect(result.stepsRemaining).toBe(9900);
    });
  });

  describe('routines', () => {
    it('lists active routines with doneToday from completions for that day', async () => {
      prisma.routineItem.findMany.mockResolvedValue([
        {
          id: 'r1',
          title: 'Stretch',
          timeLocal: '07:00',
          alarmEnabled: true,
          sortOrder: 0,
          completions: [{ completedAt: new Date('2026-11-26T07:05:00Z') }],
        },
        {
          id: 'r2',
          title: 'Read',
          timeLocal: '21:00',
          alarmEnabled: false,
          sortOrder: 1,
          completions: [],
        },
      ]);

      const list = await service.listRoutines('u1', '2026-11-26');
      expect(list[0].doneToday).toBe(true);
      expect(list[1].doneToday).toBe(false);
      expect(list[1].title).toBe('Read');
    });

    it('rejects creating more than 40 active routines', async () => {
      prisma.routineItem.count.mockResolvedValue(40);
      await expect(
        service.createRoutine('u1', {
          title: 'Extra',
          timeLocal: '08:00',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404s when updating someone else\'s routine', async () => {
      prisma.routineItem.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'other',
      });
      await expect(
        service.updateRoutine('u1', 'r1', { title: 'Nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('completes a routine for a day via upsert', async () => {
      prisma.routineItem.findUnique.mockResolvedValue({
        id: 'r1',
        userId: 'u1',
      });
      prisma.routineCompletion.upsert.mockResolvedValue({
        day: '2026-11-26',
        completedAt: new Date('2026-11-26T08:00:00Z'),
      });

      const result = await service.completeRoutine('u1', 'r1', {
        day: '2026-11-26',
      });
      expect(result.doneToday).toBe(true);
      expect(result.routineItemId).toBe('r1');
    });
  });
});
