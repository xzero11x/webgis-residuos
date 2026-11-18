import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full rounded-md bg-background px-3 py-1.5 text-[13px] shadow-[var(--shadow-control)] outline-none transition-shadow placeholder:text-muted-foreground focus-visible:shadow-[0_0_0_1px_var(--ring),0_0_0_4px_rgb(0_112_243/18%)] disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
