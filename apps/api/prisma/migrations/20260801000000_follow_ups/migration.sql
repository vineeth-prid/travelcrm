-- The follow-up engine, notifications and SMTP configuration.
-- Additive throughout; nothing existing changes shape.

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'DUE', 'COMPLETED', 'MISSED', 'CANCELLED');
CREATE TYPE "FollowUpOutcome" AS ENUM ('NO_RESPONSE', 'INTERESTED', 'NEEDS_TIME', 'NEGOTIATING', 'REQUESTED_CHANGES', 'READY_TO_BOOK', 'NOT_INTERESTED', 'OTHER');
CREATE TYPE "NotificationType" AS ENUM ('FOLLOW_UP_DUE', 'FOLLOW_UP_MISSED', 'FOLLOW_UP_ESCALATED', 'LEAD_ASSIGNED');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE "SmtpSecurity" AS ENUM ('NONE', 'STARTTLS', 'SSL');

-- CreateTable
CREATE TABLE "follow_up_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "offsetDays" INTEGER[],
    "notifyAssignee" BOOLEAN NOT NULL DEFAULT true,
    "graceHours" INTEGER NOT NULL DEFAULT 24,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "escalateAfterMissed" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_rules_pkey" PRIMARY KEY ("id")
);

-- At most one rule can be the default. A partial unique index says so in the
-- one place that cannot be bypassed.
CREATE UNIQUE INDEX "follow_up_rules_single_default" ON "follow_up_rules"("isDefault") WHERE "isDefault";

-- The Day 1 / 3 / 5 / 7 schedule from the brief. Seeded here rather than in
-- code so it can be changed without a deployment.
INSERT INTO "follow_up_rules" ("id", "name", "offsetDays", "isDefault", "updatedAt")
VALUES (gen_random_uuid(), 'Standard proposal follow-up', ARRAY[1, 3, 5, 7], true, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "ruleId" TEXT,
    "sequence" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "assignedToId" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "comment" TEXT,
    "contactMethod" "ContactMethod",
    "outcome" "FollowUpOutcome",
    "nextAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "follow_ups_proposalId_sequence_key" ON "follow_ups"("proposalId", "sequence");
CREATE INDEX "follow_ups_status_dueAt_idx" ON "follow_ups"("status", "dueAt");
CREATE INDEX "follow_ups_assignedToId_status_dueAt_idx" ON "follow_ups"("assignedToId", "status", "dueAt");
CREATE INDEX "follow_ups_leadId_idx" ON "follow_ups"("leadId");

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "recipientId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- This unique index is what makes "one notification per missed follow-up" a
-- fact rather than an intention: two scheduler passes racing each other, the
-- second insert simply fails.
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");
CREATE INDEX "notifications_status_createdAt_idx" ON "notifications"("status", "createdAt");
CREATE INDEX "notifications_recipientId_createdAt_idx" ON "notifications"("recipientId", "createdAt" DESC);

-- CreateTable
CREATE TABLE "smtp_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "security" "SmtpSecurity" NOT NULL DEFAULT 'STARTTLS',
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smtp_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "follow_up_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
