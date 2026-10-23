import React, { useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
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

  const updateFromPosition = (pageX: number) => {
    if (trackWidth <= 0) return;
    const localX = pageX - trackPageX.current;
    const ratio = Math.min(Math.max(localX / trackWidth, 0), 1);
    const nextLevel = Math.round(ratio * MAX_PRECISION_LEVEL);
    onChange(nextLevel);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 2,
      onMoveShouldSetPanResponderCapture: (_, gestureState) => Math.abs(gestureState.dx) > 2,
      // Impede a ScrollView do Android de roubar/travar o toque
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        trackRef.current?.measure((_x, _y, width, _height, pageX) => {
          trackPageX.current = pageX;
          if (width > 0) setTrackWidth(width);
          updateFromPosition(evt.nativeEvent.pageX);
        });
      },
      onPanResponderMove: (evt) => {
        updateFromPosition(evt.nativeEvent.pageX);
      },
    }),
  ).current;

  const percentage = (clampedValue / MAX_PRECISION_LEVEL) * 100;
  const levels = Array.from({ length: 11 }, (_, i) => i);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Cabeçalho com ícone e título (mesmo padrão do card de catálogo) */}
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: colors.accent }]}>
          <Feather name="sliders" size={17} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Precisão de reconhecimento
        </Text>
      </View>

      {/* Textos Baixa e Alta posicionados ACIMA do slider */}
      <View style={styles.labelsRow}>
        <Text style={[styles.labelText, { color: colors.mutedForeground }]}>
          Baixa
        </Text>
        <Text style={[styles.labelText, { color: colors.mutedForeground }]}>
          Alta
        </Text>
      </View>

      {/* Área interativa da trilha do slider */}
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
        {/* Linha da trilha (cor neutra) */}
        <View style={[styles.trackLine, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.trackFill,
              {
                width: `${percentage}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>

        {/* Marcadores / traços de 0 a 10 (o 6 em vermelho, o resto neutro) */}
        <View style={styles.ticksOverlay} pointerEvents="none">
          {levels.map((lvl) => {
            const isSix = lvl === DEFAULT_PRECISION_LEVEL;
            return (
              <View
                key={lvl}
                style={[
                  styles.tick,
                  isSix
                    ? styles.tickSix
                    : { backgroundColor: colors.mutedForeground },
                ]}
              />
            );
          })}
        </View>

        {/* Bolinha do slider (Thumb neutro com borda elegante) */}
        <View
          style={[
            styles.thumb,
            {
              left: `${percentage}%`,
              backgroundColor: colors.primary,
              borderColor: colors.card,
            },
          ]}
          pointerEvents="none"
        />
      </View>

      {/* Régua com números pequenos de 0 a 10 (o 6 em vermelho, o resto neutro) */}
      <View style={styles.numbersRow}>
        {levels.map((lvl) => {
          const isSix = lvl === DEFAULT_PRECISION_LEVEL;
          return (
            <Pressable
              key={lvl}
              hitSlop={8}
              onPress={() => onChange(lvl)}
              style={styles.numberPressable}
            >
              <Text
                style={[
                  styles.numberText,
                  isSix
                    ? styles.numberTextSix
                    : { color: colors.mutedForeground },
                ]}
              >
                {lvl}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 17,
    marginTop: 14,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  iconBox: {
    width: 35,
    height: 35,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  labelText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  touchArea: {
    height: 36,
    justifyContent: 'center',
    position: 'relative',
    marginHorizontal: 4,
  },
  trackLine: {
    height: 4,
    borderRadius: 2,
    width: '100%',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 2,
  },
  ticksOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tick: {
    width: 2,
    height: 8,
    borderRadius: 1,
    opacity: 0.5,
  },
  tickSix: {
    width: 3,
    height: 12,
    borderRadius: 1.5,
    backgroundColor: '#EF4444',
    opacity: 1,
  },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginLeft: -10,
    top: 8,
    elevation: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  numbersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    marginTop: 2,
  },
  numberPressable: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 18,
    paddingVertical: 2,
  },
  numberText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
  },
  numberTextSix: {
    color: '#EF4444',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
});
