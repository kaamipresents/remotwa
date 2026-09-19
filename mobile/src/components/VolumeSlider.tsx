// VolumeSlider.tsx — Custom smooth touch slider with 50ms throttling and optimistic updates
// Implements windows-audio-remote-spec.md Section 5 (Slider Throttling)

import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  LayoutChangeEvent,
} from 'react-native';
import { useThrottledSlider } from '../hooks/useThrottledSlider';

interface VolumeSliderProps {
  value: number; // 0.0 to 1.0
  onValueChange: (val: number) => void;
  disabled?: boolean;
  label?: string;
  accentColor?: string;
}

export const VolumeSlider: React.FC<VolumeSliderProps> = ({
  value,
  onValueChange,
  disabled = false,
  label,
  accentColor = '#3b82f6',
}) => {
  const { displayValue, onValueChange: handleDrag, onSlidingComplete } = useThrottledSlider({
    serverValue: value,
    onCommit: onValueChange,
  });

  const trackWidthRef = useRef<number>(200);

  const calculateRatio = (pageX: number, trackLeft: number, width: number): number => {
    if (width <= 0) return 0;
    const offset = pageX - trackLeft;
    return Math.max(0, Math.min(1, offset / width));
  };

  const trackLayoutRef = useRef<{ x: number; width: number }>({ x: 0, width: 200 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        if (disabled) return;
        const ratio = calculateRatio(
          evt.nativeEvent.pageX,
          trackLayoutRef.current.x,
          trackLayoutRef.current.width
        );
        handleDrag(ratio);
      },
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (disabled) return;
        const ratio = calculateRatio(
          evt.nativeEvent.pageX,
          trackLayoutRef.current.x,
          trackLayoutRef.current.width
        );
        handleDrag(ratio);
      },
      onPanResponderRelease: (evt: GestureResponderEvent) => {
        if (disabled) return;
        const ratio = calculateRatio(
          evt.nativeEvent.pageX,
          trackLayoutRef.current.x,
          trackLayoutRef.current.width
        );
        onSlidingComplete(ratio);
      },
    })
  ).current;

  const onTrackLayout = (event: LayoutChangeEvent) => {
    event.target.measure((x, y, width, height, pageX, pageY) => {
      trackLayoutRef.current = { x: pageX, width };
      trackWidthRef.current = width;
    });
  };

  const percentage = Math.round(displayValue * 100);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <Text style={[styles.percentage, { color: accentColor }]}>{percentage}%</Text>
      </View>

      <View
        style={[styles.trackContainer, disabled && styles.disabledTrack]}
        onLayout={onTrackLayout}
        {...panResponder.panHandlers}
      >
        <View style={styles.trackBackground}>
          <View
            style={[
              styles.trackFill,
              { width: `${percentage}%`, backgroundColor: accentColor },
            ]}
          />
        </View>

        <View
          style={[
            styles.thumb,
            {
              left: `${Math.max(0, Math.min(96, percentage))}%`,
              borderColor: accentColor,
            },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e4e4e7',
  },
  percentage: {
    fontSize: 14,
    fontWeight: '700',
  },
  trackContainer: {
    height: 38,
    justifyContent: 'center',
    position: 'relative',
  },
  disabledTrack: {
    opacity: 0.4,
  },
  trackBackground: {
    height: 10,
    backgroundColor: '#27272a',
    borderRadius: 5,
    overflow: 'hidden',
    width: '100%',
  },
  trackFill: {
    height: '100%',
    borderRadius: 5,
  },
  thumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    borderWidth: 3,
    marginLeft: -13,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 4,
  },
});
