import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

type AutoMarqueeTextProps = Omit<TextProps, 'children' | 'numberOfLines'> & {
  active: boolean;
  align?: 'left' | 'center';
  className?: string;
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<TextStyle>;
  text: string;
};

export function AutoMarqueeText({
  active,
  align = 'left',
  className,
  containerStyle,
  style,
  text,
  ...textProps
}: AutoMarqueeTextProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const distance = Math.max(0, textWidth - containerWidth);
  const isOverflowing = distance > 2;

  useEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(0);
    if (!active || !isOverflowing) return undefined;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(translateX, {
          toValue: -distance,
          duration: Math.max(2500, Math.round((distance / 28) * 1000)),
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(700),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 1,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [active, distance, isOverflowing, translateX]);

  const handleContainerLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  const handleTextLayout = (event: LayoutChangeEvent) => {
    setTextWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      accessible
      accessibilityLabel={text}
      onLayout={handleContainerLayout}
      style={[{ minWidth: 0, overflow: 'hidden' }, containerStyle]}
    >
      <Animated.View
        style={{
          alignSelf: isOverflowing || align === 'left' ? 'flex-start' : 'center',
          transform: [{ translateX }],
        }}
      >
        <Text
          {...textProps}
          className={className}
          numberOfLines={1}
          onLayout={handleTextLayout}
          style={[style, { flexShrink: 0 }]}
        >
          {text}
        </Text>
      </Animated.View>
    </View>
  );
}
