-- Company expenses. Internal throughout, and additive.

CREATE SEQUENCE "expense_reference_seq" START 1;

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");
CREATE UNIQUE INDEX "expense_categories_slug_key" ON "expense_categories"("slug");

-- The categories from the brief. Seeded here rather than hardcoded so an
-- administrator can rename them, deactivate them or add their own.
INSERT INTO "expense_categories" ("id", "name", "slug", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid(), 'Advertising',        'advertising', 10, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Marketing',          'marketing',   20, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Office',             'office',      30, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Salaries',           'salaries',    40, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Travel',             'travel',      50, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Software',           'software',    60, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Vendor',             'vendor',      70, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Operations',         'operations',  80, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Bank & payment fees','bank-fees',   90, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Miscellaneous',      'misc',       100, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT ('TDH-EXP-' || lpad(nextval('expense_reference_seq')::text, 5, '0')),
    "spentAt" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "paidById" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "vendor" TEXT,
    "externalReference" TEXT,
    "receiptPath" TEXT,
    "receiptName" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expenses_reference_key" ON "expenses"("reference");
CREATE INDEX "expenses_spentAt_idx" ON "expenses"("spentAt" DESC);
CREATE INDEX "expenses_categoryId_spentAt_idx" ON "expenses"("categoryId", "spentAt");
CREATE INDEX "expenses_currency_spentAt_idx" ON "expenses"("currency", "spentAt");

-- An expense of nothing is a mistake, and a negative one is a refund, which
-- this application does not model.
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_check" CHECK ("amount" > 0);

-- AddForeignKey
-- RESTRICT, not CASCADE: deleting a category must not silently take a year of
-- spending with it. Deactivate it instead.
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
