// useThrottledSlider.ts — 50ms outbound rate limiter with 300ms inbound jitter suppression
// Implements windows-audio-remote-spec.md Section 5 (Slider Throttling)

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseThrottledSliderOptions {
  serverValue: number; // 0.0 to 1.0 from source of truth
  onCommit: (value: number) => void; // Dispatches setVolume or setSessionVolume
  throttleMs?: number; // Default 50ms
  suppressionWindowMs?: number; // Default 300ms
}

export function useThrottledSlider({
  serverValue,
  onCommit,
  throttleMs = 50,
  suppressionWindowMs = 300,
}: UseThrottledSliderOptions) {
  const [displayValue, setDisplayValue] = useState<number>(serverValue);
  const isDraggingRef = useRef<boolean>(false);
  const suppressionTimerRef = useRef<any>(null);
  const throttleTimerRef = useRef<any>(null);
  const lastSendTimeRef = useRef<number>(0);
  const latestValueRef = useRef<number>(serverValue);

  // Sync with incoming server events ONLY when user is not actively dragging or in suppression window
  useEffect(() => {
    if (!isDraggingRef.current && !suppressionTimerRef.current) {
      setDisplayValue(serverValue);
      latestValueRef.current = serverValue;
    }
  }, [serverValue]);

  // Invoked continuously as user drags finger
  const onValueChange = useCallback(
    (newValue: number) => {
      isDraggingRef.current = true;
      latestValueRef.current = newValue;
      setDisplayValue(newValue); // Instant optimistic update

      // Clear any pending suppression
      if (suppressionTimerRef.current) {
        clearTimeout(suppressionTimerRef.current);
        suppressionTimerRef.current = null;
      }

      const now = Date.now();
      const elapsed = now - lastSendTimeRef.current;

      if (elapsed >= throttleMs) {
        lastSendTimeRef.current = now;
        onCommit(newValue);
      } else {
        // Schedule trailing dispatch
        if (!throttleTimerRef.current) {
          throttleTimerRef.current = setTimeout(() => {
            throttleTimerRef.current = null;
            lastSendTimeRef.current = Date.now();
            onCommit(latestValueRef.current);
          }, throttleMs - elapsed);
        }
      }
    },
    [onCommit, throttleMs]
  );

  // Invoked when user releases thumb
  const onSlidingComplete = useCallback(
    (finalValue: number) => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }

      // Always guarantee final release value is sent on the wire
      lastSendTimeRef.current = Date.now();
      onCommit(finalValue);

      // Start 300ms suppression window where incoming events for this slider are ignored
      if (suppressionTimerRef.current) {
        clearTimeout(suppressionTimerRef.current);
      }

      suppressionTimerRef.current = setTimeout(() => {
        isDraggingRef.current = false;
        suppressionTimerRef.current = null;
      }, suppressionWindowMs);
    },
    [onCommit, suppressionWindowMs]
  );

  return {
    displayValue,
    onValueChange,
    onSlidingComplete,
    isDragging: isDraggingRef.current,
  };
}
