'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { changePasswordSchema, type ChangePasswordRequest } from '@travel-crm/sdk';
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  describedBy,
  FormField,
  Input,
  toast,
} from '@travel-crm/ui';
import { useForm } from 'react-hook-form';

import { api } from '@/lib/api';
import { applyApiErrors } from '@/lib/form-errors';

const emptyForm: ChangePasswordRequest = { currentPassword: '', newPassword: '' };
const NEW_PASSWORD_HINT = 'At least 10 characters, with a letter and a number.';

export function PasswordForm() {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordRequest>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: emptyForm,
  });

  const change = useMutation({
    mutationFn: (values: ChangePasswordRequest) => api.users.changePassword(values),
    onSuccess: () => {
      reset(emptyForm);
      toast.success('Password changed');
    },
    onError: (error) => {
      const message = applyApiErrors(error, setError);
      if (message) toast.error(message);
    },
  });

  return (
    <Card>
      <form onSubmit={handleSubmit((values) => change.mutate(values))} noValidate>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pb-6 sm:grid-cols-2">
          <FormField
            id="currentPassword"
            label="Current password"
            error={errors.currentPassword?.message}
            required
          >
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.currentPassword)}
              aria-describedby={describedBy('currentPassword', {
                error: errors.currentPassword?.message,
              })}
              {...register('currentPassword')}
            />
          </FormField>
          <FormField
            id="newPassword"
            label="New password"
            hint={NEW_PASSWORD_HINT}
            error={errors.newPassword?.message}
            required
          >
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.newPassword)}
              aria-describedby={describedBy('newPassword', {
                hint: NEW_PASSWORD_HINT,
                error: errors.newPassword?.message,
              })}
              {...register('newPassword')}
            />
          </FormField>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={change.isPending}>
            Update password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
