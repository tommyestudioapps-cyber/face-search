import React, { useRef, useState } from 'react';
import {
  Modal,
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
      onMoveShouldSetPanResponder: () => true,
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
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
            <Pressable hitSlop={10} onPress={onClose} style={styles.closeButton}>
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
                  hitSlop={6}
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

          {/* Botão Concluído */}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
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
    padding: 4,
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
    marginBottom: 2,
  },
  numberPressable: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 16,
  },
  numberText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
  },
  numberTextSix: {
    color: '#EF4444',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
  touchArea: {
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    marginHorizontal: 4,
    marginBottom: 18,
  },
  ticksOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 4,
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
    height: 5,
    borderRadius: 2.5,
    width: '100%',
    overflow: 'hidden',
    marginTop: 10,
  },
  trackFill: {
    height: '100%',
    borderRadius: 2.5,
  },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    marginLeft: -11,
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
