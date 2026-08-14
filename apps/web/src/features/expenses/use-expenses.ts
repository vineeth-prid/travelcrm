'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  Expense,
  ExpenseCategory,
  ExpenseCategoryRequest,
  ExpenseQuery,
  ExpenseRequest,
  ExpenseSummary,
  ExpenseSummaryQuery,
} from '@travel-crm/sdk';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useExpenses(query: ExpenseQuery): UseQueryResult<Expense[]> {
  return useQuery({
    queryKey: queryKeys.expenses(query),
    queryFn: ({ signal }) => api.expenses.list(query, signal),
    placeholderData: (previous) => previous,
  });
}

export function useExpenseSummary(query: ExpenseSummaryQuery): UseQueryResult<ExpenseSummary> {
  return useQuery({
    queryKey: queryKeys.expenseSummary(query),
    queryFn: ({ signal }) => api.expenses.summary(query, signal),
    placeholderData: (previous) => previous,
  });
}

export function useExpenseCategories(): UseQueryResult<ExpenseCategory[]> {
  return useQuery({
    queryKey: queryKeys.expenseCategories,
    queryFn: ({ signal }) => api.expenses.categories(signal),
    staleTime: 5 * 60_000,
  });
}

/** Any change to spending changes the dashboard, so both are refreshed. */
function useExpenseMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
): UseMutationResult<TResult, Error, TVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.expensesAll }),
  });
}

export function useCreateExpense(): UseMutationResult<Expense, Error, ExpenseRequest> {
  return useExpenseMutation((input: ExpenseRequest) => api.expenses.create(input));
}

export function useUpdateExpense(id: string): UseMutationResult<Expense, Error, ExpenseRequest> {
  return useExpenseMutation((input: ExpenseRequest) => api.expenses.update(id, input));
}

export function useDeleteExpense(): UseMutationResult<{ message: string }, Error, string> {
  return useExpenseMutation((id: string) => api.expenses.remove(id));
}

export function useSaveCategory(): UseMutationResult<
  ExpenseCategory,
  Error,
  { id: string | null; input: ExpenseCategoryRequest }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }) =>
      id ? api.expenses.updateCategory(id, input) : api.expenses.createCategory(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.expensesAll }),
  });
}

/**
 * Uploading a receipt bypasses the SDK: it posts multipart form data, which
 * the typed JSON client deliberately does not do.
 */
export function useUploadReceipt(): UseMutationResult<void, Error, { id: string; file: File }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, file }) => {
      const body = new FormData();
      body.append('file', file);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? ''}/expenses/${id}/receipt`,
        { method: 'POST', credentials: 'include', body },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'The receipt could not be uploaded.');
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.expensesAll }),
  });
}
