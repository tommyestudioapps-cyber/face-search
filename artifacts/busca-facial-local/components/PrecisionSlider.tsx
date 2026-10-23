import React, { useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  DEFAULT_PRECISION_LEVEL,
  MAX_PRECISION_LEVEL,
  MIN_PRECISION_LEVEL,
} from '@/constants/precision';

interface PrecisionSliderProps {
  value: number;
  onChange: (level: number) => void;
}

export function PrecisionSlider({ value, onChange }: PrecisionSliderProps) {
  const colors = useColors();
  const [trackWidth, setTrackWidth] = useState(0);
  const trackRef = useRef<View>(null);
  const trackPageX = useRef(0);

  const clampedValue = Math.min(
    Math.max(Math.round(value), MIN_PRECISION_LEVEL),
    MAX_PRECISION_LEVEL,
  );

  const isDefault = clampedValue === DEFAULT_PRECISION_LEVEL;

  const updateFromPageX = (pageX: number) => {
    if (trackWidth <= 0) return;
    const localX = pageX - trackPageX.current;
    const ratio = Math.min(Math.max(localX / trackWidth, 0), 1);
    const nextLevel = Math.round(ratio * MAX_PRECISION_LEVEL);
    onChange(nextLevel);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        trackRef.current?.measure((_x, _y, width, _height, pageX) => {
          trackPageX.current = pageX;
          if (width > 0) setTrackWidth(width);
          updateFromPageX(evt.nativeEvent.pageX);
        });
      },
      onPanResponderMove: (evt) => {
        updateFromPageX(evt.nativeEvent.pageX);
      },
    }),
  ).current;

  const percentage = (clampedValue / MAX_PRECISION_LEVEL) * 100;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.background,
          borderColor: isDefault ? 'rgba(239, 68, 68, 0.35)' : colors.border,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Precisão do Reconhecimento
        </Text>
        <View
          style={[
            styles.badge,
            isDefault
              ? styles.badgeDefault
              : { backgroundColor: colors.accent, borderColor: colors.border },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: isDefault ? '#EF4444' : colors.foreground },
            ]}
          >
            {isDefault ? '6 (Padrão)' : `Nível ${clampedValue}`}
          </Text>
        </View>
      </View>

      <View
        ref={trackRef}
        style={styles.touchArea}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 0) setTrackWidth(w);
          trackRef.current?.measure((_x, _y, _w, _h, pageX) => {
            trackPageX.current = pageX;
          });
        }}
        {...panResponder.panHandlers}
      >
        {/* Trilha de fundo */}
        <View style={[styles.trackBackground, { backgroundColor: colors.border }]}>
          {/* Trilha ativa */}
          <View
            style={[
              styles.trackActive,
              {
                width: `${percentage}%`,
                backgroundColor: isDefault ? '#EF4444' : colors.primary,
              },
            ]}
          />
        </View>

        {/* Marcações de pontos (0 a 10) */}
        <View style={styles.ticksContainer} pointerEvents="none">
          {Array.from({ length: 11 }).map((_, i) => {
            const isTargetDefault = i === DEFAULT_PRECISION_LEVEL;
            return (
              <View
                key={i}
                style={[
                  styles.tick,
                  isTargetDefault
                    ? styles.tickDefault
                    : { backgroundColor: i <= clampedValue ? colors.primary : colors.mutedForeground },
                ]}
              />
            );
          })}
        </View>

        {/* Thumb deslizante */}
        <View
          style={[
            styles.thumb,
            {
              left: `${percentage}%`,
              backgroundColor: isDefault ? '#EF4444' : colors.primary,
              borderColor: colors.card,
            },
          ]}
          pointerEvents="none"
        />
      </View>

      {/* Rótulos das extremidades: Baixa (0) e Alta (10) */}
      <View style={styles.labelsRow}>
        <Text style={[styles.labelText, { color: colors.mutedForeground }]}>
          Baixa
        </Text>
        <Text style={[styles.labelText, { color: colors.mutedForeground }]}>
          Alta
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeDefault: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: '#EF4444',
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  touchArea: {
    height: 40,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBackground: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
  },
  trackActive: {
    height: '100%',
    borderRadius: 3,
  },
  ticksContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  tick: {
    width: 4,
    height: 4,
    borderRadius: 2,
    opacity: 0.6,
  },
  tickDefault: {
    width: 6,
    height: 10,
    borderRadius: 3,
    backgroundColor: '#EF4444',
    opacity: 1,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    marginLeft: -12,
    top: 8,
    elevation: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  labelText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
});
