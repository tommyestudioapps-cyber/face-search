import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface IndexStatsCardsProps {
  matchCount: number;
  hasQuery: boolean;
  onPressMatches: () => void;
}

export function IndexStatsCards({
  matchCount,
  hasQuery,
  onPressMatches,
}: IndexStatsCardsProps) {
  const colors = useColors();

  if (!hasQuery) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver ${matchCount} fotos com o rosto buscado`}
      onPress={onPressMatches}
      testID="view-matches"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
        <Feather name="user-check" size={20} color={colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.value, { color: colors.foreground }]}>
          {matchCount}
        </Text>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          {matchCount === 1
            ? 'foto com este rosto'
            : 'fotos com este rosto'}
        </Text>
      </View>
      <Feather name="arrow-right" size={18} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 17,
    padding: 14,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.985 }],
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1 },
  value: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
});