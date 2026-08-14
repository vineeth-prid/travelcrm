-- Proposals: a versioned, priced offer against a lead.
--
-- Entirely additive. The inbox's own `quotes` tables are untouched: they remain
-- the quick line-item quote a consultant sends from a conversation, and nothing
-- here reads or writes them.

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'GENERATED', 'SENT', 'FOLLOW_UP', 'NEGOTIATION', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- Hands out "TDH-P-00001", "TDH-P-00002", ... See lead_reference_seq for why
-- this is a sequence rather than a count.
CREATE SEQUENCE "proposal_reference_seq" START 1;

-- CreateTable
CREATE TABLE "proposals" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT ('TDH-P-' || lpad(nextval('proposal_reference_seq')::text, 5, '0')),
    "leadId" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proposals_reference_key" ON "proposals"("reference");
CREATE INDEX "proposals_leadId_idx" ON "proposals"("leadId");
CREATE INDEX "proposals_status_idx" ON "proposals"("status");
CREATE INDEX "proposals_submittedAt_idx" ON "proposals"("submittedAt");

-- CreateTable
CREATE TABLE "proposal_versions" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT,
    "travelStart" TIMESTAMP(3),
    "travelEnd" TIMESTAMP(3),
    "adults" INTEGER,
    "children" INTEGER,
    "executiveSummary" TEXT,
    "itinerary" TEXT,
    "inclusions" TEXT,
    "exclusions" TEXT,
    "hotelInfo" TEXT,
    "transportInfo" TEXT,
    "activities" TEXT,
    "terms" TEXT,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "sellingPrice" INTEGER NOT NULL DEFAULT 0,
    "actualCost" INTEGER NOT NULL DEFAULT 0,
    "pdfPath" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proposal_versions_proposalId_version_key" ON "proposal_versions"("proposalId", "version");
CREATE INDEX "proposal_versions_proposalId_version_idx" ON "proposal_versions"("proposalId", "version" DESC);

-- Money must not be able to go negative through any path, including a direct
-- database edit. The application validates too; this is the floor under it.
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_sellingPrice_check" CHECK ("sellingPrice" >= 0);
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_actualCost_check" CHECK ("actualCost" >= 0);

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
