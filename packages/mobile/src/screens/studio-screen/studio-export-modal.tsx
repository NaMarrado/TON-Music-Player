import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { projectDurationSec, type StudioProject } from '@ton/core';
import { showToast } from '../../stores/toast-store';
import { cancelExport, exportMix, resetProject, useStudioStore } from '../../stores/studio-store';
import { STUDIO_COLORS } from './studio-ui';

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function suggestName(project: StudioProject, fallback: string): string {
  const names = project.tracks.map((track) => project.assets[track.clips[0]?.assetId ?? '']?.title).filter((name): name is string => Boolean(name));
  if (names.length > 1) return `${names[0]} × ${names[1]}`;
  return names.length === 1 ? `${names[0]} (Studio)` : fallback;
}

function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessible={false} onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 24 }}>
        <Pressable accessible={false} style={{ backgroundColor: STUDIO_COLORS.surface, borderRadius: 16, padding: 20, gap: 14 }}>{children}</Pressable>
      </Pressable>
    </Modal>
  );
}

function Action({ label, onPress, primary = false, disabled = false }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ paddingHorizontal: 16, height: 40, borderRadius: 10, justifyContent: 'center', backgroundColor: primary ? STUDIO_COLORS.text : STUDIO_COLORS.raised, opacity: disabled ? 0.4 : 1 }}
    >
      <Text style={{ color: primary ? STUDIO_COLORS.background : STUDIO_COLORS.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function ExportForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('studio');
  const project = useStudioStore((state) => state.project);
  const exporting = useStudioStore((state) => state.exporting);
  const [title, setTitle] = useState(() => suggestName(useStudioStore.getState().project, t('defaultName')));

  const save = async () => {
    const trackId = await exportMix(title.trim() || t('defaultName'), 'Studio');
    if (trackId !== null) {
      showToast(t('saved'), 'success');
      onClose();
    }
  };

  return (
    <>
      <Text style={{ color: STUDIO_COLORS.text, fontSize: 16, fontWeight: '600' }}>{t('exportTitle')}</Text>
      <Text style={{ color: STUDIO_COLORS.dim, fontSize: 13, lineHeight: 19 }}>{t('exportText')}</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        editable={exporting === null}
        maxLength={120}
        accessibilityLabel={t('mixName')}
        placeholder={t('mixName')}
        placeholderTextColor={STUDIO_COLORS.dim}
        style={{ height: 44, paddingHorizontal: 14, borderRadius: 10, backgroundColor: STUDIO_COLORS.raised, color: STUDIO_COLORS.text, fontSize: 15 }}
      />
      <Text style={{ color: STUDIO_COLORS.dim, fontSize: 13, fontVariant: ['tabular-nums'] }}>{clock(projectDurationSec(project))}</Text>
      {exporting && (
        <View accessibilityRole="progressbar" accessibilityLabel={t('exporting')} accessibilityValue={{ min: 0, max: 100, now: Math.round(exporting.progress * 100) }} style={{ height: 4, borderRadius: 2, backgroundColor: STUDIO_COLORS.raised, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(exporting.progress * 100)}%`, height: '100%', backgroundColor: STUDIO_COLORS.text }} />
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <Action label={t('cancel')} onPress={exporting ? () => { void cancelExport(); } : onClose} />
        <Action label={t('save')} primary disabled={exporting !== null || title.trim() === ''} onPress={() => { void save(); }} />
      </View>
    </>
  );
}

export function ExportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const busy = useStudioStore((state) => state.exporting !== null);
  return (
    <Sheet visible={visible} onClose={busy ? () => undefined : onClose}>
      {visible && <ExportForm onClose={onClose} />}
    </Sheet>
  );
}

export function ClearModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation('studio');
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={{ color: STUDIO_COLORS.text, fontSize: 16, fontWeight: '600' }}>{t('clearTitle')}</Text>
      <Text style={{ color: STUDIO_COLORS.dim, fontSize: 13, lineHeight: 19 }}>{t('clearText')}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <Action label={t('cancel')} onPress={onClose} />
        <Action label={t('clear')} primary onPress={() => { void resetProject(); onClose(); }} />
      </View>
    </Sheet>
  );
}
