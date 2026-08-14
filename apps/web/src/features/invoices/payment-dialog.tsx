'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  PAYMENT_METHODS,
  paymentSchema,
  type Invoice,
  type PaymentInput,
  type PaymentRequest,
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

import { formatMoney } from '@/features/leads/lead-labels';
import { applyApiErrors } from '@/lib/form-errors';
import { PAYMENT_METHOD_LABELS } from './invoice-labels';
import { useRecordPayment } from './use-invoices';

interface PaymentDialogProps {
  invoice: Invoice;
  open: boolean;
  onClose: () => void;
}

export function PaymentDialog({ invoice, open, onClose }: PaymentDialogProps) {
  const record = useRecordPayment(invoice.leadId, invoice.id);

  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      paidAt: new Date().toISOString().slice(0, 10),
      // Prefilled with what is owed: most payments settle the balance, and the
      // figure is right there rather than being worked out by hand.
      amount: String(invoice.outstanding),
      externalReference: '',
      notes: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const payload: PaymentRequest = paymentSchema.parse(values);

    try {
      const updated = await record.mutateAsync(payload);
      toast.success(
        updated.outstanding === 0
          ? 'Payment recorded — invoice settled in full'
          : `Payment recorded — ${formatMoney(updated.outstanding, updated.currency)} outstanding`,
      );
      reset();
      onClose();
    } catch (error) {
      const message = applyApiErrors<PaymentInput>(error, setError);
      if (message) toast.error(message);
    }
  });

  const errorFor = (name: keyof PaymentInput): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Record a payment"
      description={`${invoice.reference} · ${formatMoney(invoice.outstanding, invoice.currency)} outstanding`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isSubmitting} onClick={() => void onSubmit()}>
            Record
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="amount" label="Amount" required error={errorFor('amount')}>
            <Input
              id="amount"
              type="number"
              min={1}
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={describedBy('amount', { error: errorFor('amount') })}
              {...register('amount')}
            />
          </FormField>

          <FormField id="paidAt" label="Received on" required error={errorFor('paidAt')}>
            <Input id="paidAt" type="date" {...register('paidAt')} />
          </FormField>
        </div>

        <FormField id="method" label="Method" required error={errorFor('method')}>
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
          id="externalReference"
          label="Reference"
          hint="Bank reference, UPI transaction id, cheque number."
          error={errorFor('externalReference')}
        >
          <Input id="externalReference" {...register('externalReference')} />
        </FormField>

        <FormField id="notes" label="Notes" error={errorFor('notes')}>
          <Textarea id="notes" rows={2} {...register('notes')} />
        </FormField>
      </div>
    </Modal>
  );
}
