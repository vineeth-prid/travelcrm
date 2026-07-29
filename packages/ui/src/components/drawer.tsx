'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import * as React from 'react';

import { cn } from '../lib/cn';
import { DialogCloseButton, OverlayScrim } from './modal';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  side?: 'left' | 'right';
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  side = 'right',
  children,
  footer,
  className,
}: DrawerProps) {
  const offscreen = side === 'right' ? '100%' : '-100%';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <OverlayScrim />
            <Dialog.Content asChild forceMount>
              <motion.aside
                initial={{ x: offscreen }}
                animate={{ x: 0 }}
                exit={{ x: offscreen }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className={cn(
                  'fixed inset-y-0 z-50 flex w-full max-w-md flex-col border-border bg-surface shadow-lg focus:outline-none',
                  side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
                  className,
                )}
              >
                <header className="flex flex-col gap-1 border-b border-border p-6">
                  <Dialog.Title className="text-base font-semibold tracking-tight">
                    {title}
                  </Dialog.Title>
                  <Dialog.Description
                    className={cn('text-sm text-muted-foreground', !description && 'sr-only')}
                  >
                    {description ?? title}
                  </Dialog.Description>
                  <DialogCloseButton />
                </header>
                <div className="flex-1 overflow-y-auto p-6">{children}</div>
                {footer ? (
                  <footer className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
                    {footer}
                  </footer>
                ) : null}
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
