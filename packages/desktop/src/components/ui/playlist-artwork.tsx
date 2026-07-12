import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { CUSTOM_PROTOCOL } from '@ton/core';

type PlaylistArtworkProps = {
  coverPath: string | null | undefined;
  alt: string;
  className: string;
  fallback: ReactNode;
  loading?: 'eager' | 'lazy';
};

export function PlaylistArtwork({
  coverPath,
  alt,
  className,
  fallback,
  loading = 'lazy',
}: PlaylistArtworkProps) {
  const coverUrl = useMemo(
    () => (coverPath ? `${CUSTOM_PROTOCOL}://${encodeURIComponent(coverPath)}` : null),
    [coverPath],
  );
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [coverUrl]);

  if (!coverUrl || hasError) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={coverUrl}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        setHasError(true);
      }}
    />
  );
}
