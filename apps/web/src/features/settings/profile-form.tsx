'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { updateProfileSchema, type UpdateProfileRequest } from '@travel-crm/sdk';
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
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { useSession } from '@/features/auth/session-context';
import { api } from '@/lib/api';
import { applyApiErrors } from '@/lib/form-errors';

export function ProfileForm() {
  const user = useSession();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileRequest>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: user.name, email: user.email },
  });

  const save = useMutation({
    mutationFn: (values: UpdateProfileRequest) => api.users.updateProfile(values),
    onSuccess: (updated) => {
      reset({ name: updated.name, email: updated.email });
      // The layout renders the user server-side, so refresh the tree.
      router.refresh();
      toast.success('Profile updated');
    },
    onError: (error) => {
      const message = applyApiErrors(error, setError);
      if (message) toast.error(message);
    },
  });

  return (
    <Card>
      <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pb-6 sm:grid-cols-2">
          <FormField id="name" label="Name" error={errors.name?.message} required>
            <Input
              id="name"
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={describedBy('name', { error: errors.name?.message })}
              {...register('name')}
            />
          </FormField>
          <FormField id="profile-email" label="Email" error={errors.email?.message} required>
            <Input
              id="profile-email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={describedBy('profile-email', { error: errors.email?.message })}
              {...register('email')}
            />
          </FormField>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={save.isPending} disabled={!isDirty}>
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
