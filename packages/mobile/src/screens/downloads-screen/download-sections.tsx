import { FlashList } from '@shopify/flash-list';
import { SectionLabel } from '../../components/section-label';
import { DownloadRow } from './download-row';

type DownloadSectionsProps = {
  entries: Array<
    | { id: string; type: 'section'; label: string }
    | { id: string; type: 'item'; itemId: number }
  >;
  header: React.ReactNode;
};

export function DownloadSections({ entries, header }: DownloadSectionsProps) {
  return (
    <FlashList
      data={entries}
      ListHeaderComponent={<>{header}</>}
      contentContainerStyle={{ paddingBottom: 16 }}
      keyExtractor={(item) => item.id}
      estimatedItemSize={64}
      getItemType={(item) => item.type}
      renderItem={({ item }) => (
        item.type === 'section'
          ? <SectionLabel label={item.label} />
          : <DownloadRow itemId={item.itemId} />
      )}
    />
  );
}
