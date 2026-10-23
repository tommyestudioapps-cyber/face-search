import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import type {
  BackgroundIndexState,
  FaceIndexProgress,
  StoredIndexStats,
} from '@/services/faceSearch';
import type {
  FaceSearchClearState,
  FaceSearchOperation,
} from '@/hooks/useFaceSearch';
import {
  clearIndexWithFeedback,
  createIndexClearAlertOptions,
  INDEX_CLEAR_ALERT_MESSAGE,
  INDEX_CLEAR_ERROR_MESSAGE,
  INDEX_CLEAR_ALERT_TITLE,
  INDEX_SETTINGS_TEST_IDS,
} from './indexSettingsFlow';

interface IndexSettingsProps {
  visible: boolean;
  stats: StoredIndexStats;
  onClose: () => void;
  onClearIndex: () => Promise<void>;
  operation: FaceSearchOperation;
  isOperationActive: boolean;
  clearState: FaceSearchClearState;
  progress: FaceIndexProgress;
  backgroundIndexEnabled: boolean;
  backgroundIndexState: BackgroundIndexState;
  hasGalleryPhotoPermission: boolean;
  isBackgroundIndexUpdating: boolean;
  onBackgroundIndexToggle: (enabled: boolean) => void | Promise<void>;
}

export function IndexSettings({
  visible,
  stats,
  onClose,
  onClearIndex,
  operation,
  isOperationActive,
  clearState,
  progress,
  backgroundIndexEnabled,
  backgroundIndexState,
  hasGalleryPhotoPermission,
  isBackgroundIndexUpdating,
  onBackgroundIndexToggle,
}: IndexSettingsProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const clearBlocked = isClearing || isOperationActive || clearState !== 'idle';
  const isWaitingForOperation =
    (isOperationActive && operation !== 'clearing') || clearState === 'waiting';
  const operationLabel =
    operation === 'searching'
      ? 'busca'
      : operation === 'indexing'
        ? 'indexação'
        : operation === 'initializing'
          ? 'preparação do índice'
          : 'limpeza';
  const progressLabel =
    operation === 'indexing' && progress.totalAssets !== null
      ? `${progress.processedAssets} de ${progress.totalAssets} fotos processadas`
      : operation === 'searching'
        ? 'Os resultados estão sendo preservados.'
        : 'Aguarde a operação terminar.';
  const backgroundIndexStatus = backgroundIndexState.status;
  const backgroundIndexTitle = !backgroundIndexEnabled
    ? 'Catálogo pausado'
    : backgroundIndexStatus === 'completed'
      ? 'Catálogo local preparado'
      : backgroundIndexStatus === 'running'
        ? 'Catálogo local'
        : backgroundIndexStatus === 'paused'
          ? 'Catálogo local (em etapas)'
          : backgroundIndexStatus === 'waiting'
            ? 'Aguardando o sistema'
            : backgroundIndexStatus === 'error'
              ? 'Falha na última tentativa'
              : 'Catálogo ativo';
  const backgroundIndexBody = !backgroundIndexEnabled
    ? hasGalleryPhotoPermission
      ? 'Ative para autorizar a preparação automática.'
      : 'Ative para permitir o acesso à sua galeria.'
    : backgroundIndexStatus === 'completed'
      ? 'A preparação automática está atualizada.'
      : backgroundIndexStatus === 'running'
        ? 'O catálogo está sendo preparado enquanto o aplicativo está disponível.'
        : backgroundIndexStatus === 'paused'
          ? 'A preparação continua sozinha. Toque em "Preparar novamente" para seguir agora.'
      : backgroundIndexStatus === 'error'
        ? 'A última tentativa falhou. Toque em “Preparar novamente” e confirme o acesso às fotos.'
        : backgroundIndexStatus === 'waiting'
          ? 'A tarefa está registrada e aguarda uma oportunidade do sistema.'
          : 'A preparação automática está autorizada.';
  const lastUpdatedAt =
    backgroundIndexState.lastCompletedAt ?? backgroundIndexState.lastStartedAt;
  const formattedLastUpdated = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : 'Ainda não';
  const progressValue =
    backgroundIndexState.totalAssets && backgroundIndexState.totalAssets > 0
      ? Math.min(
          1,
          backgroundIndexState.processedAssets / backgroundIndexState.totalAssets,
        )
      : backgroundIndexStatus === 'completed'
        ? 1
        : 0;

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
      INDEX_CLEAR_ALERT_TITLE,
      INDEX_CLEAR_ALERT_MESSAGE,
      createIndexClearAlertOptions(() => {
        void clearIndexWithFeedback(onClearIndex, {
          onStart: () => {
            setIsClearing(true);
            setClearError(null);
          },
          onError: setClearError,
          onFinish: () => {
            setIsClearing(false);
          },
        });
      }),
    );
  };

  const handleSendFeedback = () => {
    const url = 'mailto:suporte@buscafacial.local?subject=Feedback%20Busca%20Facial%20Local';
    Linking.openURL(url).catch(() => {
      Alert.alert('Suporte', 'Envie seu feedback para suporte@buscafacial.local');
    });
  };

  const handleRateApp = () => {
    const url =
      Platform.OS === 'android'
        ? 'market://details?id=com.buscafacial.local'
        : 'https://play.google.com/store/apps/details?id=com.buscafacial.local';
    Linking.openURL(url).catch(() => {
      Alert.alert('Avaliação', 'Obrigado pelo seu apoio ao Busca Facial Local!');
    });
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
                  Configurações
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityLabel="Fechar configurações"
              accessibilityRole="button"
              hitSlop={12}
              onPress={onClose}
              testID={INDEX_SETTINGS_TEST_IDS.close}
            >
              <Feather name="x" size={21} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {isWaitingForOperation ? (
              <View
                style={[
                  styles.operationCard,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
                accessibilityLiveRegion="polite"
              >
                <ActivityIndicator color={colors.primary} size="small" />
                <View style={styles.operationCopy}>
                  <Text style={[styles.operationTitle, { color: colors.foreground }]}>
                    Limpeza indisponível durante a {operationLabel}
                  </Text>
                  <Text style={[styles.operationBody, { color: colors.mutedForeground }]}>
                    {progressLabel} O índice atual não será apagado enquanto ela estiver ativa.
                  </Text>
                </View>
              </View>
            ) : null}

            {clearError ? (
              <Text
                style={styles.errorText}
                accessibilityRole="alert"
                accessibilityLabel={INDEX_CLEAR_ERROR_MESSAGE}
                accessibilityLiveRegion="polite"
              >
                {clearError}
              </Text>
            ) : null}

            <View
              style={[
                styles.backgroundIndexCard,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={[styles.backgroundIndexIcon, { backgroundColor: colors.accent }]}>
                <Feather
                  name={backgroundIndexEnabled ? 'activity' : 'pause-circle'}
                  size={17}
                  color={colors.primary}
                />
              </View>
              <View style={styles.backgroundIndexCopy}>
                <Text style={[styles.backgroundIndexTitle, { color: colors.foreground }]}>
                  {backgroundIndexTitle}
                </Text>
                <Text style={[styles.backgroundIndexBody, { color: colors.mutedForeground }]}>
                  {backgroundIndexBody}
                </Text>
              </View>
              <View style={styles.backgroundIndexControl}>
                <Text style={[styles.backgroundIndexControlLabel, { color: colors.mutedForeground }]}>
                  {backgroundIndexEnabled ? 'Parar catálogo' : 'Ativar catálogo'}
                </Text>
                <Switch
                  accessibilityLabel="Permitir preparação automática"
                  disabled={isBackgroundIndexUpdating}
                  onValueChange={onBackgroundIndexToggle}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={backgroundIndexEnabled ? colors.primaryForeground : colors.mutedForeground}
                  value={backgroundIndexEnabled}
                  testID={INDEX_SETTINGS_TEST_IDS.backgroundIndexToggle}
                />
              </View>
            </View>

            <View
              style={[
                styles.backgroundIndexDetails,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.backgroundIndexDetailsHeader}>
                <View style={styles.backgroundIndexDetailsHeading}>
                  <Feather name="database" size={16} color={colors.primary} />
                  <Text style={[styles.backgroundIndexDetailsTitle, { color: colors.foreground }]}>
                    Estado do catálogo local
                  </Text>
                </View>
                {backgroundIndexStatus === 'running' ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : null}
              </View>
              <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: colors.primary,
                      width: `${Math.round(progressValue * 100)}%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.backgroundIndexMetrics}>
                <View style={styles.backgroundIndexMetric}>
                  <Text style={[styles.backgroundIndexMetricValue, { color: colors.foreground }]}>
                    {String(backgroundIndexState.processedAssets)}
                  </Text>
                  <Text style={[styles.backgroundIndexMetricLabel, { color: colors.mutedForeground }]}>
                    fotos analisadas
                  </Text>
                </View>
                <View style={styles.backgroundIndexMetric}>
                  <Text style={[styles.backgroundIndexMetricValue, { color: colors.foreground }]}>
                    {String(stats.indexedFaces)}
                  </Text>
                  <Text style={[styles.backgroundIndexMetricLabel, { color: colors.mutedForeground }]}>
                    rostos encontrados
                  </Text>
                </View>
                <View style={styles.backgroundIndexMetric}>
                  <Text
                    numberOfLines={2}
                    style={[styles.backgroundIndexMetricValue, { color: colors.foreground }]}
                  >
                    {formattedLastUpdated}
                  </Text>
                  <Text style={[styles.backgroundIndexMetricLabel, { color: colors.mutedForeground }]}>
                    última atualização
                  </Text>
                </View>
              </View>
              <View style={styles.backgroundIndexActions}>
                {backgroundIndexEnabled ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Pausar preparação"
                    disabled={isBackgroundIndexUpdating}
                    onPress={() => onBackgroundIndexToggle(false)}
                    style={({ pressed }) => [
                      styles.secondaryActionButton,
                      { borderColor: colors.border },
                      isBackgroundIndexUpdating ? styles.disabled : null,
                      pressed ? styles.pressed : null,
                    ]}
                    testID={INDEX_SETTINGS_TEST_IDS.backgroundIndexPause}
                  >
                    <Feather name="pause" size={15} color={colors.foreground} />
                    <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>
                      Pausar preparação
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Preparar novamente"
                  disabled={isBackgroundIndexUpdating}
                  onPress={() => onBackgroundIndexToggle(true)}
                  style={({ pressed }) => [
                    styles.primaryActionButton,
                    { backgroundColor: colors.primary },
                    isBackgroundIndexUpdating ? styles.disabled : null,
                    pressed ? styles.pressed : null,
                  ]}
                  testID={INDEX_SETTINGS_TEST_IDS.backgroundIndexPrepare}
                >
                  <Feather name="refresh-cw" size={15} color={colors.primaryForeground} />
                  <Text style={[styles.primaryActionText, { color: colors.primaryForeground }]}>
                    Preparar novamente
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.background }]}>
              <Feather name="shield" size={17} color="#34D399" />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                Limpar o catálogo remove somente os dados processados. As fotos da
                galeria permanecem intactas.
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={clearBlocked}
              onPress={clearIndex}
              style={({ pressed }) => [
                styles.clearButton,
                { borderColor: '#7F1D35' },
                isClearing ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}
              testID={INDEX_SETTINGS_TEST_IDS.clear}
            >
              <Feather name="trash-2" size={17} color="#FB7185" />
              <Text style={styles.clearButtonText}>
                {isClearing
                  ? 'Limpando catálogo…'
                  : isWaitingForOperation
                    ? 'Aguardando operação…'
                    : 'Limpar catálogo local'}
              </Text>
            </Pressable>

            {/* Seção Privacidade & Proteção de Dados */}
            <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
            <Text style={[styles.sectionHeading, { color: colors.foreground }]}>
              Privacidade & Segurança
            </Text>
            <View style={[styles.privacyCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={[styles.privacyIconWrap, { backgroundColor: '#064E3B' }]}>
                <Feather name="shield" size={17} color="#34D399" />
              </View>
              <View style={styles.privacyCopy}>
                <Text style={[styles.privacyTitle, { color: colors.foreground }]}>
                  Processamento 100% Local
                </Text>
                <Text style={[styles.privacyBody, { color: colors.mutedForeground }]}>
                  Seus dados biométricos e fotos nunca saem do seu aparelho. Toda a inferência de IA ocorre exclusivamente no hardware do celular, sem envio a servidores externos ou nuvem.
                </Text>
              </View>
            </View>

            {/* Seção Sobre & Suporte */}
            <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />
            <Text style={[styles.sectionHeading, { color: colors.foreground }]}>
              Sobre & Suporte
            </Text>

            <View style={styles.menuList}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Enviar feedback"
                onPress={handleSendFeedback}
                style={({ pressed }) => [
                  styles.menuItem,
                  { backgroundColor: colors.background, borderColor: colors.border },
                  pressed ? styles.pressed : null,
                ]}
              >
                <View style={[styles.menuItemIconWrap, { backgroundColor: colors.card }]}>
                  <Feather name="message-square" size={16} color={colors.primary} />
                </View>
                <View style={styles.menuItemCopy}>
                  <Text style={[styles.menuItemTitle, { color: colors.foreground }]}>
                    Enviar Feedback
                  </Text>
                  <Text style={[styles.menuItemSubtitle, { color: colors.mutedForeground }]}>
                    Compartilhe ideias ou relate um problema
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Avaliar aplicativo"
                onPress={handleRateApp}
                style={({ pressed }) => [
                  styles.menuItem,
                  { backgroundColor: colors.background, borderColor: colors.border },
                  pressed ? styles.pressed : null,
                ]}
              >
                <View style={[styles.menuItemIconWrap, { backgroundColor: colors.card }]}>
                  <Feather name="star" size={16} color="#FBBF24" />
                </View>
                <View style={styles.menuItemCopy}>
                  <Text style={[styles.menuItemTitle, { color: colors.foreground }]}>
                    Avaliar o Aplicativo
                  </Text>
                  <Text style={[styles.menuItemSubtitle, { color: colors.mutedForeground }]}>
                    Ajude outros usuários na Google Play
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>

              <View style={[styles.menuItem, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={[styles.menuItemIconWrap, { backgroundColor: colors.card }]}>
                  <Feather name="cpu" size={16} color="#6EE7B7" />
                </View>
                <View style={styles.menuItemCopy}>
                  <Text style={[styles.menuItemTitle, { color: colors.foreground }]}>
                    Créditos & Modelos de IA
                  </Text>
                  <Text style={[styles.menuItemSubtitle, { color: colors.mutedForeground }]}>
                    MobileFaceNet + MediaPipe (On-Device Inference)
                  </Text>
                </View>
              </View>

              <View style={[styles.menuItem, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={[styles.menuItemIconWrap, { backgroundColor: colors.card }]}>
                  <Feather name="info" size={16} color={colors.mutedForeground} />
                </View>
                <View style={styles.menuItemCopy}>
                  <Text style={[styles.menuItemTitle, { color: colors.foreground }]}>
                    Versão do Aplicativo
                  </Text>
                  <Text style={[styles.menuItemSubtitle, { color: colors.mutedForeground }]}>
                    v1.0.0 (Release Build)
                  </Text>
                </View>
                <View style={[styles.versionBadge, { backgroundColor: colors.card }]}>
                  <Text style={[styles.versionBadgeText, { color: colors.primary }]}>OFICIAL</Text>
                </View>
              </View>
            </View>
          </ScrollView>
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
    maxHeight: '92%',
    borderWidth: 1,
    borderRadius: 27,
    padding: 22,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 2,
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
  operationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 15,
    marginTop: 12,
    padding: 12,
  },
  operationCopy: {
    flex: 1,
    gap: 3,
  },
  operationTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  operationBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    lineHeight: 15,
  },
  errorText: {
    color: '#FB7185',
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
  },
  backgroundIndexCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 17,
    marginTop: 14,
    padding: 12,
    gap: 10,
  },
  backgroundIndexIcon: {
    width: 35,
    height: 35,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backgroundIndexCopy: {
    flex: 1,
    gap: 3,
  },
  backgroundIndexTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  backgroundIndexBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    lineHeight: 14,
  },
  backgroundIndexDetails: {
    borderWidth: 1,
    borderRadius: 17,
    marginTop: 10,
    padding: 12,
  },
  backgroundIndexDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backgroundIndexDetailsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backgroundIndexDetailsTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  backgroundIndexMetrics: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  backgroundIndexMetric: {
    flex: 1,
  },
  backgroundIndexMetricValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  backgroundIndexMetricLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    lineHeight: 12,
    marginTop: 3,
  },
  backgroundIndexActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  secondaryActionButton: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  primaryActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  secondaryActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  primaryActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  backgroundIndexControl: {
    alignItems: 'flex-end',
    gap: 2,
  },
  backgroundIndexControlLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
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
  sectionDivider: {
    height: 1,
    marginTop: 22,
    marginBottom: 16,
    opacity: 0.6,
  },
  sectionHeading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    letterSpacing: 0.2,
    marginBottom: 10,
  },
  privacyCard: {
    borderWidth: 1,
    borderRadius: 17,
    padding: 13,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  privacyIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyCopy: {
    flex: 1,
    gap: 4,
  },
  privacyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  privacyBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
  menuList: {
    gap: 8,
  },
  menuItem: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemCopy: {
    flex: 1,
    gap: 2,
  },
  menuItemTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  menuItemSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
  },
  versionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  versionBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.75,
  },
});