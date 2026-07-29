'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { loginSchema, type LoginRequest } from '@travel-crm/sdk';
import { Button, describedBy, FormField, Input } from '@travel-crm/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { api } from '@/lib/api';
import { applyApiErrors } from '@/lib/form-errors';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const login = useMutation({
    mutationFn: (values: LoginRequest) => api.auth.login(values),
    onSuccess: () => {
      // The session cookie is set by the API; a refresh re-runs the middleware.
      router.replace(searchParams.get('next') ?? '/dashboard');
      router.refresh();
    },
    onError: (error) => setFormError(applyApiErrors(error, setError)),
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) => {
        setFormError('');
        login.mutate(values);
      })}
    >
      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger-foreground"
        >
          {formError}
        </p>
      ) : null}

      <FormField id="email" label="Email" error={errors.email?.message} required>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="you@company.com"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy('email', { error: errors.email?.message })}
          {...register('email')}
        />
      </FormField>

      <FormField id="password" label="Password" error={errors.password?.message} required>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy('password', { error: errors.password?.message })}
          {...register('password')}
        />
      </FormField>

      <Button type="submit" loading={login.isPending} className="mt-2 w-full">
        Sign in
      </Button>
    </form>
  );
}
