import { useEffect, useState } from 'react';
import type { DownloadQualityProfile } from '@ton/core';
import { getSetting, setSetting } from '../../services/db-queries/settings';

export function useDownloadQuality() {
  const [downloadQualityProfile, setDownloadQualityProfileState] =
    useState<DownloadQualityProfile>('normal');

  useEffect(() => {
    void getSetting('download_quality_profile').then((value) => {
      setDownloadQualityProfileState(value === 'best_compatible' ? 'best_compatible' : 'normal');
    });
  }, []);

  const setDownloadQualityProfile = (profile: DownloadQualityProfile) => {
    setDownloadQualityProfileState(profile);
    void setSetting('download_quality_profile', profile);
  };

  return { downloadQualityProfile, setDownloadQualityProfile };
}
