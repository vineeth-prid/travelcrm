'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CURRENCIES,
  quoteSchema,
  type Quote,
  type QuoteInput,
  type QuoteRequest,
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
  toast,
} from '@travel-crm/ui';
import { Plus, Trash2 } from 'lucide-react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';

import { applyApiErrors } from '@/lib/form-errors';
import { formatMoney } from './money';
import { useCreateQuote, useUpdateQuote } from './use-quotes';

const EMPTY_ITEM = { title: '', description: '', quantity: '1', unitPrice: '' };

function defaultValidUntil(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

function toFormValues(quote: Quote | null): QuoteInput {
  if (!quote) {
    return {
      title: '',
      currency: 'INR',
      validUntil: defaultValidUntil(),
      notes: '',
      items: [{ ...EMPTY_ITEM }],
    };
  }

  return {
    title: quote.title,
    currency: quote.currency as QuoteInput['currency'],
    validUntil: quote.validUntil,
    notes: quote.notes ?? '',
    items: quote.items.map((item) => ({
      title: item.title,
      description: item.description ?? '',
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
    })),
  };
}

interface QuoteEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  /** The quote being edited, or copied when it has already been sent. */
  quote: Quote | null;
  /** True when `quote` is a sent version being used as the basis for a new one. */
  asNewVersion: boolean;
}

export function QuoteEditor({
  open,
  onOpenChange,
  conversationId,
  quote,
  asNewVersion,
}: QuoteEditorProps) {
  const create = useCreateQuote(conversationId);
  const update = useUpdateQuote(conversationId, quote?.id ?? '');
  const editingDraft = quote !== null && !asNewVersion;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<QuoteInput>({
    resolver: zodResolver(quoteSchema),
    defaultValues: toFormValues(quote),
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = useWatch({ control, name: 'items' });
  const currency = useWatch({ control, name: 'currency' }) ?? 'INR';

  const lineTotal = (index: number): number => {
    const item = watchedItems?.[index];
    const quantity = Number(item?.quantity ?? 0);
    const unitPrice = Number(item?.unitPrice ?? 0);
    return Number.isFinite(quantity * unitPrice) ? quantity * unitPrice : 0;
  };

  const total = (watchedItems ?? []).reduce((sum, _item, index) => sum + lineTotal(index), 0);

  function onSubmit(values: QuoteInput) {
    // The resolver has validated already; parse applies the normalisation.
    const payload: QuoteRequest = quoteSchema.parse(values);
    const mutation = editingDraft ? update : create;

    mutation.mutate(payload, {
      onSuccess: () => {
        toast.success(editingDraft ? 'Quote saved' : 'New quote version created');
        onOpenChange(false);
      },
      onError: (error) => {
        const message = applyApiErrors(error, setError);
        if (message) toast.error(message);
      },
    });
  }

  const saving = create.isPending || update.isPending;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={
        editingDraft ? `Edit quote v${quote.version}` : asNewVersion ? 'New version' : 'New quote'
      }
      description={
        asNewVersion
          ? 'Sent quotes cannot be changed. This creates the next version from a copy.'
          : undefined
      }
    >
      <form
        id="quote-form"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <FormField id="quote-title" label="Title" error={errors.title?.message} required>
            <Input
              id="quote-title"
              placeholder="Bali Holiday Package"
              aria-invalid={Boolean(errors.title)}
              {...register('title')}
            />
          </FormField>

          <FormField id="quote-currency" label="Currency" error={errors.currency?.message} required>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="quote-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        </div>

        <FormField
          id="quote-valid-until"
          label="Valid until"
          error={errors.validUntil?.message}
          required
          className="max-w-52"
        >
          <Input
            id="quote-valid-until"
            type="date"
            aria-invalid={Boolean(errors.validUntil)}
            {...register('validUntil')}
          />
        </FormField>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Items</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => append({ ...EMPTY_ITEM })}
            >
              <Plus aria-hidden />
              Add item
            </Button>
          </div>

          {errors.items?.message ? (
            <p role="alert" className="mb-2 text-xs font-medium text-danger">
              {errors.items.message}
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Item
                  </th>
                  <th className="w-20 px-2 py-2 text-right text-xs font-medium text-muted-foreground">
                    Qty
                  </th>
                  <th className="w-28 px-2 py-2 text-right text-xs font-medium text-muted-foreground">
                    Unit price
                  </th>
                  <th className="w-28 px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                    Total
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => (
                  <tr key={field.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`Item ${index + 1} title`}
                        placeholder="5-star hotel, 4 nights"
                        aria-invalid={Boolean(errors.items?.[index]?.title)}
                        {...register(`items.${index}.title`)}
                      />
                      <Input
                        aria-label={`Item ${index + 1} description`}
                        placeholder="Description (optional)"
                        className="mt-1.5 text-xs"
                        {...register(`items.${index}.description`)}
                      />
                      {errors.items?.[index]?.title ? (
                        <p role="alert" className="mt-1 text-xs font-medium text-danger">
                          {errors.items[index]?.title?.message}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={1}
                        className="text-right"
                        aria-label={`Item ${index + 1} quantity`}
                        aria-invalid={Boolean(errors.items?.[index]?.quantity)}
                        {...register(`items.${index}.quantity`)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min={0}
                        className="text-right"
                        aria-label={`Item ${index + 1} unit price`}
                        aria-invalid={Boolean(errors.items?.[index]?.unitPrice)}
                        {...register(`items.${index}.unitPrice`)}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(currency, lineTotal(index))}
                    </td>
                    <td className="px-1 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove item ${index + 1}`}
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/50">
                  <td
                    colSpan={3}
                    className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(currency, total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <FormField id="quote-notes" label="Notes" error={errors.notes?.message}>
          <Textarea
            id="quote-notes"
            rows={3}
            placeholder={'Price subject to availability.\nPassport validity required.'}
            {...register('notes')}
          />
        </FormField>

        <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editingDraft ? 'Save quote' : 'Create quote'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
