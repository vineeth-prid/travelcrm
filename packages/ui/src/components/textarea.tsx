'use client';

import * as React from 'react';

import { cn } from '../lib/cn';
import { inputClassName } from './input';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(inputClassName, 'h-auto min-h-20 py-2 leading-relaxed', className)}
      {...props}
    />
  );
});
