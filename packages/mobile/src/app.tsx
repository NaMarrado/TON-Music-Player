import './i18n';
import './global.css';
import { useCallback } from 'react';
import {
  StatusBar,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from './navigation/root-navigator';
import { ToastContainer } from './components/toast-container';
import { JsEvaluatorWebView } from './components/js-evaluator-webview';
import { AppErrorScreen } from './components/app-error-screen';
import { useAppInit } from './hooks/use-app-init';
import { useDelayedWebView } from './hooks/use-delayed-webview';
import { usePlaybackSync } from './hooks/use-playback-sync';
import { useStartupUpdateCheck } from './hooks/use-startup-update-check';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const { t } = useTranslation('common');
  const { ready, error, retry } = useAppInit();
  usePlaybackSync({ enabled: ready });
  const shouldMountWebView = useDelayedWebView({ ready, isUiUnlocked: ready && !error });
  useStartupUpdateCheck(ready);
  const handleRootLayout = useCallback(() => {
    if (!ready && !error) {
      return;
    }
    void SplashScreen.hideAsync().catch(() => {});
  }, [error, ready]);

  if (!ready && !error) {
    return null;
  }

  const content = error ? (
    <AppErrorScreen error={error} retryLabel={t('retry')} onRetry={retry} />
  ) : (
    <>
      <RootNavigator />
      <ToastContainer />
    </>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#050505' }} onLayout={handleRootLayout}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#050505" />
        {shouldMountWebView ? <JsEvaluatorWebView /> : null}
        {content}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
