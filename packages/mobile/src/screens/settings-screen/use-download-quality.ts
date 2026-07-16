import { useCallback, useEffect, useState } from 'react';
import type { DownloadQualityProfile } from '@ton/core';
import { getSetting, setSetting } from '../../services/db-queries/settings';

export function useDownloadQuality() {
  const [downloadQualityProfile, setDownloadQualityProfileState] =
    useState<DownloadQualityProfile>('normal');

  const refreshDownloadQuality = useCallback(async () => {
    const value = await getSetting('download_quality_profile');
    setDownloadQualityProfileState(value === 'best_compatible' ? 'best_compatible' : 'normal');
  }, []);

  useEffect(() => {
    void refreshDownloadQuality();
  }, [refreshDownloadQuality]);

  const setDownloadQualityProfile = (profile: DownloadQualityProfile) => {
    setDownloadQualityProfileState(profile);
    void setSetting('download_quality_profile', profile);
  };

  return { downloadQualityProfile, refreshDownloadQuality, setDownloadQualityProfile };
}
