import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface IndexStatsCardsProps {
  photoCount: number;
  faceCount: number;
  onPressPhotos: () => void;
  onPressFaces: () => void;
}

function IconCircle({
  name,
  color,
  backgroundColor,
}: {
  name: keyof typeof Feather.glyphMap;
  color: string;
  backgroundColor: string;
}) {
  return (
    <View style={[styles.iconCircle, { backgroundColor }]}>
      <Feather name={name} size={20} color={color} />
    </View>
  );
}

export function IndexStatsCards({
  photoCount,
  faceCount,
  onPressPhotos,
  onPressFaces,
}: IndexStatsCardsProps) {
  const colors = useColors();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ver ${photoCount} fotos indexadas`}
        onPress={onPressPhotos}
        testID="index-stats-photos"
        style={({ pressed }) => [
          styles.card,
          styles.cardActionable,
          { backgroundColor: colors.card },
          pressed ? styles.cardPressed : null,
        ]}
      >
        <View style={styles.cardTop}>
          <IconCircle
            name="image"
            color={colors.primary}
            backgroundColor={colors.accent}
          />
          <Feather name="arrow-up-right" size={15} color={colors.primary} />
        </View>
        <Text style={[styles.value, { color: colors.foreground }]}>
          {String(photoCount)}
        </Text>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          fotos indexadas
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ver ${faceCount} rostos indexados`}
        onPress={onPressFaces}
        testID="index-stats-faces"
        style={({ pressed }) => [
          styles.card,
          styles.cardActionable,
          { backgroundColor: colors.card },
          pressed ? styles.cardPressed : null,
        ]}
      >
        <View style={styles.cardTop}>
          <IconCircle
            name="users"
            color="#34D399"
            backgroundColor="#123429"
          />
          <Feather name="arrow-up-right" size={15} color="#34D399" />
        </View>
        <Text style={[styles.value, { color: colors.foreground }]}>
          {String(faceCount)}
        </Text>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          rostos indexados
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, minHeight: 121, borderRadius: 19, padding: 14 },
  cardActionable: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    marginTop: 11,
    letterSpacing: -0.7,
  },
  label: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
});