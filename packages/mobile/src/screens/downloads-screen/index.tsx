import { Alert, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActionSheet } from '../../components/action-sheet';
import { EmptyState } from '../../components/empty-state';
import { ImportPlaylistModal } from '../../components/import-playlist-modal';
import {
  getDownloadRuntimePermissionNoticeKey,
  openDownloadRuntimeSettings,
} from '../../services/download-runtime';
import { useDownloadRuntimeStore } from '../../stores/download-runtime-store';
import { cancelAllDownloads } from '../../stores/download-store';
import { DownloadSections } from './download-sections';
import { DownloadsHeader } from './downloads-header';
import { useDownloadGroups } from './use-download-groups';

export function DownloadsScreen() {
  const { t } = useTranslation('downloads');
  const notificationPermission = useDownloadRuntimeStore((state) => state.notificationPermission);
  const permissionNoticeKey = getDownloadRuntimePermissionNoticeKey(notificationPermission);
  const {
    activeCount,
    clearActions,
    hasClearable,
    hasCancellable,
    itemCount,
    listEntries,
    showClearMenu,
    setShowClearMenu,
    showImportModal,
    setShowImportModal,
  } = useDownloadGroups();

  const handleCancelAllPress = () => {
    Alert.alert(
      t('cancelAllTitle'),
      t('cancelAllMessage'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('cancelAllDownloads'),
          style: 'destructive',
          onPress: () => { void cancelAllDownloads(); },
        },
      ],
    );
  };

  const header = (
    <DownloadsHeader
      title={t('title')}
      importLabel={t('importPlaylist')}
      cancelAllLabel={t('cancelAllDownloads')}
      activeCount={activeCount}
      hasClearable={hasClearable}
      hasCancellable={hasCancellable}
      noticeLabel={permissionNoticeKey ? t(permissionNoticeKey) : null}
      noticeActionLabel={permissionNoticeKey ? t('openSettings') : null}
      onImportPress={() => setShowImportModal(true)}
      onCancelAllPress={handleCancelAllPress}
      onClearPress={() => setShowClearMenu(true)}
      onNoticeAction={() => { void openDownloadRuntimeSettings(); }}
    />
  );

  if (itemCount === 0) {
    return (
      <View className="flex-1 bg-bg-deep">
        {header}
        <EmptyState
          message={t('emptyDownloads')}
          icon={<Feather name="download" size={48} color="#555" />}
          actionLabel={t('importPlaylist')}
          onAction={() => setShowImportModal(true)}
        />
        <ImportPlaylistModal visible={showImportModal} onClose={() => setShowImportModal(false)} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg-deep">
      <DownloadSections entries={listEntries} header={header} />

      <ActionSheet
        visible={showClearMenu}
        title={t('clearTitle')}
        options={clearActions}
        onClose={() => setShowClearMenu(false)}
      />

      <ImportPlaylistModal visible={showImportModal} onClose={() => setShowImportModal(false)} />
    </View>
  );
}
