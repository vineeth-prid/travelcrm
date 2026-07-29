'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';

/** Shared animated scrim used by both Modal and Drawer. */
export function OverlayScrim() {
  return (
    <Dialog.Overlay asChild forceMount>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 bg-slate-950/40"
      />
    </Dialog.Overlay>
  );
}

export function DialogCloseButton() {
  return (
    <Dialog.Close
      className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Close"
    >
      <X className="size-4" aria-hidden />
    </Dialog.Close>
  );
}

const modalSizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: keyof typeof modalSizes;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  children,
  footer,
  className,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <OverlayScrim />
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
              <Dialog.Content asChild forceMount>
                <motion.div
                  initial={{ opacity: 0, scale: 0.97, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 8 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                  className={cn(
                    'pointer-events-auto relative w-full rounded-xl border border-border bg-surface shadow-lg focus:outline-none',
                    modalSizes[size],
                    className,
                  )}
                >
                  <div className="flex flex-col gap-1 p-6 pb-4">
                    <Dialog.Title className="text-base font-semibold tracking-tight">
                      {title}
                    </Dialog.Title>
                    {/* Always rendered: Radix requires a description for aria-describedby. */}
                    <Dialog.Description
                      className={cn('text-sm text-muted-foreground', !description && 'sr-only')}
                    >
                      {description ?? title}
                    </Dialog.Description>
                  </div>
                  <DialogCloseButton />
                  {children ? <div className="px-6 pb-6">{children}</div> : null}
                  {footer ? (
                    <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
                      {footer}
                    </div>
                  ) : null}
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
