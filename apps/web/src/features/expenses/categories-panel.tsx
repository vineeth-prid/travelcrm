'use client';

import { expenseCategorySchema, type ExpenseCategory } from '@travel-crm/sdk';
import { Badge, Button, Card, Input, Modal, toast } from '@travel-crm/ui';
import { Plus, Tags } from 'lucide-react';
import { useState } from 'react';

import { useSaveCategory } from './use-expenses';

/**
 * Expense categories.
 *
 * Categories are renamed and retired rather than deleted — every expense ever
 * filed against one still has to say what it was for, and the category is the
 * only thing that says it.
 */
export function CategoriesPanel({ categories }: { categories: ExpenseCategory[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const save = useSaveCategory();

  const start = (category: ExpenseCategory | null) => {
    setEditing(category);
    setName(category?.name ?? '');
    setError('');
    setOpen(true);
  };

  const submit = async (patch: { active?: boolean } = {}) => {
    const parsed = expenseCategorySchema.safeParse({
      name,
      active: patch.active ?? editing?.active ?? true,
      sortOrder: editing?.sortOrder,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'That name will not do');
      return;
    }

    try {
      await save.mutateAsync({ id: editing?.id ?? null, input: parsed.data });
      toast.success(editing ? 'Category updated' : 'Category added');
      setOpen(false);
    } catch {
      toast.error('That category could not be saved.');
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">Categories</h2>
          <p className="text-sm text-muted-foreground">
            What the expense breakdown on the dashboard is grouped by.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => start(null)}>
          <Plus aria-hidden />
          Add
        </Button>
      </div>

      {categories.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Tags aria-hidden className="size-4" />
          No categories yet.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <li key={category.id}>
              <button
                type="button"
                onClick={() => start(category)}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Badge variant={category.active ? 'secondary' : 'neutral'}>
                  {category.name}
                  {category.active ? '' : ' · off'}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        size="sm"
        title={editing ? `Edit ${editing.name}` : 'Add a category'}
        description={
          editing
            ? 'Renaming it renames it everywhere; expenses already filed keep their category.'
            : undefined
        }
        footer={
          <>
            {editing ? (
              <Button
                variant="ghost"
                onClick={() => void submit({ active: !editing.active })}
                loading={save.isPending}
              >
                {editing.active ? 'Retire' : 'Reactivate'}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => void submit()}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="category-name" className="text-sm font-medium text-foreground">
            Name
          </label>
          <Input
            id="category-name"
            value={name}
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              setName(event.target.value);
              setError('');
            }}
          />
          {error ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Modal>
    </Card>
  );
}
