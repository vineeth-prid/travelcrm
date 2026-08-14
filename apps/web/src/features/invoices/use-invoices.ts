'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  Invoice,
  InvoiceQuery,
  InvoiceRequest,
  InvoiceWithPdf,
  PaymentRequest,
} from '@travel-crm/sdk';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useInvoices(query: InvoiceQuery): UseQueryResult<Invoice[]> {
  return useQuery({
    queryKey: queryKeys.invoices(query),
    queryFn: ({ signal }) => api.invoices.list(query, signal),
    placeholderData: (previous) => previous,
  });
}

/** Anything that touches an invoice also touches its lead's timeline. */
function useInvoiceMutation<TVariables, TResult>(
  leadId: string | null,
  invoiceId: string | null,
  mutationFn: (variables: TVariables) => Promise<TResult>,
): UseMutationResult<TResult, Error, TVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.invoicesAll });
      void queryClient.invalidateQueries({ queryKey: queryKeys.leadsAll });
      if (invoiceId) void queryClient.invalidateQueries({ queryKey: queryKeys.invoice(invoiceId) });
      if (leadId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.lead(leadId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.leadActivities(leadId) });
      }
    },
  });
}

export function useCreateInvoice(
  leadId: string,
): UseMutationResult<Invoice, Error, InvoiceRequest> {
  return useInvoiceMutation(leadId, null, (input: InvoiceRequest) =>
    api.invoices.create(leadId, input),
  );
}

export function useUpdateInvoice(
  leadId: string,
  id: string,
): UseMutationResult<Invoice, Error, InvoiceRequest> {
  return useInvoiceMutation(leadId, id, (input: InvoiceRequest) => api.invoices.update(id, input));
}

export function useGenerateInvoicePdf(
  leadId: string,
  id: string,
): UseMutationResult<InvoiceWithPdf, Error, void> {
  return useInvoiceMutation(leadId, id, () => api.invoices.generatePdf(id));
}

export function useIssueInvoice(
  leadId: string,
  id: string,
): UseMutationResult<Invoice, Error, void> {
  return useInvoiceMutation(leadId, id, () => api.invoices.issue(id));
}

export function useCancelInvoice(
  leadId: string,
  id: string,
): UseMutationResult<Invoice, Error, void> {
  return useInvoiceMutation(leadId, id, () => api.invoices.cancel(id));
}

export function useRecordPayment(
  leadId: string,
  id: string,
): UseMutationResult<Invoice, Error, PaymentRequest> {
  return useInvoiceMutation(leadId, id, (input: PaymentRequest) =>
    api.invoices.recordPayment(id, input),
  );
}
