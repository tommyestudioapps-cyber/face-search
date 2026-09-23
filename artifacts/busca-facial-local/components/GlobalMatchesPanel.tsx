import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

interface GlobalMatchesPanelProps {
  matchCount: number;
  onPress: () => void;
}

export function GlobalMatchesPanel({
  matchCount,
  onPress,
}: GlobalMatchesPanelProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const photoLabel = matchCount === 1 ? 'foto encontrada' : 'fotos encontradas';

  return (
    <View style={[styles.positioner, { paddingBottom: bottomInset + 10 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${matchCount} ${photoLabel}. Abrir fotos encontradas`}
        accessibilityHint="Abre a tela com todas as fotos identificadas com o rosto procurado"
        onPress={() => {
          void Haptics.selectionAsync();
          onPress();
        }}
        testID="global-matches-panel"
        style={({ pressed }) => [
          styles.panel,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
          pressed ? styles.pressed : null,
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.accent }]}>
          <Feather name="image" size={19} color={colors.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>
            FOTOS ENCONTRADAS
          </Text>
          <Text style={[styles.count, { color: colors.foreground }]}>
            {matchCount}
          </Text>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>
            {photoLabel} com o rosto procurado
          </Text>
        </View>
        <View style={[styles.openHint, { backgroundColor: colors.primary }]}>
          <Feather name="arrow-up-right" size={17} color={colors.primaryForeground} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  panel: {
    width: '100%',
    maxWidth: 480,
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 21,
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    elevation: 8,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  iconWrap: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 1,
  },
  count: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: -0.5,
  },
  label: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    marginTop: 1,
  },
  openHint: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});