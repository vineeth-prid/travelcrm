-- Child ages on the proposal, a default tax rate on the invoice template, and
-- the notification type for a proposal emailed to the customer.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PROPOSAL_SENT';

-- AlterTable: who is travelling, carried from the lead. Existing versions get
-- an empty array, which reads the same as "not recorded".
ALTER TABLE "proposal_versions" ADD COLUMN "childAges" INTEGER[];

-- AlterTable: what a new invoice starts at. Null means no tax, which is what
-- every existing template implicitly had.
ALTER TABLE "document_templates" ADD COLUMN "taxRateBps" INTEGER;
