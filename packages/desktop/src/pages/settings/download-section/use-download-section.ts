import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSetting } from '../use-setting';
import { BINARY_ORDER, isRequiredBinary, type DesktopBinaryStatus } from './types';

export function useDownloadSection() {
  const directory = useSetting('download_directory');
  const [downloadDir, setDownloadDir] = useState('');
  const [binaryStatuses, setBinaryStatuses] = useState<DesktopBinaryStatus[]>([]);
  const [isLoadingBinaryStatuses, setIsLoadingBinaryStatuses] = useState(false);
  const [isRepairingBinaries, setIsRepairingBinaries] = useState(false);
  const [binaryStatusMessage, setBinaryStatusMessage] = useState<string | null>(null);

  const refreshBinaryStatuses = useCallback(async () => {
    setIsLoadingBinaryStatuses(true);
    try {
      const nextStatuses = await window.api.invoke('binaries:get-status') as DesktopBinaryStatus[];
      setBinaryStatuses(nextStatuses);
    } finally {
      setIsLoadingBinaryStatuses(false);
    }
  }, []);

  useEffect(() => {
    if (!directory.loaded) {
      return;
    }

    if (directory.value) {
      setDownloadDir(directory.value);
      return;
    }

    void window.api.invoke('app:get-paths').then((paths) => {
      const appPaths = paths as { music: string };
      setDownloadDir(`${appPaths.music}/TON`);
    });
  }, [directory.loaded, directory.value]);

  useEffect(() => {
    void refreshBinaryStatuses();
  }, [refreshBinaryStatuses]);

  useEffect(() => {
    const handleBinaryStatus = (message: unknown) => {
      if (typeof message === 'string' && message.trim()) {
        setBinaryStatusMessage(message);
      }
    };

    window.api.on('binaries:status', handleBinaryStatus);
    return () => {
      window.api.off('binaries:status', handleBinaryStatus);
    };
  }, []);

  const sortedBinaryStatuses = useMemo(() => {
    const byId = new Map(binaryStatuses.map((item) => [item.id, item]));
    return BINARY_ORDER.map((id) => byId.get(id) ?? {
      id,
      executableName: null,
      path: null,
      status: 'missing' as const,
    });
  }, [binaryStatuses]);

  const hasMissingDependency = sortedBinaryStatuses.some((item) =>
    item.status === 'missing' && isRequiredBinary(item.id),
  );

  const repairBinaries = useCallback(async () => {
    setIsRepairingBinaries(true);
    setBinaryStatusMessage(null);
    try {
      const nextStatuses = await window.api.invoke('binaries:repair') as DesktopBinaryStatus[];
      setBinaryStatuses(nextStatuses);
    } finally {
      setIsRepairingBinaries(false);
      await refreshBinaryStatuses();
    }
  }, [refreshBinaryStatuses]);

  return {
    binaryStatusMessage,
    downloadDir,
    hasMissingDependency,
    isLoadingBinaryStatuses,
    isRepairingBinaries,
    repairBinaries,
    sortedBinaryStatuses,
  };
}
