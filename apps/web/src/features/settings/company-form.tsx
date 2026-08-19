'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { companyProfileSchema, type CompanyProfileInput } from '@travel-crm/sdk';
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

import { useSession } from '@/features/auth/session-context';
import { api } from '@/lib/api';
import { applyApiErrors } from '@/lib/form-errors';
import { queryKeys } from '@/lib/query-keys';

/**
 * The agency's own details, as they appear on every proposal and invoice.
 *
 * These were environment variables until now, which made changing the office
 * phone number a redeploy. Employees can see them — they are on the documents
 * being sent — but only an administrator can change them.
 */
export function CompanyForm() {
  const user = useSession();
  const queryClient = useQueryClient();
  const readOnly = user.role !== 'ADMIN';

  const profile = useQuery({
    queryKey: queryKeys.company,
    queryFn: ({ signal }) => api.documents.company(signal),
    staleTime: 10 * 60_000,
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CompanyProfileInput>({
    resolver: zodResolver(companyProfileSchema),
    values: profile.data
      ? {
          name: profile.data.name,
          tagline: profile.data.tagline ?? '',
          address: profile.data.address ?? '',
          phone: profile.data.phone ?? '',
          email: profile.data.email ?? '',
          website: profile.data.website ?? '',
          taxId: profile.data.taxId ?? '',
          bankDetails: profile.data.bankDetails ?? '',
        }
      : undefined,
  });

  const save = useMutation({ mutationFn: api.documents.saveCompany });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await save.mutateAsync(companyProfileSchema.parse(values));
      toast.success('Company details saved');
      void queryClient.invalidateQueries({ queryKey: queryKeys.company });
    } catch (error) {
      const message = applyApiErrors<CompanyProfileInput>(error, setError);
      if (message) toast.error(message);
    }
  });

  const errorFor = (name: keyof CompanyProfileInput): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company details</CardTitle>
        <CardDescription>
          Printed at the top of every proposal and invoice, and used for the bank details a customer
          pays into.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {profile.isPending ? (
          <LoadingState label="Loading company details…" />
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit();
            }}
          >
            <fieldset disabled={readOnly} className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="company-name" label="Name" required error={errorFor('name')}>
                  <Input id="company-name" {...register('name')} />
                </FormField>
                <FormField id="company-tagline" label="Tagline" error={errorFor('tagline')}>
                  <Input id="company-tagline" {...register('tagline')} />
                </FormField>
              </div>

              <FormField
                id="company-address"
                label="Address"
                hint="Printed as typed, line for line."
                error={errorFor('address')}
              >
                <Textarea id="company-address" rows={3} {...register('address')} />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-3">
                <FormField id="company-phone" label="Phone" error={errorFor('phone')}>
                  <Input id="company-phone" {...register('phone')} />
                </FormField>
                <FormField id="company-email" label="Email" error={errorFor('email')}>
                  <Input id="company-email" type="email" {...register('email')} />
                </FormField>
                <FormField id="company-website" label="Website" error={errorFor('website')}>
                  <Input id="company-website" {...register('website')} />
                </FormField>
              </div>

              <FormField
                id="company-taxId"
                label="Tax registration"
                hint="GSTIN or equivalent. Printed on invoices when set."
                error={errorFor('taxId')}
              >
                <Input id="company-taxId" {...register('taxId')} />
              </FormField>

              <FormField
                id="company-bank"
                label="Bank details"
                hint="Account name, number, IFSC, UPI — whatever a customer needs to pay."
                error={errorFor('bankDetails')}
              >
                <Textarea id="company-bank" rows={4} {...register('bankDetails')} />
              </FormField>

              {readOnly ? null : (
                <div className="flex justify-end">
                  <Button type="submit" loading={isSubmitting}>
                    Save details
                  </Button>
                </div>
              )}
            </fieldset>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
