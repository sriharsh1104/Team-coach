-- CreateTable
CREATE TABLE "HealthGoal" (
    "userId" TEXT NOT NULL,
    "stepGoal" INTEGER NOT NULL DEFAULT 10000,
    "heartGoal" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthGoal_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DailyHealthSample" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "steps" INTEGER NOT NULL,
    "heartPoints" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyHealthSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "timeLocal" TEXT NOT NULL,
    "alarmEnabled" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineCompletion" (
    "id" TEXT NOT NULL,
    "routineItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutineCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyHealthSample_userId_day_idx" ON "DailyHealthSample"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyHealthSample_userId_day_key" ON "DailyHealthSample"("userId", "day");

-- CreateIndex
CREATE INDEX "RoutineItem_userId_active_idx" ON "RoutineItem"("userId", "active");

-- CreateIndex
CREATE INDEX "RoutineCompletion_userId_day_idx" ON "RoutineCompletion"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineCompletion_routineItemId_day_key" ON "RoutineCompletion"("routineItemId", "day");

-- AddForeignKey
ALTER TABLE "HealthGoal" ADD CONSTRAINT "HealthGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyHealthSample" ADD CONSTRAINT "DailyHealthSample_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineItem" ADD CONSTRAINT "RoutineItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineCompletion" ADD CONSTRAINT "RoutineCompletion_routineItemId_fkey" FOREIGN KEY ("routineItemId") REFERENCES "RoutineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineCompletion" ADD CONSTRAINT "RoutineCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
