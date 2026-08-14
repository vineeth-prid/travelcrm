'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CURRENCIES,
  expenseSchema,
  PAYMENT_METHODS,
  type Expense,
  type ExpenseInput,
  type ExpenseRequest,
} from '@travel-crm/sdk';
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  describedBy,
  toast,
} from '@travel-crm/ui';
import { Controller, useForm } from 'react-hook-form';

import { PAYMENT_METHOD_LABELS } from '@/features/invoices/invoice-labels';
import { useStaff } from '@/features/leads/use-leads';
import { applyApiErrors } from '@/lib/form-errors';
import { useCreateExpense, useExpenseCategories, useUpdateExpense } from './use-expenses';

const COMPANY = '__company__';

interface ExpenseDialogProps {
  /** Null when recording a new expense. */
  expense: Expense | null;
  open: boolean;
  onClose: () => void;
}

export function ExpenseDialog({ expense, open, onClose }: ExpenseDialogProps) {
  const categories = useExpenseCategories();
  const staff = useStaff();
  const create = useCreateExpense();
  const update = useUpdateExpense(expense?.id ?? '');

  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: expense
      ? {
          spentAt: expense.spentAt,
          categoryId: expense.category.id,
          description: expense.description,
          amount: String(expense.amount),
          currency: expense.currency as ExpenseInput['currency'],
          paidById: expense.paidBy?.id ?? null,
          method: expense.method,
          vendor: expense.vendor ?? '',
          externalReference: expense.externalReference ?? '',
          notes: expense.notes ?? '',
        }
      : {
          spentAt: new Date().toISOString().slice(0, 10),
          description: '',
          amount: '',
          currency: 'INR',
          paidById: null,
          vendor: '',
          externalReference: '',
          notes: '',
        },
  });

  const onSubmit = handleSubmit(async (values) => {
    const payload: ExpenseRequest = expenseSchema.parse(values);

    try {
      if (expense) {
        await update.mutateAsync(payload);
        toast.success('Expense updated');
      } else {
        const created = await create.mutateAsync(payload);
        toast.success(`Expense ${created.reference} recorded`);
      }
      reset();
      onClose();
    } catch (error) {
      const message = applyApiErrors<ExpenseInput>(error, setError);
      if (message) toast.error(message);
    }
  });

  const errorFor = (name: keyof ExpenseInput): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={expense ? `Edit ${expense.reference}` : 'Record an expense'}
      description="Internal only. Expenses never appear on anything a customer sees."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isSubmitting} onClick={() => void onSubmit()}>
            {expense ? 'Save' : 'Record'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="spentAt" label="Date" required error={errorFor('spentAt')}>
            <Input id="spentAt" type="date" {...register('spentAt')} />
          </FormField>

          <FormField id="categoryId" label="Category" required error={errorFor('categoryId')}>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select
                  value={typeof field.value === 'string' ? field.value : ''}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="categoryId">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories.data ?? [])
                      .filter((category) => category.active)
                      .map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        </div>

        <FormField
          id="description"
          label="What was it for?"
          required
          error={errorFor('description')}
        >
          <Input
            id="description"
            aria-invalid={Boolean(errors.description)}
            aria-describedby={describedBy('description', { error: errorFor('description') })}
            {...register('description')}
            placeholder="Instagram ad campaign — December"
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <FormField id="amount" label="Amount" required error={errorFor('amount')}>
            <Input id="amount" type="number" min={1} {...register('amount')} />
          </FormField>
          <FormField id="currency" label="Currency" error={errorFor('currency')}>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select
                  value={typeof field.value === 'string' ? field.value : 'INR'}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="method" label="Paid by" required error={errorFor('method')}>
            <Controller
              control={control}
              name="method"
              render={({ field }) => (
                <Select
                  value={typeof field.value === 'string' ? field.value : ''}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="method">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          <FormField
            id="paidById"
            label="Who paid"
            hint="Leave as the company where it came from a business account."
            error={errorFor('paidById')}
          >
            <Controller
              control={control}
              name="paidById"
              render={({ field }) => (
                <Select
                  value={typeof field.value === 'string' ? field.value : COMPANY}
                  onValueChange={(next) => field.onChange(next === COMPANY ? null : next)}
                >
                  <SelectTrigger id="paidById">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={COMPANY}>The company</SelectItem>
                    {(staff.data ?? []).map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          <FormField id="vendor" label="Vendor" error={errorFor('vendor')}>
            <Input id="vendor" {...register('vendor')} placeholder="Who was paid" />
          </FormField>

          <FormField
            id="externalReference"
            label="Reference"
            hint="Bill number, UPI reference, cheque number."
            error={errorFor('externalReference')}
          >
            <Input id="externalReference" {...register('externalReference')} />
          </FormField>
        </div>

        <FormField id="notes" label="Notes" error={errorFor('notes')}>
          <Textarea id="notes" rows={2} {...register('notes')} />
        </FormField>
      </div>
    </Modal>
  );
}
