'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CURRENCIES,
  invoiceSchema,
  invoiceTotals,
  TAX_PRESETS,
  type Invoice,
  type InvoiceInput,
  type InvoiceRequest,
  type Lead,
  type Proposal,
} from '@travel-crm/sdk';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  describedBy,
  toast,
} from '@travel-crm/ui';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { formatMoney } from '@/features/leads/lead-labels';
import { applyApiErrors } from '@/lib/form-errors';
import { formatTaxRate } from './invoice-labels';
import { useCreateInvoice, useUpdateInvoice } from './use-invoices';

const NO_TAX = '__none__';
const CUSTOM_TAX = '__custom__';

/** 1800 → "18", 750 → "7.5". What somebody types into the custom box. */
function bpsToPercent(bps: number): string {
  return String(bps / 100);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * A new invoice starts from the accepted proposal when there is one, so the
 * consultant is checking figures rather than retyping them.
 */
function fromLead(lead: Lead, proposal: Proposal | null): InvoiceInput {
  const version = proposal?.currentVersion;

  return {
    proposalId: proposal?.id ?? null,
    issueDate: today(),
    dueDate: inDays(14),
    packageTitle: version?.title ?? (lead.destination ? `${lead.destination} Holiday` : ''),
    destination: version?.destination ?? lead.destination ?? '',
    travelStart: version?.travelStart ?? lead.travelStart ?? '',
    travelEnd: version?.travelEnd ?? lead.travelEnd ?? '',
    description: version?.executiveSummary ?? '',
    currency: (version?.currency ?? lead.currency ?? 'INR') as InvoiceInput['currency'],
    packageAmount: version ? String(version.sellingPrice) : '',
    discountAmount: '0',
    taxRateBps: null,
    billingName: lead.customer.name,
    billingAddress: [lead.customer.city, lead.customer.country].filter(Boolean).join(', '),
    billingEmail: lead.customer.email ?? '',
    billingPhone: lead.customer.phone ?? '',
    billingTaxId: '',
    paymentTerms: '',
    notes: '',
  };
}

function fromInvoice(invoice: Invoice): InvoiceInput {
  return {
    proposalId: invoice.proposalId,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    packageTitle: invoice.packageTitle,
    destination: invoice.destination ?? '',
    travelStart: invoice.travelStart ?? '',
    travelEnd: invoice.travelEnd ?? '',
    description: invoice.description ?? '',
    currency: invoice.currency as InvoiceInput['currency'],
    packageAmount: String(invoice.totals.packageAmount),
    discountAmount: String(invoice.totals.discountAmount),
    taxRateBps: invoice.totals.taxRateBps,
    billingName: invoice.billingName,
    billingAddress: invoice.billingAddress ?? '',
    billingEmail: invoice.billingEmail ?? '',
    billingPhone: invoice.billingPhone ?? '',
    billingTaxId: invoice.billingTaxId ?? '',
    paymentTerms: invoice.paymentTerms ?? '',
    notes: invoice.notes ?? '',
  };
}

interface InvoiceFormProps {
  lead: Lead;
  /** The accepted proposal to bill from, when there is one. */
  proposal: Proposal | null;
  /** Null when raising a new invoice. */
  invoice: Invoice | null;
  onDone: () => void;
}

export function InvoiceForm({ lead, proposal, invoice, onDone }: InvoiceFormProps) {
  const create = useCreateInvoice(lead.id);
  const update = useUpdateInvoice(lead.id, invoice?.id ?? '');
  const [formError, setFormError] = useState('');

  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceInput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: invoice ? fromInvoice(invoice) : fromLead(lead, proposal),
  });

  const [packageAmount, discountAmount, taxRateBps, currency] = watch([
    'packageAmount',
    'discountAmount',
    'taxRateBps',
    'currency',
  ]);

  // The same function the server runs, so what is shown while typing is
  // exactly what will be billed.
  const totals = invoiceTotals({
    packageAmount: Number(packageAmount ?? 0) || 0,
    discountAmount: Number(discountAmount ?? 0) || 0,
    taxRateBps: taxRateBps === null || taxRateBps === undefined ? null : Number(taxRateBps),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    const payload: InvoiceRequest = invoiceSchema.parse(values);

    try {
      if (invoice) {
        await update.mutateAsync(payload);
        toast.success('Invoice saved');
      } else {
        const created = await create.mutateAsync(payload);
        toast.success(`Invoice ${created.reference} raised`);
      }
      onDone();
    } catch (error) {
      const message = applyApiErrors<InvoiceInput>(error, setError);
      setFormError(message);
      if (message) toast.error(message);
    }
  });

  const errorFor = (name: keyof InvoiceInput): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  const field = (name: keyof InvoiceInput) => ({
    id: name,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': describedBy(name, { error: errorFor(name) }),
  });

  const symbol = String(currency ?? 'INR');

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Invoice</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField id="issueDate" label="Issue date" required error={errorFor('issueDate')}>
            <Input {...field('issueDate')} {...register('issueDate')} type="date" />
          </FormField>
          <FormField id="dueDate" label="Due date" required error={errorFor('dueDate')}>
            <Input {...field('dueDate')} {...register('dueDate')} type="date" />
          </FormField>

          <FormField
            id="packageTitle"
            label="Package"
            required
            className="sm:col-span-2"
            error={errorFor('packageTitle')}
          >
            <Input {...field('packageTitle')} {...register('packageTitle')} />
          </FormField>

          <FormField id="destination" label="Destination" error={errorFor('destination')}>
            <Input {...field('destination')} {...register('destination')} />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField id="travelStart" label="Travel start" error={errorFor('travelStart')}>
              <Input {...field('travelStart')} {...register('travelStart')} type="date" />
            </FormField>
            <FormField id="travelEnd" label="Travel end" error={errorFor('travelEnd')}>
              <Input {...field('travelEnd')} {...register('travelEnd')} type="date" />
            </FormField>
          </div>

          <FormField
            id="description"
            label="Description"
            className="sm:col-span-2"
            hint="What the customer is paying for, in a sentence or two."
            error={errorFor('description')}
          >
            <Textarea {...field('description')} {...register('description')} rows={3} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Amounts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-[1fr_7rem] gap-4">
            <FormField
              id="packageAmount"
              label="Package amount"
              required
              error={errorFor('packageAmount')}
            >
              <Input
                {...field('packageAmount')}
                {...register('packageAmount')}
                type="number"
                min={0}
              />
            </FormField>
            <FormField id="currency" label="Currency" error={errorFor('currency')}>
              <Controller
                control={control}
                name="currency"
                render={({ field: control_ }) => (
                  <Select
                    value={typeof control_.value === 'string' ? control_.value : 'INR'}
                    onValueChange={control_.onChange}
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

          <FormField id="discountAmount" label="Discount" error={errorFor('discountAmount')}>
            <Input
              {...field('discountAmount')}
              {...register('discountAmount')}
              type="number"
              min={0}
            />
          </FormField>

          <FormField
            id="taxRateBps"
            label="GST"
            hint="Defaults to the invoice template. Change it per invoice — the rate depends on what is being sold."
            error={errorFor('taxRateBps')}
          >
            <Controller
              control={control}
              name="taxRateBps"
              render={({ field: control_ }) => {
                const value =
                  control_.value === null || control_.value === undefined
                    ? null
                    : Number(control_.value);

                // A rate that is not one of the presets is a custom one, and
                // the box stays open showing it.
                const isPreset =
                  value === null || TAX_PRESETS.some((preset) => preset.bps === value);

                return (
                  <div className="flex flex-col gap-2">
                    <Select
                      value={value === null ? NO_TAX : isPreset ? String(value) : CUSTOM_TAX}
                      onValueChange={(next) => {
                        if (next === NO_TAX) control_.onChange(null);
                        else if (next === CUSTOM_TAX) control_.onChange(value ?? 0);
                        else control_.onChange(Number(next));
                      }}
                    >
                      <SelectTrigger id="taxRateBps">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TAX_PRESETS.map((preset) => (
                          <SelectItem
                            key={preset.label}
                            value={preset.bps === null ? NO_TAX : String(preset.bps)}
                          >
                            {preset.label}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_TAX}>Another rate…</SelectItem>
                      </SelectContent>
                    </Select>

                    {value !== null && !isPreset ? (
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label="GST percentage"
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          className="w-28"
                          value={bpsToPercent(value)}
                          onChange={(event) => {
                            const percent = Number(event.target.value);
                            control_.onChange(
                              Number.isFinite(percent) ? Math.round(percent * 100) : 0,
                            );
                          }}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    ) : null}
                  </div>
                );
              }}
            />
          </FormField>

          {/* The arithmetic, as the customer will see it. */}
          <div className="rounded-lg border border-border bg-muted p-4 sm:col-span-2">
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Package amount" value={formatMoney(totals.packageAmount, symbol)} />
              {totals.discountAmount > 0 ? (
                <>
                  <Row label="Discount" value={`− ${formatMoney(totals.discountAmount, symbol)}`} />
                  <Row label="Net amount" value={formatMoney(totals.netAmount, symbol)} />
                </>
              ) : null}
              {totals.taxRateBps ? (
                <Row
                  label={`Tax (${formatTaxRate(totals.taxRateBps)})`}
                  value={formatMoney(totals.taxAmount, symbol)}
                />
              ) : null}
              <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2">
                <dt className="text-sm font-semibold text-foreground">Total</dt>
                <dd className="text-base font-semibold tabular-nums text-foreground">
                  {formatMoney(totals.totalAmount, symbol)}
                </dd>
              </div>
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bill to</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField id="billingName" label="Name" required error={errorFor('billingName')}>
            <Input {...field('billingName')} {...register('billingName')} />
          </FormField>
          <FormField id="billingTaxId" label="Tax ID" error={errorFor('billingTaxId')}>
            <Input {...field('billingTaxId')} {...register('billingTaxId')} placeholder="GSTIN" />
          </FormField>
          <FormField id="billingEmail" label="Email" error={errorFor('billingEmail')}>
            <Input {...field('billingEmail')} {...register('billingEmail')} type="email" />
          </FormField>
          <FormField id="billingPhone" label="Phone" error={errorFor('billingPhone')}>
            <Input {...field('billingPhone')} {...register('billingPhone')} />
          </FormField>
          <FormField
            id="billingAddress"
            label="Address"
            className="sm:col-span-2"
            error={errorFor('billingAddress')}
          >
            <Textarea {...field('billingAddress')} {...register('billingAddress')} rows={3} />
          </FormField>
          <FormField
            id="paymentTerms"
            label="Payment terms"
            className="sm:col-span-2"
            error={errorFor('paymentTerms')}
          >
            <Textarea {...field('paymentTerms')} {...register('paymentTerms')} rows={2} />
          </FormField>
          <FormField id="notes" label="Notes" className="sm:col-span-2" error={errorFor('notes')}>
            <Textarea {...field('notes')} {...register('notes')} rows={2} />
          </FormField>
        </CardContent>
      </Card>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {invoice ? 'Save changes' : 'Raise invoice'}
        </Button>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
