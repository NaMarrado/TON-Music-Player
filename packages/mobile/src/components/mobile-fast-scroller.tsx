import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

const FAST_SCROLL_MIN_ITEMS = 40;
const FAST_SCROLL_TRACK_INSET = 4;
const FAST_SCROLL_THUMB_MIN_HEIGHT = 48;

interface FastScrollMetrics {
  contentHeight: number;
  viewportHeight: number;
}

export function useMobileFastScroll<T>() {
  const listRef = useRef<FlashList<T>>(null);
  const scrollOffset = useSharedValue(0);
  const [metrics, setMetrics] = useState<FastScrollMetrics>({
    contentHeight: 0,
    viewportHeight: 0,
  });

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.value = event.nativeEvent.contentOffset.y;
  }, [scrollOffset]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const viewportHeight = event.nativeEvent.layout.height;
    setMetrics((current) => (
      current.viewportHeight === viewportHeight ? current : { ...current, viewportHeight }
    ));
  }, []);

  const onContentSizeChange = useCallback((_width: number, contentHeight: number) => {
    setMetrics((current) => (
      current.contentHeight === contentHeight ? current : { ...current, contentHeight }
    ));
  }, []);

  const scrollToOffset = useCallback((offset: number) => {
    listRef.current?.scrollToOffset({ animated: false, offset });
  }, []);

  return {
    contentHeight: metrics.contentHeight,
    listRef,
    onContentSizeChange,
    onLayout,
    onScroll,
    scrollOffset,
    scrollToOffset,
    viewportHeight: metrics.viewportHeight,
  };
}

export function MobileFastScroller({
  contentHeight,
  itemCount,
  onScrollToOffset,
  scrollOffset,
  viewportHeight,
}: {
  contentHeight: number;
  itemCount: number;
  onScrollToOffset: (offset: number) => void;
  scrollOffset: SharedValue<number>;
  viewportHeight: number;
}) {
  const trackHeight = Math.max(0, viewportHeight - FAST_SCROLL_TRACK_INSET * 2);
  const maxScrollOffset = Math.max(0, contentHeight - viewportHeight);
  const thumbHeight = Math.max(
    FAST_SCROLL_THUMB_MIN_HEIGHT,
    Math.min(trackHeight, contentHeight > 0 ? (viewportHeight / contentHeight) * trackHeight : trackHeight),
  );
  const thumbTravel = Math.max(0, trackHeight - thumbHeight);
  const visible = itemCount >= FAST_SCROLL_MIN_ITEMS && maxScrollOffset > 0 && thumbTravel > 0;

  const scrollFromGesture = useCallback((gestureY: number) => {
    if (thumbTravel <= 0 || maxScrollOffset <= 0) return;
    const thumbTop = Math.max(0, Math.min(thumbTravel, gestureY - thumbHeight / 2));
    onScrollToOffset((thumbTop / thumbTravel) * maxScrollOffset);
  }, [maxScrollOffset, onScrollToOffset, thumbHeight, thumbTravel]);

  const gesture = useMemo(() => Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      runOnJS(scrollFromGesture)(event.y - FAST_SCROLL_TRACK_INSET);
    })
    .onUpdate((event) => {
      runOnJS(scrollFromGesture)(event.y - FAST_SCROLL_TRACK_INSET);
    }), [scrollFromGesture]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: maxScrollOffset <= 0
        ? 0
        : Math.max(0, Math.min(thumbTravel, (scrollOffset.value / maxScrollOffset) * thumbTravel)),
    }],
  }), [maxScrollOffset, thumbTravel]);

  if (!visible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        bottom: FAST_SCROLL_TRACK_INSET,
        position: 'absolute',
        right: 0,
        top: FAST_SCROLL_TRACK_INSET,
        width: 28,
        zIndex: 20,
      }}
    >
      <GestureDetector gesture={gesture}>
        <View style={{ flex: 1, alignItems: 'flex-end', paddingRight: 3 }}>
          <Animated.View
            style={[
              {
                backgroundColor: 'rgba(232, 232, 232, 0.72)',
                borderRadius: 999,
                height: thumbHeight,
                width: 4,
              },
              thumbStyle,
            ]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}
