import type { TransformFnParams } from 'class-transformer';

/** Treat a blank optional form/query value as omitted before validation. */
export const emptyStringAsUndefined = ({ value }: TransformFnParams) =>
  value === '' ? undefined : value;
