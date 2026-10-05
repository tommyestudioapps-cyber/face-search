import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

// Tons verdes usados na Home (constants/colors.ts não contém esses valores —
// eles estão inline em app/index.tsx). Não substituir por colors.success etc.
const DARK_GREEN = '#123429';   // fundo da pill "ATIVO"
const LIGHT_GREEN = '#6EE7B7';  // texto "ATIVO"
const COUNT_COLOR = '#F8FAFC';  // colors.foreground
const LABEL_MUTED = '#94A3B8';  // colors.mutedForeground

export type HomeIndexingState = 'indexing' | 'completed' | 'off';

interface HomeIndexingIndicatorProps {
  state: HomeIndexingState;
  processedAssets: number;
}

export function HomeIndexingIndicator({
  state,
  processedAssets,
}: HomeIndexingIndicatorProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state !== 'indexing') {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [state, pulse]);

  const backgroundColor =
    state === 'indexing'
      ? pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [DARK_GREEN, LIGHT_GREEN],
        })
      : state === 'completed'
        ? LIGHT_GREEN
        : DARK_GREEN;

  const label =
    state === 'indexing'
      ? 'Indexação em andamento:'
      : state === 'completed'
        ? 'Indexação concluída:'
        : 'Indexação desligada';

  const labelColor =
    state === 'completed'
      ? LIGHT_GREEN
      : state === 'indexing'
        ? LABEL_MUTED
        : LABEL_MUTED;

  return (
    <View style={styles.row}>
      <Animated.View style={[styles.dot, { backgroundColor }]} />
      <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
        {label}
      </Text>
      {state !== 'off' ? (
        <Text style={[styles.count, { color: COUNT_COLOR }]}>
          {processedAssets}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  count: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    marginLeft: 'auto',
  },
});