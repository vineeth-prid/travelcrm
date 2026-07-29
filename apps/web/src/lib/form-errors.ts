import { ApiError } from '@travel-crm/sdk';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/**
 * Pushes field-level API errors onto the matching form fields and returns the
 * message that should be shown at form level (if any).
 */
export function applyApiErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): string {
  if (!(error instanceof ApiError)) {
    return 'Something went wrong. Please try again.';
  }

  let matchedAField = false;

  for (const [field, messages] of Object.entries(error.details ?? {})) {
    const message = messages[0];
    if (!message || field === '_') continue;
    matchedAField = true;
    setError(field as Path<T>, { type: 'server', message });
  }

  return matchedAField ? '' : error.message;
}
