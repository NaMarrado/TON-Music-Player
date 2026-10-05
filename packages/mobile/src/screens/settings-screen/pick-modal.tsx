import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

export interface PickItem {
  id: number;
  label: string;
  detail?: string;
}

/** A tick list in a small pop-up: tick what you want, confirm. Used for playlists and songs, for export and import. */
export function PickModal({
  visible,
  title,
  items,
  searchPlaceholder,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  items: PickItem[];
  /** Shows a search box that narrows the list (songs). */
  searchPlaceholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: (ids: number[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setPicked(new Set());
  }, [visible]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? items.filter((item) => `${item.label} ${item.detail ?? ''}`.toLowerCase().includes(needle)) : items;
  }, [items, query]);

  const toggle = (id: number) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60 justify-center px-6" onPress={onClose}>
        <Pressable className="bg-bg-surface rounded-2xl p-5" style={{ maxHeight: '80%' }} onPress={() => {}}>
          <Text className="text-white text-lg font-bold mb-4">{title}</Text>
          {searchPlaceholder !== undefined && (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor="#6f6f6f"
              accessibilityLabel={searchPlaceholder}
              className="text-white border border-border rounded-xl px-3 mb-3"
              style={{ height: 42 }}
            />
          )}
          <FlatList
            data={shown}
            keyExtractor={(item) => String(item.id)}
            style={{ maxHeight: 360 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const on = picked.has(item.id);
              return (
                <Pressable
                  onPress={() => toggle(item.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={item.label}
                  className="flex-row items-center py-2.5"
                  style={{ gap: 12 }}
                >
                  <Feather name={on ? 'check-square' : 'square'} size={20} color={on ? '#ffffff' : '#6f6f6f'} />
                  <Text numberOfLines={1} className="text-white text-[14px] flex-1">{item.label}</Text>
                  {item.detail ? <Text numberOfLines={1} className="text-text-secondary text-[12px]" style={{ maxWidth: '40%' }}>{item.detail}</Text> : null}
                </Pressable>
              );
            }}
          />
          <View className="flex-row justify-end mt-4" style={{ gap: 10 }}>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={cancelLabel} className="border border-border rounded-full px-4 py-2.5">
              <Text className="text-text-primary text-[13px] font-semibold">{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(items.filter((item) => picked.has(item.id)).map((item) => item.id))}
              disabled={picked.size === 0}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              accessibilityState={{ disabled: picked.size === 0 }}
              className="bg-white rounded-full px-4 py-2.5"
              style={{ opacity: picked.size === 0 ? 0.4 : 1 }}
            >
              <Text className="text-black text-[13px] font-semibold">{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
