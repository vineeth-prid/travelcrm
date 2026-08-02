-- AlterTable
ALTER TABLE "contacts" ADD COLUMN "username" TEXT;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "lastInboundAt" TIMESTAMP(3);

-- Existing threads: the newest incoming message is the best estimate we have.
UPDATE "conversations" c
SET "lastInboundAt" = (
    SELECT MAX(m."sentAt") FROM "messages" m
    WHERE m."conversationId" = c."id" AND m."direction" = 'INCOMING'
);

-- CreateTable
CREATE TABLE "integration_tokens" (
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_tokens_pkey" PRIMARY KEY ("provider")
);
