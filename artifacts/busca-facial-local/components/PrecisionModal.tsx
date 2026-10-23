import React, { useMemo, useRef, useState } from 'react';
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

interface PrecisionModalProps {
  visible: boolean;
  value: number;
  onChange: (level: number) => void;
  onClose: () => void;
}

export function PrecisionModal({
  visible,
  value,
  onChange,
  onClose,
}: PrecisionModalProps) {
  const colors = useColors();
  const trackWidthRef = useRef(0);
  const [, setTrackWidth] = useState(0);

  const startLevel = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const valueRef = useRef(value);
  valueRef.current = value;

  const clampedValue = Math.min(
    Math.max(Math.round(value), MIN_PRECISION_LEVEL),
    MAX_PRECISION_LEVEL,
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startLevel.current = valueRef.current;
        },
        onPanResponderMove: (_, gestureState) => {
          const width = trackWidthRef.current;
          if (width <= 0) return;
          const deltaLevel = Math.round(
            (gestureState.dx / width) * MAX_PRECISION_LEVEL,
          );
          const nextLevel = Math.min(
            Math.max(startLevel.current + deltaLevel, MIN_PRECISION_LEVEL),
            MAX_PRECISION_LEVEL,
          );
          onChangeRef.current(nextLevel);
        },
      }),
    [],
  );

  const percentage = (clampedValue / MAX_PRECISION_LEVEL) * 100;
  const levels = Array.from({ length: 11 }, (_, i) => i);

  if (!visible) return null;

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        {/* Cabeçalho */}
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <View style={[styles.iconBox, { backgroundColor: colors.accent }]}>
              <Feather name="target" size={17} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Precisão de reconhecimento
            </Text>
          </View>
          <Pressable hitSlop={12} onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Rótulos Baixa e Alta */}
        <View style={styles.labelsRow}>
          <Text style={[styles.labelText, { color: colors.mutedForeground }]}>
            Baixa
          </Text>
          <Text style={[styles.labelText, { color: colors.mutedForeground }]}>
            Alta
          </Text>
        </View>

        {/* Números pequenos (0 a 10) na parte de CIMA, colados na régua */}
        <View style={styles.numbersRow}>
          {levels.map((lvl) => {
            const isSix = lvl === DEFAULT_PRECISION_LEVEL;
            return (
              <Pressable
                key={lvl}
                hitSlop={10}
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

        {/* Área da régua e trilha deslizante */}
        <View
          style={styles.touchArea}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0) {
              trackWidthRef.current = w;
              setTrackWidth(w);
            }
          }}
          {...panResponder.panHandlers}
        >
          {/* Tracinhos da régua (o 6 em vermelho) */}
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

          {/* Linha da trilha neutra com preenchimento */}
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

          {/* Bolinha do slider (Thumb) */}
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

        {/* Botão Concluir */}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.doneButton,
            { backgroundColor: colors.primary },
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={[styles.doneButtonText, { color: colors.primaryForeground }]}>
            Concluir
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
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
    fontSize: 13,
  },
  closeButton: {
    padding: 6,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  labelText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  numbersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  numberPressable: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
    paddingVertical: 4,
  },
  numberText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
  },
  numberTextSix: {
    color: '#EF4444',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  touchArea: {
    height: 48,
    justifyContent: 'center',
    position: 'relative',
    marginHorizontal: 4,
    marginBottom: 18,
  },
  ticksOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tick: {
    width: 2,
    height: 7,
    borderRadius: 1,
    opacity: 0.4,
  },
  tickSix: {
    width: 3,
    height: 10,
    borderRadius: 1.5,
    backgroundColor: '#EF4444',
    opacity: 1,
  },
  trackLine: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
    marginTop: 10,
  },
  trackFill: {
    height: '100%',
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    marginLeft: -12,
    top: 17,
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  doneButton: {
    minHeight: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  pressed: {
    opacity: 0.85,
  },
});
