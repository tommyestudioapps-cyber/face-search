import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

// Tons verdes usados na Home (constants/colors.ts não contém esses valores —
// eles estão inline em app/index.tsx). Não substituir por colors.success etc.
const DARK_GREEN = '#123429';   // fundo da pill "ATIVO"
const LIGHT_GREEN = '#6EE7B7';  // texto "ATIVO"
const COUNT_COLOR = '#F8FAFC';  // colors.foreground
const LABEL_MUTED = '#94A3B8';  // colors.mutedForeground

interface HomeIndexingIndicatorProps {
  isIndexing: boolean;
  processedAssets: number;
}

export function HomeIndexingIndicator({
  isIndexing,
  processedAssets,
}: HomeIndexingIndicatorProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isIndexing) {
      pulse.setValue(1);
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
  }, [isIndexing, pulse]);

  const backgroundColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [DARK_GREEN, LIGHT_GREEN],
  });

  const label = isIndexing ? 'Indexação em andamento:' : 'Indexação concluída:';
  const labelColor = isIndexing ? LABEL_MUTED : LIGHT_GREEN;

  return (
    <View style={styles.row}>
      <Animated.View style={[styles.dot, { backgroundColor }]} />
      <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.count, { color: COUNT_COLOR }]}>{processedAssets}</Text>
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