-- The audit trail. Append-only by construction: the application has no code
-- that updates or deletes a row here (§31).

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ASSIGN', 'STATUS_CHANGE', 'SUBMIT', 'PAYMENT', 'CONFIG', 'AUTH');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "action" "AuditAction" NOT NULL,
    "summary" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "ip" TEXT,
    "status" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");
CREATE INDEX "audit_logs_actorId_seq_idx" ON "audit_logs"("actorId", "seq" DESC);
CREATE INDEX "audit_logs_seq_idx" ON "audit_logs"("seq" DESC);

-- AddForeignKey
-- SET NULL, not CASCADE: removing an account must not erase what that person
-- did. `actorName` and `actorRole` are copied in for exactly this reason.
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
