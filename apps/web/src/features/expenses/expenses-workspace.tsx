'use client';

import { CURRENCIES, type Expense, type ExpenseQuery } from '@travel-crm/sdk';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  PageContainer,
  SearchBox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@travel-crm/ui';
import { Paperclip, Plus, Trash2, Wallet } from 'lucide-react';
import { useRef, useState } from 'react';

import { PAYMENT_METHOD_LABELS } from '@/features/invoices/invoice-labels';
import { formatDay, formatMoney } from '@/features/leads/lead-labels';
import { api } from '@/lib/api';
import { CategoriesPanel } from './categories-panel';
import { ExpenseDialog } from './expense-dialog';
import { ExpenseSummaryPanel } from './expense-summary';
import {
  useDeleteExpense,
  useExpenseCategories,
  useExpenses,
  useExpenseSummary,
  useUploadReceipt,
} from './use-expenses';

const ANY = '__any__';

/**
 * The first of the current month.
 *
 * A dashboard that opens on the last twelve months answers "how are we doing
 * overall", which is not the question anybody asks first thing. It rolls by
 * itself: the value is computed on each render, so on the 1st it moves.
 */
function defaultFrom(): string {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

export function ExpensesWorkspace() {
  const [filters, setFilters] = useState<ExpenseQuery>({ from: defaultFrom() });
  const [editing, setEditing] = useState<Expense | null>(null);
  const [creating, setCreating] = useState(false);

  const expenses = useExpenses(filters);
  const categories = useExpenseCategories();
  const summary = useExpenseSummary({
    from: filters.from,
    to: filters.to,
    currency: filters.currency,
  });

  const patch = (next: Partial<ExpenseQuery>) => setFilters((current) => ({ ...current, ...next }));

  return (
    <PageContainer
      width="full"
      title="Expenses"
      description="What the company spends, and on what. Internal only — never customer-facing."
      actions={
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          Record expense
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <Input
              type="date"
              className="w-40"
              aria-label="From"
              value={filters.from ?? ''}
              onChange={(event) => patch({ from: event.target.value || undefined })}
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              className="w-40"
              aria-label="To"
              value={filters.to ?? ''}
              onChange={(event) => patch({ to: event.target.value || undefined })}
            />
          </div>

          <Select
            value={filters.categoryId ?? ANY}
            onValueChange={(next) => patch({ categoryId: next === ANY ? undefined : next })}
          >
            <SelectTrigger className="w-48" aria-label="Category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All categories</SelectItem>
              {(categories.data ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.currency ?? ANY}
            onValueChange={(next) =>
              patch({ currency: next === ANY ? undefined : (next as ExpenseQuery['currency']) })
            }
          >
            <SelectTrigger className="w-32" aria-label="Currency">
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Main currency</SelectItem>
              {CURRENCIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <SearchBox
            className="sm:ml-auto sm:max-w-xs"
            placeholder="Description, vendor or reference…"
            aria-label="Search expenses"
            value={filters.search ?? ''}
            onChange={(event) => patch({ search: event.target.value })}
          />
        </div>

        {summary.data ? <ExpenseSummaryPanel summary={summary.data} /> : null}

        <CategoriesPanel categories={categories.data ?? []} />

        <Card>
          {expenses.isPending ? (
            <LoadingState label="Loading expenses…" />
          ) : expenses.isError ? (
            <EmptyState icon={<Wallet aria-hidden />} title="Could not load expenses" />
          ) : expenses.data.length === 0 ? (
            <EmptyState
              icon={<Wallet aria-hidden />}
              title="Nothing recorded"
              description="Record what the company spends to see where the money goes."
              action={<Button onClick={() => setCreating(true)}>Record expense</Button>}
            />
          ) : (
            <ExpenseTable expenses={expenses.data} onEdit={setEditing} />
          )}
        </Card>
      </div>

      <ExpenseDialog
        expense={editing}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </PageContainer>
  );
}

function ExpenseTable({
  expenses,
  onEdit,
}: {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
}) {
  const remove = useDeleteExpense();
  const upload = useUploadReceipt();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const openReceipt = async (expense: Expense) => {
    try {
      const { url } = await api.expenses.receiptUrl(expense.id);
      window.open(url, '_blank', 'noopener');
    } catch {
      toast.error('The receipt could not be opened.');
    }
  };

  const chooseFile = (expenseId: string) => {
    setUploadingFor(expenseId);
    fileInput.current?.click();
  };

  const onFileChosen = async (file: File | undefined) => {
    if (!file || !uploadingFor) return;
    try {
      await upload.mutateAsync({ id: uploadingFor, file });
      toast.success('Receipt attached');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The upload failed.');
    } finally {
      setUploadingFor(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <>
      {/* One hidden input for the whole table rather than one per row. */}
      <input
        ref={fileInput}
        type="file"
        className="sr-only"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(event) => void onFileChosen(event.target.files?.[0])}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="w-32">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((expense) => (
            <TableRow key={expense.id}>
              <TableCell className="whitespace-nowrap text-sm">
                {formatDay(expense.spentAt)}
              </TableCell>
              <TableCell>
                <button
                  type="button"
                  onClick={() => onEdit(expense)}
                  className="text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {expense.description}
                </button>
                <span className="block text-xs text-muted-foreground">
                  {expense.reference}
                  {expense.vendor ? ` · ${expense.vendor}` : ''}
                  {expense.externalReference ? ` · ${expense.externalReference}` : ''}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{expense.category.name}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {PAYMENT_METHOD_LABELS[expense.method]}
                {expense.paidBy ? ` · ${expense.paidBy.name}` : ''}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatMoney(expense.amount, expense.currency)}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    title={expense.hasReceipt ? 'View receipt' : 'Attach a receipt'}
                    onClick={() =>
                      expense.hasReceipt ? void openReceipt(expense) : chooseFile(expense.id)
                    }
                  >
                    <Paperclip aria-hidden />
                    {expense.hasReceipt ? 'Receipt' : 'Attach'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${expense.reference}`}
                    onClick={() => {
                      void remove
                        .mutateAsync(expense.id)
                        .then(() => toast.success('Expense deleted'))
                        .catch(() => toast.error('That could not be deleted.'));
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
