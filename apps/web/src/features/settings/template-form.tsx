'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  documentTemplateSchema,
  type DocumentTemplateInput,
  type TemplateKind,
} from '@travel-crm/sdk';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  LoadingState,
  Textarea,
  toast,
} from '@travel-crm/ui';
import { useForm } from 'react-hook-form';

import { api } from '@/lib/api';
import { applyApiErrors } from '@/lib/form-errors';
import { queryKeys } from '@/lib/query-keys';

const COPY: Record<
  TemplateKind,
  { title: string; description: string; validity: string; validityHint: string }
> = {
  PROPOSAL: {
    title: 'Proposal template',
    description:
      'What every new proposal starts with. The consultant can change any of it on the proposal itself — this is the starting point, not a rule.',
    validity: 'Quote valid for (days)',
    validityHint: 'Sets the "valid until" date on a new proposal.',
  },
  INVOICE: {
    title: 'Invoice template',
    description:
      'What every new invoice starts with. Payment terms and notes are copied in when the invoice is raised.',
    validity: 'Payment due in (days)',
    validityHint: 'Sets the due date on a new invoice.',
  },
};

/**
 * The boilerplate half of a document.
 *
 * Copied into each proposal or invoice when it is created, never read through
 * at render time: changing the terms today must not rewrite what a customer
 * accepted last month.
 */
export function TemplateForm({ kind }: { kind: TemplateKind }) {
  const queryClient = useQueryClient();
  const copy = COPY[kind];

  const template = useQuery({
    queryKey: queryKeys.template(kind),
    queryFn: ({ signal }) => api.documents.template(kind, signal),
    // Boilerplate somebody edits a few times a year.
    staleTime: 10 * 60_000,
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DocumentTemplateInput>({
    resolver: zodResolver(documentTemplateSchema),
    values: template.data
      ? {
          terms: template.data.terms ?? '',
          inclusions: template.data.inclusions ?? '',
          exclusions: template.data.exclusions ?? '',
          paymentTerms: template.data.paymentTerms ?? '',
          footerNote: template.data.footerNote ?? '',
          validityDays: template.data.validityDays,
          // Basis points on the wire, percent in the box: 1800 shows as 18.
          taxRateBps: template.data.taxRateBps === null ? '' : template.data.taxRateBps / 100,
        }
      : undefined,
  });

  const save = useMutation({
    mutationFn: (input: DocumentTemplateInput) =>
      api.documents.saveTemplate(kind, documentTemplateSchema.parse(input)),
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      toast.success(`${copy.title} saved`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.template(kind) });
    } catch (error) {
      const message = applyApiErrors<DocumentTemplateInput>(error, setError);
      if (message) toast.error(message);
    }
  });

  const errorFor = (name: keyof DocumentTemplateInput): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>

      <CardContent>
        {template.isPending ? (
          <LoadingState label="Loading the template…" />
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit();
            }}
          >
            {kind === 'PROPOSAL' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  id="template-inclusions"
                  label="Inclusions"
                  hint="One per line."
                  error={errorFor('inclusions')}
                >
                  <Textarea id="template-inclusions" rows={6} {...register('inclusions')} />
                </FormField>
                <FormField
                  id="template-exclusions"
                  label="Exclusions"
                  hint="One per line."
                  error={errorFor('exclusions')}
                >
                  <Textarea id="template-exclusions" rows={6} {...register('exclusions')} />
                </FormField>
              </div>
            ) : (
              <FormField
                id="template-payment-terms"
                label="Payment terms"
                hint='e.g. "50% on booking, balance 14 days before travel".'
                error={errorFor('paymentTerms')}
              >
                <Textarea id="template-payment-terms" rows={3} {...register('paymentTerms')} />
              </FormField>
            )}

            <FormField
              id="template-terms"
              label={kind === 'PROPOSAL' ? 'Terms & conditions' : 'Notes'}
              hint={
                kind === 'PROPOSAL'
                  ? 'Printed at the end of the proposal, and prefilled into every new one.'
                  : 'Prefilled into the notes on a new invoice.'
              }
              error={errorFor('terms')}
            >
              <Textarea id="template-terms" rows={10} {...register('terms')} />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="template-validity"
                label={copy.validity}
                required
                hint={copy.validityHint}
                error={errorFor('validityDays')}
              >
                <Input
                  id="template-validity"
                  type="number"
                  min={1}
                  max={365}
                  {...register('validityDays')}
                />
              </FormField>
              <FormField
                id="template-footer"
                label="Footer note"
                hint="One line under the totals."
                error={errorFor('footerNote')}
              >
                <Input id="template-footer" {...register('footerNote')} />
              </FormField>

              {kind === 'INVOICE' ? (
                <FormField
                  id="template-tax"
                  label="Default GST (%)"
                  hint="What a new invoice starts at. Blank means no tax, and every invoice can override it."
                  error={errorFor('taxRateBps')}
                >
                  <Input
                    id="template-tax"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    {...register('taxRateBps', {
                      setValueAs: (value: string) =>
                        value === '' ? null : Math.round(Number(value) * 100),
                    })}
                  />
                </FormField>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button type="submit" loading={isSubmitting}>
                Save template
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
