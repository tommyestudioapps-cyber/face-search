import { Alert, ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type {
  FaceIndexProgress,
  FaceRecognitionError,
  SearchProgressEvent,
} from '@/services/faceSearch';
import type { FaceSearchStatus } from '@/hooks/useFaceSearch';

interface FaceSearchProgressProps {
  progress: FaceIndexProgress;
  status: FaceSearchStatus;
  error: FaceRecognitionError | null;
  matchCount: number;
  searchProgress: SearchProgressEvent | null;
  onCancel: () => void;
  onDismiss?: () => void;
}

function getErrorCopy(error: FaceRecognitionError | null) {
  if (error?.code === 'permission-denied') {
    return {
      title: 'Permissão para fotos necessária',
      body: 'Permita o acesso às suas fotos para criar a busca local. Nenhuma foto sai do dispositivo.',
    };
  }
  if (error?.code === 'model-unavailable') {
    return {
      title: 'Modelo facial indisponível',
      body: 'O modelo local não pôde ser carregado neste APK. Tente abrir novamente uma versão de desenvolvimento.',
    };
  }
  return {
    title: 'Não foi possível concluir a busca',
    body: error?.message ?? 'Tente novamente em alguns instantes.',
  };
}

export function FaceSearchProgress({
  progress,
  status,
  error,
  matchCount,
  searchProgress,
  onCancel,
  onDismiss,
}: FaceSearchProgressProps) {
  const colors = useColors();
  const total = progress.totalAssets;
  const percentage = total && total > 0
    ? Math.min(100, Math.round((progress.processedAssets / total) * 100))
    : 0;
  const isActive =
    status === 'loading-model' ||
    status === 'requesting-permission' ||
    status === 'indexing' ||
    status === 'searching';
  const canCancel =
    status === 'requesting-permission' || status === 'indexing';
  const isCancelling = status === 'indexing' && progress.status === 'cancelling';
  const errorCopy = getErrorCopy(error);
  const isTerminalMessage = status === 'cancelled' || status === 'error';

  const confirmCancel = () => {
    Alert.alert(
      'Cancelar indexação?',
      'O índice atual será mantido. A limpeza de fotos removidas só acontece após uma varredura completa.',
      [
        { text: 'Continuar', style: 'cancel' },
        { text: 'Cancelar indexação', style: 'destructive', onPress: onCancel },
      ],
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headingRow}>
        <View style={[styles.icon, { backgroundColor: colors.accent }]}>
          {isActive ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Feather
              name={status === 'error' ? 'alert-circle' : 'database'}
              size={18}
              color={status === 'error' ? colors.destructive : colors.primary}
            />
          )}
        </View>
        <View style={styles.headingCopy}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {status === 'loading-model'
              ? 'Preparando busca facial'
              : status === 'requesting-permission'
                ? 'Permissão necessária'
                : status === 'searching'
                  ? 'Comparando com o índice local'
                  : status === 'completed'
                    ? 'Busca concluída'
                    : 'Preparando índice local'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {status === 'loading-model'
              ? 'Ajustando os vetores para comparar com o índice local.'
              : status === 'requesting-permission'
                ? 'Aguardando permissão para ler suas fotos…'
                : status === 'indexing'
                  ? 'Suas fotos permanecem no dispositivo.'
                : status === 'searching'
                  ? 'Verificando quais fotos contêm o rosto procurado.'
                  : 'Suas fotos permanecem no dispositivo.'}
          </Text>
        </View>
      </View>

      {error ? (
        <View
          accessibilityRole="alert"
          style={[styles.alert, { backgroundColor: colors.background, borderColor: colors.border }]}
        >
          <Text style={[styles.alertTitle, { color: colors.foreground }]}>{errorCopy.title}</Text>
          <Text style={[styles.alertBody, { color: colors.mutedForeground }]}>{errorCopy.body}</Text>
        </View>
      ) : null}

      {!error && status !== 'loading-model' ? (
        <>
          {status === 'searching' && searchProgress ? (
            <>
              <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: colors.primary,
                      width: `${
                        searchProgress.distinctPhotosTotal > 0
                          ? Math.min(
                              100,
                              Math.round(
                                (searchProgress.distinctPhotosProcessed /
                                  searchProgress.distinctPhotosTotal) *
                                  100,
                              ),
                            )
                          : 0
                      }%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.statsRow}>
                <Text style={[styles.stat, { color: colors.mutedForeground }]}>
                  {searchProgress.phaseTotal > 1
                    ? `Rosto ${searchProgress.phase} de ${searchProgress.phaseTotal}: ${searchProgress.distinctPhotosProcessed.toLocaleString('pt-BR')} de ${searchProgress.distinctPhotosTotal.toLocaleString('pt-BR')} fotos`
                    : `${searchProgress.distinctPhotosProcessed.toLocaleString('pt-BR')} de ${searchProgress.distinctPhotosTotal.toLocaleString('pt-BR')} fotos analisadas`}
                </Text>
                <Text style={[styles.stat, { color: colors.foreground }]}>
                  {searchProgress.phaseTotal > 1 &&
                  searchProgress.phase < searchProgress.phaseTotal
                    ? 'Comparando...'
                    : `${searchProgress.matchesSoFar} ${
                        searchProgress.matchesSoFar === 1
                          ? 'foto encontrada'
                          : 'fotos encontradas'
                      }`}
                </Text>
              </View>
            </>
          ) : status === 'searching' ? (
            <View style={styles.statsRow}>
              <Text style={[styles.stat, { color: colors.mutedForeground }]}>
                Preparando comparação…
              </Text>
            </View>
          ) : (
            <>
              <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${percentage}%` }]} />
              </View>
              <View style={styles.statsRow}>
                <Text style={[styles.stat, { color: colors.mutedForeground }]}>
                  {total === null ? 'Fotos: preparando…' : `${progress.processedAssets} de ${total} fotos processadas`}
                </Text>
                <Text style={[styles.stat, { color: colors.foreground }]}>
                  {matchCount} {matchCount === 1 ? 'foto encontrada' : 'fotos encontradas'}
                </Text>
              </View>
            </>
          )}
        </>
      ) : null}

      {canCancel && !isCancelling ? (
        <Pressable
          accessibilityRole="button"
          onPress={confirmCancel}
          style={({ pressed }) => [
            styles.cancelButton,
            { borderColor: colors.border },
            pressed ? styles.pressed : null,
          ]}
          testID="cancel-face-indexing"
        >
          <Feather name="x" size={15} color={colors.foreground} />
          <Text style={[styles.cancelText, { color: colors.foreground }]}>Cancelar indexação</Text>
        </Pressable>
      ) : null}

      {isCancelling ? (
        <Text style={[styles.cancelling, { color: colors.mutedForeground }]}>
          Finalizando com segurança…
        </Text>
      ) : null}

      {isTerminalMessage && onDismiss ? (
        <Pressable
          accessibilityRole="button"
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.dismissButton,
            { backgroundColor: colors.primary },
            pressed ? styles.pressed : null,
          ]}
          testID="dismiss-face-search-progress"
        >
          <Text style={styles.dismissText}>Voltar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 14,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1 },
  title: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 3 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  stat: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  alert: { borderWidth: 1, borderRadius: 13, padding: 11, gap: 3 },
  alertTitle: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  alertBody: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  cancelButton: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  cancelText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cancelling: { textAlign: 'center', fontSize: 11, fontFamily: 'Inter_500Medium' },
  dismissButton: { minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dismissText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.78 },
});