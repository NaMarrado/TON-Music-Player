import type { CloudStorageJurisdiction } from '@ton/core';

export type Translator = (key: string, opts?: Record<string, unknown>) => string;

export type CloudFormState = {
  accountId: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  jurisdiction: CloudStorageJurisdiction;
};

export const EMPTY_CLOUD_FORM: CloudFormState = {
  accountId: '',
  bucket: '',
  prefix: 'ton',
  accessKeyId: '',
  secretAccessKey: '',
  jurisdiction: 'default',
};
