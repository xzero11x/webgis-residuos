import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type DefaultValues, type FieldValues } from 'react-hook-form';
import { z } from 'zod';

/** Shared RHF + Zod adapter. No business forms are created in this phase. */
export function useZodForm<Input extends FieldValues, Output extends FieldValues>(
  schema: z.ZodType<Output, Input>,
  defaultValues?: DefaultValues<Input>,
) {
  return useForm<Input, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onBlur',
  });
}
