-- CRM foundation: roles, customers, leads and the lead timeline.
-- Nothing here alters the inbox, quote or Instagram tables beyond adding one
-- nullable column, so existing data and behaviour are untouched.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('MANUAL', 'INSTAGRAM', 'WHATSAPP', 'WEBSITE', 'REFERRAL', 'PHONE', 'EMAIL', 'WALK_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_PREPARING', 'PROPOSAL_SENT', 'FOLLOW_UP', 'NEGOTIATION', 'WON', 'LOST', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "LostReason" AS ENUM ('BUDGET', 'CHOSE_COMPETITOR', 'DATES_CHANGED', 'TRIP_CANCELLED', 'NO_RESPONSE', 'NOT_INTERESTED', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('PHONE', 'WHATSAPP', 'EMAIL', 'IN_PERSON', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('LEAD_CREATED', 'STAGE_CHANGED', 'ASSIGNED', 'NOTE', 'REQUIREMENT_UPDATED', 'AI_SUMMARY', 'FOLLOW_UP_SCHEDULED', 'FOLLOW_UP_COMPLETED', 'FOLLOW_UP_MISSED', 'PROPOSAL_GENERATED', 'PROPOSAL_SENT', 'INVOICE_GENERATED', 'PAYMENT_RECEIVED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'EMPLOYEE';
ALTER TABLE "users" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "canViewOwnProfitability" BOOLEAN NOT NULL DEFAULT false;

-- The account that existed before roles did is the administrator. Without this
-- the only user in the database would be locked out of every admin screen.
UPDATE "users" SET "role" = 'ADMIN'
WHERE "id" = (SELECT "id" FROM "users" ORDER BY "createdAt" ASC LIMIT 1);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "preferredContact" "ContactMethod",
    "city" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");
CREATE INDEX "customers_phone_idx" ON "customers"("phone");
CREATE INDEX "customers_whatsapp_idx" ON "customers"("whatsapp");
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- Hands out "TDH-L-00001", "TDH-L-00002", ... Sequences are transactional and
-- gap-tolerant, which is exactly right for a reference number: two consultants
-- saving at the same instant can never receive the same one.
CREATE SEQUENCE "lead_reference_seq" START 1;

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT ('TDH-L-' || lpad(nextval('lead_reference_seq')::text, 5, '0')),
    "customerId" TEXT NOT NULL,
    "destination" TEXT,
    "departureCity" TEXT,
    "travelStart" TIMESTAMP(3),
    "travelEnd" TIMESTAMP(3),
    "adults" INTEGER,
    "children" INTEGER,
    "childAges" INTEGER[],
    "tripType" TEXT,
    "hotelCategory" TEXT,
    "mealPreference" TEXT,
    "transportRequired" BOOLEAN NOT NULL DEFAULT false,
    "flightRequired" BOOLEAN NOT NULL DEFAULT false,
    "activityRequirements" TEXT,
    "specialRequirements" TEXT,
    "budget" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "rawRequirement" TEXT,
    "requirementSummary" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'MANUAL',
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "priority" "LeadPriority" NOT NULL DEFAULT 'MEDIUM',
    "tags" TEXT[],
    "assignedToId" TEXT,
    "createdById" TEXT,
    "lostReason" "LostReason",
    "lostNotes" TEXT,
    "nextAction" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_reference_key" ON "leads"("reference");
CREATE INDEX "leads_stage_idx" ON "leads"("stage");
CREATE INDEX "leads_assignedToId_idx" ON "leads"("assignedToId");
CREATE INDEX "leads_nextFollowUpAt_idx" ON "leads"("nextFollowUpAt");
CREATE INDEX "leads_createdAt_idx" ON "leads"("createdAt" DESC);
CREATE INDEX "leads_destination_idx" ON "leads"("destination");

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_activities_leadId_seq_idx" ON "lead_activities"("leadId", "seq" DESC);

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "leadId" TEXT;

-- CreateIndex
CREATE INDEX "conversations_leadId_idx" ON "conversations"("leadId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
