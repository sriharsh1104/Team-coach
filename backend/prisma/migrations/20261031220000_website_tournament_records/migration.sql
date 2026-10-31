-- CreateTable
CREATE TABLE "WebsiteTournamentRecord" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "progress" TEXT,
    "qualifierDate" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteTournamentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsiteTournamentRecord_sortOrder_idx" ON "WebsiteTournamentRecord"("sortOrder");

-- Seed Sacred sheet rows (editable later by coaches)
INSERT INTO "WebsiteTournamentRecord" ("id", "name", "status", "kind", "progress", "qualifierDate", "sortOrder", "updatedAt") VALUES
('wtr01', 'Today weekly war GF 1k 9pm', 'Top 7', 'result', 'Finished Top 7', NULL, 1, CURRENT_TIMESTAMP),
('wtr02', 'HC 5k tournament', 'Upcoming', 'upcoming', NULL, NULL, 2, CURRENT_TIMESTAMP),
('wtr03', 'Apex Cup S1 open qualifier', 'Qualifier', 'upcoming', NULL, '26 Oct', 3, CURRENT_TIMESTAMP),
('wtr04', 'RNX tournament', 'Upcoming', 'upcoming', NULL, NULL, 4, CURRENT_TIMESTAMP),
('wtr05', 'Team Elite Cup', 'Upcoming', 'upcoming', NULL, NULL, 5, CURRENT_TIMESTAMP),
('wtr06', 'Google Arena Cup', 'Upcoming', 'upcoming', NULL, NULL, 6, CURRENT_TIMESTAMP),
('wtr07', 'Dushera Cup (Reaganverse)', 'Qualified', 'qualified', 'Qualify for final', 'Today qualifier', 7, CURRENT_TIMESTAMP),
('wtr08', 'Reaganverse SS2', 'Did not qualify', 'did_not_qualify', 'Didn''t qualify for grand final', NULL, 8, CURRENT_TIMESTAMP),
('wtr09', 'Reaganverse Arena Clash', 'Did not qualify', 'did_not_qualify', 'Didn''t qualify for grand', NULL, 9, CURRENT_TIMESTAMP),
('wtr10', 'Havoc Cup', 'Skipped', 'skipped', 'No playing — timing issues', NULL, 10, CURRENT_TIMESTAMP),
('wtr11', 'Aura Cup COCS2', 'Qualified', 'qualified', 'Qualified till round 4', NULL, 11, CURRENT_TIMESTAMP),
('wtr12', '10k Quarter Final (DG)', 'Did not qualify', 'did_not_qualify', 'Didn''t qualify semi', NULL, 12, CURRENT_TIMESTAMP),
('wtr13', '6k BOL', 'Did not qualify', 'did_not_qualify', 'Didn''t qualify', NULL, 13, CURRENT_TIMESTAMP),
('wtr14', 'Apex Come Back Series', 'Registered', 'registered', NULL, NULL, 14, CURRENT_TIMESTAMP),
('wtr15', 'Univ Esports 1.5 Lakh Tournament', 'Registered', 'registered', NULL, NULL, 15, CURRENT_TIMESTAMP),
('wtr16', 'Apex 5k Tournament', 'Final', 'qualified', 'Qualify for next round → Semi final → Final (choked in final)', NULL, 16, CURRENT_TIMESTAMP),
('wtr17', 'Leos Tournament Arena', 'Registered', 'registered', NULL, NULL, 17, CURRENT_TIMESTAMP),
('wtr18', 'Google Arena Cup (Club Orangutan Elite)', 'Registered', 'registered', 'Qualifier scheduled', '1 Nov', 18, CURRENT_TIMESTAMP);
