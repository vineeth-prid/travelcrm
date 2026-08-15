-- Follow-ups against anything, customer conversion, and the boilerplate that
-- used to be environment variables.

-- CreateEnum
CREATE TYPE "FollowUpKind" AS ENUM ('LEAD', 'PROPOSAL', 'INVOICE');

-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('PROPOSAL', 'INVOICE');

-- AlterTable: a follow-up can now chase a lead or an invoice, not only a
-- proposal. Existing rows are all proposal follow-ups, which is the default.
ALTER TABLE "follow_ups"
  ADD COLUMN "kind" "FollowUpKind" NOT NULL DEFAULT 'PROPOSAL',
  ADD COLUMN "invoiceId" TEXT,
  ADD COLUMN "reason" TEXT,
  ALTER COLUMN "proposalId" DROP NOT NULL;

-- The foreign key has to be recreated: the column is nullable now.
ALTER TABLE "follow_ups" DROP CONSTRAINT "follow_ups_proposalId_fkey";

ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "follow_ups_invoiceId_idx" ON "follow_ups"("invoiceId");

-- CreateIndex
CREATE INDEX "follow_ups_kind_status_idx" ON "follow_ups"("kind", "status");

-- AlterTable: an enquiry becomes a customer when the first invoice is raised.
ALTER TABLE "customers" ADD COLUMN "convertedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "customers_convertedAt_idx" ON "customers"("convertedAt");

-- CreateTable
CREATE TABLE "company_profile" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL DEFAULT 'Tour De India Holidays',
    "tagline" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "taxId" TEXT,
    "bankDetails" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "kind" "TemplateKind" NOT NULL,
    "terms" TEXT,
    "inclusions" TEXT,
    "exclusions" TEXT,
    "paymentTerms" TEXT,
    "footerNote" TEXT,
    "validityDays" INTEGER NOT NULL DEFAULT 14,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_kind_key" ON "document_templates"("kind");
