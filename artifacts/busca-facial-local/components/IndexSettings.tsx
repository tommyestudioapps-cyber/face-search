import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import type { StoredIndexStats } from '@/services/faceSearch';

interface IndexSettingsProps {
  visible: boolean;
  stats: StoredIndexStats;
  onClose: () => void;
  onClearIndex: () => Promise<void>;
}

export function IndexSettings({
  visible,
  stats,
  onClose,
  onClearIndex,
}: IndexSettingsProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setClearError(null);
    }
  }, [visible]);

  const clearIndex = () => {
    if (isClearing) {
      return;
    }

    Alert.alert(
      'Limpar índice local?',
      'Isso apagará as fotos e rostos processados do índice deste aparelho. As fotos originais da sua galeria não serão apagadas.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Limpar índice',
          style: 'destructive',
          onPress: () => {
            setIsClearing(true);
            setClearError(null);
            void onClearIndex()
              .catch(() => {
                setClearError('Não foi possível limpar o índice local.');
              })
              .finally(() => {
                setIsClearing(false);
              });
          },
        },
      ],
    );
  };

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 18,
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            <View style={styles.titleRow}>
              <View style={[styles.titleIcon, { backgroundColor: colors.accent }]}>
                <Feather name="sliders" size={18} color={colors.primary} />
              </View>
              <View style={styles.titleCopy}>
                <Text style={[styles.title, { color: colors.foreground }]}>
                  Configurações do índice
                </Text>
                <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                  Dados processados somente neste aparelho
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityLabel="Fechar configurações"
              accessibilityRole="button"
              hitSlop={12}
              onPress={onClose}
              testID="close-index-settings"
            >
              <Feather name="x" size={21} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            ESTATÍSTICAS LOCAIS
          </Text>
          <View style={styles.statsRow}>
            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Feather name="image" size={18} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {String(stats.indexedPhotos)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                fotos indexadas
              </Text>
            </View>
            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.background, borderColor: colors.border },
              ]}
            >
              <Feather name="user" size={18} color="#34D399" />
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {String(stats.indexedFaces)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                rostos indexados
              </Text>
            </View>
          </View>

          <View style={[styles.infoCard, { backgroundColor: colors.background }]}>
            <Feather name="shield" size={17} color="#34D399" />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Limpar o índice remove somente os dados processados. As fotos da
              galeria permanecem intactas.
            </Text>
          </View>

          {clearError ? (
            <Text style={styles.errorText} accessibilityRole="alert">
              {clearError}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={isClearing}
            onPress={clearIndex}
            style={({ pressed }) => [
              styles.clearButton,
              { borderColor: '#7F1D35' },
              isClearing ? styles.disabled : null,
              pressed ? styles.pressed : null,
            ]}
            testID="clear-local-index"
          >
            <Feather name="trash-2" size={17} color="#FB7185" />
            <Text style={styles.clearButtonText}>
              {isClearing ? 'Limpando índice…' : 'Limpar índice local'}
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
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2,4,12,0.75)',
    padding: 14,
  },
  sheet: {
    borderWidth: 1,
    borderRadius: 27,
    padding: 22,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleIcon: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCopy: {
    flex: 1,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 19,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 26,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    minHeight: 105,
    borderWidth: 1,
    borderRadius: 17,
    padding: 14,
  },
  statValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 25,
    marginTop: 10,
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 15,
    marginTop: 12,
    padding: 12,
  },
  infoText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  errorText: {
    color: '#FB7185',
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
  },
  clearButton: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
  },
  clearButtonText: {
    color: '#FB7185',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.75,
  },
});