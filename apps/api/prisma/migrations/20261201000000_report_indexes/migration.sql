-- Indexes for the two filters that were doing sequential scans.
--
-- `leads.createdById` is half of the employee visibility rule (assigned to me
-- OR created by me); only the assigned half was indexed. The `createdAt`
-- indexes carry every reporting window — the dashboard and the CSV exports
-- both filter proposals and invoices by period.

-- CreateIndex
CREATE INDEX "leads_createdById_idx" ON "leads"("createdById");

-- CreateIndex
CREATE INDEX "proposals_createdAt_idx" ON "proposals"("createdAt");

-- CreateIndex
CREATE INDEX "invoices_createdAt_idx" ON "invoices"("createdAt");
