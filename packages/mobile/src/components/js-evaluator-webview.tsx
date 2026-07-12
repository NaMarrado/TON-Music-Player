import { useRef, useCallback } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { registerWebView, handleWebViewMessage } from '../services/js-evaluator';
import { registerPoTokenWebView, handlePoTokenMessage } from '../services/po-token-service';
import { PO_TOKEN_HTML } from '../services/po-token-webview-html';

export function JsEvaluatorWebView() {
  const webViewRef = useRef<WebView>(null);

  const onLoad = useCallback(() => {
    registerWebView(webViewRef.current);
    registerPoTokenWebView(webViewRef.current);
    console.log('[WebView] Loaded and registered for cipher + po_token');
  }, []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const data = event.nativeEvent.data;
    // Try po_token handler first, fall back to cipher handler
    if (!handlePoTokenMessage(data)) {
      handleWebViewMessage(data);
    }
  }, []);

  return (
    <View style={{ width: 1, height: 1, opacity: 0, overflow: 'hidden', position: 'absolute', left: -1, top: -1 }}>
      <WebView
        ref={webViewRef}
        source={{ html: PO_TOKEN_HTML, baseUrl: 'https://www.youtube.com' }}
        onLoad={onLoad}
        onMessage={onMessage}
        javaScriptEnabled
        userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        originWhitelist={['*']}
      />
    </View>
  );
}
