import type { CloudStorageJurisdiction, CloudSyncProgress, CloudSyncResult } from '@ton/core';

export type CloudForm = {
  accountId: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  jurisdiction: CloudStorageJurisdiction;
};

export type CloudCardProps = {
  autoSyncDescription: string;
  autoSyncDetailsLabel: string;
  autoSyncEnabled: boolean;
  autoSyncLabel: string;
  autoSyncStatusLabel: string;
  canRun: boolean;
  connectedLabel: string | null;
  description: string;
  failedLabel: string | null;
  form: CloudForm;
  hasSecret: boolean;
  helpSteps: string[];
  helpTitle: string;
  isBusy: boolean;
  loaded: boolean;
  loadLabel: string;
  progress: CloudSyncProgress | null;
  progressLabel: string | null;
  result: CloudSyncResult | null;
  resultLabel: string | null;
  labels: Record<string, string>;
  onCancel: () => void;
  onFetch: () => void;
  onLoad: () => void;
  onSaveTest: () => void;
  onSync: () => void;
  onToggleAutoSync: (enabled: boolean) => void;
  onUpdate: (patch: Partial<CloudForm>) => void;
  onUpload: () => void;
  title: string;
};
