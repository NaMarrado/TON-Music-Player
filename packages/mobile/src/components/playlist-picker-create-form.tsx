import { Pressable, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
  newName: string;
  onChangeName: (value: string) => void;
  onCancel: () => void;
  onCreate: () => void;
}

export function PlaylistPickerCreateForm({
  newName,
  onChangeName,
  onCancel,
  onCreate,
}: Props) {
  const { t } = useTranslation('library');

  return (
    <View className="px-5 pb-5">
      <TextInput
        value={newName}
        onChangeText={onChangeName}
        className="bg-bg-elevated text-text-primary rounded-lg px-3 py-2.5 text-sm mb-3"
        placeholderTextColor="#555"
        placeholder={t('playlistName')}
        autoFocus
        onSubmitEditing={onCreate}
      />
      <View className="flex-row gap-3">
        <Pressable
          onPress={onCancel}
          className="flex-1 py-2.5 rounded-lg bg-bg-elevated items-center"
        >
          <Text className="text-text-secondary text-sm font-semibold">{t('cancel')}</Text>
        </Pressable>
        <Pressable
          onPress={onCreate}
          className="flex-1 py-2.5 rounded-lg bg-white items-center"
          disabled={!newName.trim()}
          style={{ opacity: newName.trim() ? 1 : 0.5 }}
        >
          <Text className="text-black text-sm font-semibold">{t('create')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
