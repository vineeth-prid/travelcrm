-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'QUOTE_SENT', 'WON', 'LOST');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN "email" TEXT;

-- AlterTable
ALTER TABLE "conversations"
    ADD COLUMN "destination" TEXT,
    ADD COLUMN "travelMonth" TEXT,
    ADD COLUMN "adults" INTEGER,
    ADD COLUMN "children" INTEGER,
    ADD COLUMN "budget" INTEGER,
    ADD COLUMN "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    ADD COLUMN "notes" TEXT;

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE INDEX "conversations_status_idx" ON "conversations"("status");

-- CreateIndex
CREATE INDEX "conversations_destination_idx" ON "conversations"("destination");
