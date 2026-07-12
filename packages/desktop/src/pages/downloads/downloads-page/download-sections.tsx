import type { DownloadItem } from '@ton/core';
import { useMemo } from 'react';
import { VirtualizedList } from '../../../components/player/virtualized-list';
import { DownloadItemRow } from '../download-item';

export function DownloadsEmptyState({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-col items-center" style={{ paddingTop: '80px' }}>
      <div
        className="flex items-center justify-center"
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'var(--glow-strong)',
          marginBottom: '16px',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: '24px', height: '24px', color: 'var(--text-secondary)' }}
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </div>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
        {t('noDownloads')}
      </span>
      <span
        style={{
          color: 'var(--text-secondary)',
          fontSize: '0.78rem',
          marginTop: '6px',
          maxWidth: '260px',
          textAlign: 'center',
          lineHeight: '1.5',
        }}
      >
        {t('noDownloadsHint')}
      </span>
    </div>
  );
}

type DownloadSectionDefinition = {
  items: DownloadItem[];
  key: string;
  label: string;
};

type DownloadListRow =
  | {
      count: number;
      key: string;
      label: string;
      topSpacing: number;
      type: 'header';
    }
  | {
      item: DownloadItem;
      key: string;
      type: 'item';
    };

export function DownloadsSections({
  sections,
  t,
}: {
  sections: DownloadSectionDefinition[];
  t: (key: string) => string;
}) {
  const rows = useMemo<DownloadListRow[]>(
    () =>
      sections.flatMap((section, sectionIndex) => [
        {
          count: section.items.length,
          key: `${section.key}-header`,
          label: section.label,
          topSpacing: sectionIndex === 0 ? 0 : 18,
          type: 'header' as const,
        },
        ...section.items.map((item) => ({
          item,
          key: `item-${item.id}`,
          type: 'item' as const,
        })),
      ]),
    [sections],
  );

  return (
    <VirtualizedList
      items={rows}
      estimateSize={64}
      overscan={12}
      keyExtractor={(row) => row.key}
      contentStyle={{ padding: '8px 32px 120px' }}
      renderItem={(row) =>
        row.type === 'header' ? (
          <div
            className="flex items-center gap-2"
            style={{
              padding: `${row.topSpacing}px 12px 10px`,
              fontSize: '0.72rem',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            <span>{row.label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.6 }}>{row.count}</span>
          </div>
        ) : (
          <DownloadItemRow item={row.item} t={t} />
        )
      }
    />
  );
}
