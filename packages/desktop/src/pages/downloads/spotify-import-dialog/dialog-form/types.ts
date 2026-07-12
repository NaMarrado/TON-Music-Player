import type { RefObject } from 'react';

export type DialogFormProps = {
  error: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
  url: string;
  onClose: () => void;
  onImport: () => void;
  onSetUrl: (value: string) => void;
};
