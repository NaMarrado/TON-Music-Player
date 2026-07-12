import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SettingsCard, SectionHeader } from './primitives';

const INPUT_STYLE = {
  borderRadius: 12,
  height: 44,
  lineHeight: 18,
  paddingVertical: 0,
  width: '100%' as const,
};

function HelpModal({
  onClose,
  steps,
  title,
}: {
  onClose: () => void;
  steps: string[];
  title: string;
}) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 items-center justify-center px-5"
        style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}
        onPress={onClose}
      >
        <Pressable
          className="bg-bg-surface border border-border w-full"
          style={{ borderRadius: 24, padding: 20, maxWidth: 420 }}
          onPress={(event) => event.stopPropagation()}
        >
          <Text className="text-text-primary text-lg font-bold mb-4">{title}</Text>
          {steps.map((step, index) => (
            <View key={step} className="flex-row mb-3">
              <Text className="text-text-primary text-sm font-bold mr-3">{index + 1}.</Text>
              <Text className="text-text-secondary text-sm flex-1">{step}</Text>
            </View>
          ))}
          <Pressable
            className="bg-white items-center mt-2"
            style={{ borderRadius: 20, paddingVertical: 10 }}
            onPress={onClose}
          >
            <Text className="text-black text-[13px] font-semibold">OK</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function SpotifyCard({
  title,
  description,
  tapToEditLabel,
  spotifyIdLabel,
  spotifyIdPlaceholder,
  spotifySecretLabel,
  spotifySecretPlaceholder,
  saveLabel,
  helpTitle,
  helpSteps,
  spotifyLoaded,
  spotifyId,
  spotifySecret,
  onLoad,
  onSave,
  onSpotifyIdChange,
  onSpotifySecretChange,
}: {
  title: string;
  description: string;
  tapToEditLabel: string;
  spotifyIdLabel: string;
  spotifyIdPlaceholder: string;
  spotifySecretLabel: string;
  spotifySecretPlaceholder: string;
  saveLabel: string;
  helpTitle: string;
  helpSteps: string[];
  spotifyLoaded: boolean;
  spotifyId: string;
  spotifySecret: string;
  onLoad: () => void;
  onSave: () => void;
  onSpotifyIdChange: (value: string) => void;
  onSpotifySecretChange: (value: string) => void;
}) {
  const [showHelp, setShowHelp] = useState(false);

  const card = (
    <SettingsCard>
      <View className="flex-row items-start justify-between">
        <View style={{ flex: 1, paddingRight: 10 }}>
          <SectionHeader
            icon="headphones"
            title={title}
            description={description}
          />
        </View>
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            setShowHelp(true);
          }}
          className="border border-border items-center justify-center"
          style={{ borderRadius: 16, height: 30, width: 30 }}
        >
          <Text className="text-text-primary text-sm font-bold">?</Text>
        </Pressable>
      </View>
      {!spotifyLoaded ? (
        <View className="flex-row items-center">
          <Text className="text-text-muted text-xs">{tapToEditLabel}</Text>
          <Feather name="chevron-right" size={14} color="#555" style={{ marginLeft: 4 }} />
        </View>
      ) : (
        <View>
          <Text className="text-text-secondary text-xs mb-1">{spotifyIdLabel}</Text>
          <TextInput
            value={spotifyId}
            onChangeText={onSpotifyIdChange}
            className="bg-bg-deep text-text-primary px-3.5 text-sm mb-3 border border-border"
            style={INPUT_STYLE}
            placeholderTextColor="#555"
            placeholder={spotifyIdPlaceholder}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            importantForAutofill="no"
            multiline={false}
            numberOfLines={1}
            scrollEnabled={false}
            spellCheck={false}
            textContentType="none"
          />
          <Text className="text-text-secondary text-xs mb-1">{spotifySecretLabel}</Text>
          <TextInput
            value={spotifySecret}
            onChangeText={onSpotifySecretChange}
            className="bg-bg-deep text-text-primary px-3.5 text-sm mb-3 border border-border"
            style={INPUT_STYLE}
            placeholderTextColor="#555"
            placeholder={spotifySecretPlaceholder}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            importantForAutofill="no"
            multiline={false}
            numberOfLines={1}
            scrollEnabled={false}
            secureTextEntry
            spellCheck={false}
            textContentType="none"
          />
          <Pressable
            onPress={onSave}
            className="bg-white items-center"
            style={{ borderRadius: 20, paddingVertical: 9, paddingHorizontal: 20 }}
          >
            <Text className="text-black text-[13px] font-semibold">{saveLabel}</Text>
          </Pressable>
        </View>
      )}
    </SettingsCard>
  );

  return (
    <>
      {spotifyLoaded ? card : <Pressable onPress={onLoad}>{card}</Pressable>}
      {showHelp && (
        <HelpModal title={helpTitle} steps={helpSteps} onClose={() => setShowHelp(false)} />
      )}
    </>
  );
}
