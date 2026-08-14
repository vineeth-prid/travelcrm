'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createUserSchema,
  resetPasswordSchema,
  ROLES,
  updateUserSchema,
  type CreateUserInput,
  type ResetPasswordRequest,
  type UpdateUserInput,
  type User,
} from '@travel-crm/sdk';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  FormField,
  Input,
  Label,
  LoadingState,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  describedBy,
  toast,
} from '@travel-crm/ui';
import { KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { useSession } from '@/features/auth/session-context';
import { api } from '@/lib/api';
import { applyApiErrors } from '@/lib/form-errors';
import { queryKeys } from '@/lib/query-keys';

/** Staff administration (§32). Rendered only for administrators. */
export function UsersPanel() {
  const me = useSession();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);

  const users = useQuery({
    queryKey: queryKeys.users,
    queryFn: ({ signal }) => api.admin.users(signal),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.users });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users &amp; roles</CardTitle>
        <CardDescription>
          Accounts are deactivated rather than deleted — a colleague who leaves still owns the leads
          they worked.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {users.isPending ? (
          <LoadingState label="Loading accounts…" />
        ) : users.isError ? (
          <p className="text-sm text-muted-foreground">The accounts could not be loaded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Margin access</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <span className="font-medium text-foreground">{user.name}</span>
                    <span className="block text-xs text-muted-foreground">{user.email}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'ADMIN' ? 'primary' : 'neutral'}>
                      {user.role === 'ADMIN' ? 'Administrator' : 'Employee'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.role === 'ADMIN' ? (
                      <span className="text-xs text-muted-foreground">Always</span>
                    ) : user.canViewOwnProfitability ? (
                      <Badge variant="secondary">Own proposals</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="neutral">Deactivated</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(user)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setResetting(user)}>
                        <KeyRound aria-hidden />
                        Password
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Add a colleague
          </Button>
        </div>
      </CardContent>

      <CreateDialog open={creating} onClose={() => setCreating(false)} onSaved={invalidate} />
      <EditDialog
        user={editing}
        isSelf={editing?.id === me.id}
        onClose={() => setEditing(null)}
        onSaved={invalidate}
      />
      <ResetDialog user={resetting} onClose={() => setResetting(null)} />
    </Card>
  );
}

function CreateDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', password: '', role: 'EMPLOYEE' },
  });

  const create = useMutation({ mutationFn: api.admin.createUser });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync(createUserSchema.parse(values));
      toast.success('Account created');
      reset();
      onSaved();
      onClose();
    } catch (error) {
      const message = applyApiErrors<CreateUserInput>(error, setError);
      if (message) toast.error(message);
    }
  });

  const errorFor = (name: keyof CreateUserInput): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Add a colleague"
      description="They can sign in as soon as this is saved."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isSubmitting} onClick={() => void onSubmit()}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField id="name" label="Name" required error={errorFor('name')}>
          <Input
            id="name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy('name', { error: errorFor('name') })}
            {...register('name')}
          />
        </FormField>

        <FormField id="email" label="Email" required error={errorFor('email')}>
          <Input id="email" type="email" autoComplete="off" {...register('email')} />
        </FormField>

        <FormField
          id="password"
          label="Temporary password"
          required
          hint="At least 10 characters, with a letter and a number. Ask them to change it."
          error={errorFor('password')}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
          />
        </FormField>

        <FormField id="role" label="Role" required error={errorFor('role')}>
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <Select
                value={typeof field.value === 'string' ? field.value : 'EMPLOYEE'}
                onValueChange={field.onChange}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role === 'ADMIN' ? 'Administrator' : 'Employee'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>
      </div>
    </Modal>
  );
}

function EditDialog({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: User | null;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    values: user
      ? {
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          canViewOwnProfitability: user.canViewOwnProfitability,
        }
      : undefined,
  });

  const update = useMutation({
    mutationFn: (input: UpdateUserInput) => {
      if (!user) throw new Error('no account is being edited');
      return api.admin.updateUser(user.id, updateUserSchema.parse(input));
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
      toast.success('Account updated');
      onSaved();
      onClose();
    } catch (error) {
      const message = applyApiErrors<UpdateUserInput>(error, setError);
      if (message) toast.error(message);
    }
  });

  const errorFor = (name: keyof UpdateUserInput): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  return (
    <Modal
      open={user !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={user ? `Edit ${user.name}` : 'Edit'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isSubmitting} onClick={() => void onSubmit()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField id="edit-name" label="Name" required error={errorFor('name')}>
          <Input id="edit-name" {...register('name')} />
        </FormField>

        <FormField id="edit-email" label="Email" required error={errorFor('email')}>
          <Input id="edit-email" type="email" {...register('email')} />
        </FormField>

        <FormField
          id="edit-role"
          label="Role"
          required
          hint={isSelf ? 'You cannot remove your own administrator access.' : undefined}
          error={errorFor('role')}
        >
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <Select
                value={typeof field.value === 'string' ? field.value : 'EMPLOYEE'}
                onValueChange={field.onChange}
                disabled={isSelf}
              >
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role === 'ADMIN' ? 'Administrator' : 'Employee'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="canViewOwnProfitability"
            render={({ field }) => (
              <Checkbox
                id="margin"
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Label htmlFor="margin">May see cost and margin on their own proposals</Label>
        </div>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <Checkbox
                id="active"
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
                disabled={isSelf}
              />
            )}
          />
          <Label htmlFor="active">Active — can sign in</Label>
        </div>
      </div>
    </Modal>
  );
}

function ResetDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const reset = useMutation({
    mutationFn: (input: ResetPasswordRequest) => {
      if (!user) throw new Error('no account is being edited');
      return api.admin.resetPassword(user.id, input);
    },
  });

  const submit = async () => {
    const parsed = resetPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'That password is not strong enough');
      return;
    }

    try {
      await reset.mutateAsync(parsed.data);
      toast.success('Password set. Tell them what it is — it is not shown again.');
      setPassword('');
      setError('');
      onClose();
    } catch {
      toast.error('The password could not be set.');
    }
  };

  return (
    <Modal
      open={user !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={user ? `Set a password for ${user.name}` : 'Set a password'}
      description="They are not told automatically — pass it on yourself."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={reset.isPending} onClick={() => void submit()}>
            Set password
          </Button>
        </>
      }
    >
      <FormField id="new-password" label="New password" required error={error}>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError('');
          }}
        />
      </FormField>
    </Modal>
  );
}
