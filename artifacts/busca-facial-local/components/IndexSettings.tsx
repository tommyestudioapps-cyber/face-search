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
import {
  isIgnoringBatteryOptimizations,
  openBatteryOptimizationSettings,
  requestBatteryOptimizationExemption,
} from '@/services/backgroundIndexing/foregroundService';
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
  getOemBatteryGuidance,
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
  const [batteryExempt, setBatteryExempt] = useState<boolean>(() =>
    Platform.OS === 'android' ? isIgnoringBatteryOptimizations() : true,
  );

  const oemGuidance = useMemo(() => {
    const constants = (Platform as {
      constants?: { Manufacturer?: string; Brand?: string };
    }).constants;
    return getOemBatteryGuidance(constants?.Manufacturer, constants?.Brand);
  }, []);

  const refreshBatteryStatus = useCallback(() => {
    if (Platform.OS !== 'android') return;
    setBatteryExempt(isIgnoringBatteryOptimizations());
  }, []);
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
    ? 'Índice pausado'
    : backgroundIndexStatus === 'completed'
      ? 'Índice local preparado'
      : backgroundIndexStatus === 'running'
        ? 'Preparando índice'
        : backgroundIndexStatus === 'paused'
          ? 'Preparando índice (em etapas)'
          : backgroundIndexStatus === 'waiting'
            ? 'Aguardando o sistema'
            : backgroundIndexStatus === 'error'
              ? 'Falha na última tentativa'
              : 'Índice ativo';
  const backgroundIndexBody = !backgroundIndexEnabled
    ? hasGalleryPhotoPermission
      ? 'Ative para autorizar a preparação automática.'
      : 'Ative para permitir o acesso à sua galeria.'
    : backgroundIndexStatus === 'completed'
      ? 'A preparação automática está atualizada.'
      : backgroundIndexStatus === 'running'
        ? 'O índice está sendo preparado enquanto o aplicativo está disponível.'
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
      refreshBatteryStatus();
    }
  }, [visible, refreshBatteryStatus]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return undefined;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshBatteryStatus();
      }
    });
    return () => subscription.remove();
  }, [visible, refreshBatteryStatus]);

  const handleBatteryExemptionPress = () => {
    const opened = requestBatteryOptimizationExemption();
    if (!opened) {
      const settingsOpened = openBatteryOptimizationSettings();
      if (!settingsOpened) {
        void Linking.openSettings();
      }
    }
    setTimeout(refreshBatteryStatus, 800);
  };

  const handleOpenAppSettingsPress = () => {
    const opened = openBatteryOptimizationSettings();
    if (!opened) {
      void Linking.openSettings();
    }
  };

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
                  {backgroundIndexEnabled ? 'Parar índice' : 'Ativar índice'}
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
                    Estado do índice local
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

            {Platform.OS === 'android' ? (
              <View
                style={[
                  styles.batteryCard,
                  {
                    backgroundColor: colors.background,
                    borderColor: batteryExempt ? colors.border : '#F59E0B',
                  },
                ]}
              >
                <View style={styles.batteryHeader}>
                  <View
                    style={[
                      styles.batteryIconWrap,
                      {
                        backgroundColor: batteryExempt ? '#123429' : '#3B2811',
                      },
                    ]}
                  >
                    <Feather
                      name={batteryExempt ? 'check-circle' : 'battery-charging'}
                      size={16}
                      color={batteryExempt ? '#34D399' : '#FBBF24'}
                    />
                  </View>
                  <View style={styles.batteryHeaderCopy}>
                    <Text style={[styles.batteryTitle, { color: colors.foreground }]}>
                      {batteryExempt
                        ? 'Execução em 2º plano liberada'
                        : 'Economia de bateria limitando o 2º plano'}
                    </Text>
                    <Text style={[styles.batterySubtitle, { color: colors.mutedForeground }]}>
                      {`Perfil detectado: ${oemGuidance.oemLabel}`}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.batteryBody, { color: colors.mutedForeground }]}>
                  {batteryExempt
                    ? 'A isenção padrão do Android está ativa. Se a análise pausar com a tela apagada no seu aparelho, confira também as opções do fabricante:'
                    : 'Com a otimização de bateria ativa, o sistema suspende o processador quando a tela apaga e pausa a preparação do índice:'}
                </Text>

                <View style={styles.batterySteps}>
                  {oemGuidance.steps.map((step, index) => (
                    <Text
                      key={step}
                      style={[styles.batteryStepText, { color: colors.mutedForeground }]}
                    >
                      {`${index + 1}. ${step}`}
                    </Text>
                  ))}
                </View>

                <View style={styles.batteryActions}>
                  {!batteryExempt ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Liberar execução em segundo plano"
                      onPress={handleBatteryExemptionPress}
                      style={({ pressed }) => [
                        styles.primaryActionButton,
                        { backgroundColor: '#F59E0B' },
                        pressed ? styles.pressed : null,
                      ]}
                      testID="battery-exemption-request"
                    >
                      <Feather name="zap" size={15} color="#080B14" />
                      <Text style={[styles.primaryActionText, { color: '#080B14' }]}>
                        Liberar execução em 2º plano
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Abrir configurações de bateria"
                    onPress={handleOpenAppSettingsPress}
                    style={({ pressed }) => [
                      styles.secondaryActionButton,
                      { borderColor: colors.border },
                      pressed ? styles.pressed : null,
                    ]}
                    testID="battery-settings-open"
                  >
                    <Feather name="settings" size={15} color={colors.foreground} />
                    <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>
                      Configurações de bateria
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={[styles.infoCard, { backgroundColor: colors.background }]}>
              <Feather name="shield" size={17} color="#34D399" />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
                Limpar o índice remove somente os dados processados. As fotos da
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
                  ? 'Limpando índice…'
                  : isWaitingForOperation
                    ? 'Aguardando operação…'
                    : 'Limpar índice local'}
              </Text>
            </Pressable>
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
  batteryCard: {
    borderWidth: 1,
    borderRadius: 17,
    marginTop: 10,
    padding: 12,
    gap: 8,
  },
  batteryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  batteryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  batteryHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  batteryTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  batterySubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  batteryBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    lineHeight: 14,
  },
  batterySteps: {
    gap: 4,
  },
  batteryStepText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    lineHeight: 14,
  },
  batteryActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
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