'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SMTP_SECURITY,
  smtpSchema,
  type SmtpInput,
  type SmtpRequest,
  type SmtpStatus,
} from '@travel-crm/sdk';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  describedBy,
  toast,
} from '@travel-crm/ui';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { useSession } from '@/features/auth/session-context';
import { api } from '@/lib/api';
import { applyApiErrors } from '@/lib/form-errors';
import { queryKeys } from '@/lib/query-keys';

const SECURITY_LABELS: Record<(typeof SMTP_SECURITY)[number], string> = {
  NONE: 'None (not recommended)',
  STARTTLS: 'STARTTLS — usually port 587',
  SSL: 'SSL/TLS — usually port 465',
};

/**
 * Mail configuration.
 *
 * The password field is always blank on load, because the API genuinely does
 * not return it. Leaving it blank on save keeps the stored one — which is what
 * lets somebody change the port without knowing the secret.
 */
export function SmtpForm() {
  const user = useSession();
  const queryClient = useQueryClient();
  const [testTo, setTestTo] = useState(user.email);

  const status = useQuery({
    queryKey: queryKeys.smtp,
    queryFn: ({ signal }) => api.smtp.status(signal),
  });

  const save = useMutation({
    mutationFn: (input: SmtpRequest) => api.smtp.save(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.smtp }),
  });

  const sendTest = useMutation({
    mutationFn: (to: string) => api.smtp.sendTest({ to }),
  });

  if (status.isPending) {
    return (
      <Card>
        <CardContent className="p-6">
          <LoadingState label="Loading mail settings…" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Loaded
      status={status.data ?? null}
      onSave={(input) => save.mutateAsync(input)}
      saving={save.isPending}
      testTo={testTo}
      onTestToChange={setTestTo}
      onTest={() => {
        sendTest
          .mutateAsync(testTo)
          .then((result) => toast.success(result.message))
          .catch((error: unknown) =>
            toast.error(
              error instanceof Error ? error.message : 'The test email could not be sent.',
            ),
          );
      }}
      testing={sendTest.isPending}
    />
  );
}

interface LoadedProps {
  status: SmtpStatus | null;
  onSave: (input: SmtpRequest) => Promise<SmtpStatus>;
  saving: boolean;
  testTo: string;
  onTestToChange: (value: string) => void;
  onTest: () => void;
  testing: boolean;
}

function Loaded({ status, onSave, testTo, onTestToChange, onTest, testing }: LoadedProps) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SmtpInput>({
    resolver: zodResolver(smtpSchema),
    defaultValues: {
      host: status?.host ?? '',
      // A string because the field is a text input; the schema coerces it back.
      port: (status?.port ?? 587) as unknown as SmtpInput['port'],
      username: status?.username ?? '',
      password: '',
      security: status?.security ?? 'STARTTLS',
      fromEmail: status?.fromEmail ?? '',
      fromName: status?.fromName ?? '',
      active: status?.active ?? true,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await onSave(smtpSchema.parse(values));
      toast.success('Mail settings saved');
    } catch (error) {
      const message = applyApiErrors<SmtpInput>(error, setError);
      if (message) toast.error(message);
    }
  });

  const errorFor = (name: keyof SmtpInput): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email (SMTP)</CardTitle>
        <CardDescription>
          Used for follow-up reminders and assignment notices. Customers are never emailed
          automatically.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {status?.configured ? (
            <Badge variant="success">Configured</Badge>
          ) : (
            <Badge variant="warning">Not configured</Badge>
          )}
          {status?.configured && !status.active ? <Badge variant="neutral">Paused</Badge> : null}
          {status?.configured && !status.passwordReadable ? (
            <Badge variant="danger">Password unreadable — re-enter it</Badge>
          ) : null}
        </div>

        <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <FormField id="host" label="Host" required error={errorFor('host')}>
              <Input
                id="host"
                aria-invalid={Boolean(errors.host)}
                aria-describedby={describedBy('host', { error: errorFor('host') })}
                {...register('host')}
                placeholder="smtp.gmail.com"
              />
            </FormField>
            <FormField id="port" label="Port" required error={errorFor('port')}>
              <Input id="port" type="number" min={1} max={65535} {...register('port')} />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="username" label="Username" required error={errorFor('username')}>
              <Input id="username" autoComplete="off" {...register('username')} />
            </FormField>

            <FormField
              id="password"
              label="Password"
              hint={
                status?.configured
                  ? 'Leave blank to keep the stored password.'
                  : 'Stored encrypted; never shown again.'
              }
              error={errorFor('password')}
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...register('password')}
              />
            </FormField>
          </div>

          <FormField id="security" label="Encryption" required error={errorFor('security')}>
            <Controller
              control={control}
              name="security"
              render={({ field }) => (
                <Select
                  value={typeof field.value === 'string' ? field.value : 'STARTTLS'}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="security">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SMTP_SECURITY.map((item) => (
                      <SelectItem key={item} value={item}>
                        {SECURITY_LABELS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="fromEmail" label="From address" required error={errorFor('fromEmail')}>
              <Input id="fromEmail" type="email" {...register('fromEmail')} />
            </FormField>
            <FormField id="fromName" label="From name" required error={errorFor('fromName')}>
              <Input id="fromName" {...register('fromName')} />
            </FormField>
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={isSubmitting}>
              Save settings
            </Button>
          </div>
        </form>

        <div className="border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium text-foreground">Send a test</p>
          <div className="flex flex-wrap items-end gap-3">
            <FormField id="testTo" label="To" className="min-w-56 flex-1">
              <Input
                id="testTo"
                type="email"
                value={testTo}
                onChange={(event) => onTestToChange(event.target.value)}
              />
            </FormField>
            <Button
              variant="secondary"
              loading={testing}
              disabled={!status?.configured}
              onClick={onTest}
            >
              <Send aria-hidden />
              Send test email
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
