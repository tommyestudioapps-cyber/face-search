import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import {
  hasGalleryPhotoPermission,
  requestGalleryPhotoPermission,
} from '@/services/backgroundIndexing/galleryPermission';

interface OnboardingPermissionsProps {
  onComplete: (result: {
    galleryGranted: boolean;
    indexAccepted: boolean;
  }) => void | Promise<void>;
}

type OnboardingStep = 'checking' | 'permission' | 'permission-denied' | 'consent';

function getPermissionSettingsCopy(): string {
  if (Platform.OS !== 'android') {
    return 'O acesso é usado para encontrar rostos nas fotos. Suas imagens permanecem neste aparelho.';
  }

  const androidApi = Number(Platform.Version);
  if (androidApi <= 28) {
    return 'No Android 9 e anteriores, essa permissão pode aparecer nas configurações como “Memória”, não “Galeria”.';
  }
  if (androidApi >= 33) {
    return 'Se precisar alterar o acesso depois, procure a permissão “Fotos e vídeos” nas configurações do app.';
  }
  return 'Se precisar alterar o acesso depois, procure a permissão da galeria nas configurações do app.';
}

export function OnboardingPermissions({
  onComplete,
}: OnboardingPermissionsProps) {
  const colors = useColors();
  const [step, setStep] = useState<OnboardingStep>('checking');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void hasGalleryPhotoPermission()
      .then((granted) => {
        if (!cancelled) {
          setStep(granted ? 'consent' : 'permission');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStep('permission');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const complete = async (result: {
    galleryGranted: boolean;
    indexAccepted: boolean;
  }) => {
    setIsBusy(true);
    setError(null);
    try {
      await onComplete(result);
    } catch {
      setError('Não foi possível salvar sua escolha. Tente novamente.');
    } finally {
      setIsBusy(false);
    }
  };

  const requestPermission = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await requestGalleryPhotoPermission();
      setStep('consent');
    } catch {
      setStep('permission-denied');
    } finally {
      setIsBusy(false);
    }
  };

  const closeWithDecline = () => {
    if (step === 'consent') {
      void complete({ galleryGranted: true, indexAccepted: false });
      return;
    }
    void complete({ galleryGranted: false, indexAccepted: false });
  };

  const isConsentStep = step === 'consent';
  const isDeniedStep = step === 'permission-denied';

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={closeWithDecline}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {step === 'checking' ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                Verificando acesso às fotos…
              </Text>
            </View>
          ) : (
            <>
              <View style={[styles.icon, { backgroundColor: colors.accent }]}>
                <Feather
                  name={isConsentStep ? 'database' : 'image'}
                  size={21}
                  color={colors.primary}
                />
              </View>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {isConsentStep
                  ? 'Preparar índice local?'
                  : isDeniedStep
                    ? 'Acesso não concedido'
                    : 'Permitir acesso às fotos'}
              </Text>
              <Text style={[styles.body, { color: colors.mutedForeground }]}>
                {isConsentStep
                  ? 'O índice organiza os dados dos rostos da sua galeria para acelerar as próximas buscas. A preparação acontece em segundo plano e suas fotos não saem deste aparelho.'
                  : isDeniedStep
                    ? `Sem esse acesso, o índice local não pode ser preparado. ${getPermissionSettingsCopy()}`
                    : `Para encontrar rostos e preparar o índice local, o app precisa ler as fotos da sua galeria. ${getPermissionSettingsCopy()}`}
              </Text>

              {error ? (
                <Text style={[styles.error, { color: colors.destructive }]}>
                  {error}
                </Text>
              ) : null}

              {isConsentStep ? (
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isBusy}
                    onPress={() =>
                      void complete({ galleryGranted: true, indexAccepted: false })
                    }
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      { borderColor: colors.border },
                      pressed ? styles.pressed : null,
                    ]}
                    testID="onboarding-index-decline"
                  >
                    <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
                      Agora não
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isBusy}
                    onPress={() =>
                      void complete({ galleryGranted: true, indexAccepted: true })
                    }
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: colors.primary },
                      pressed ? styles.pressed : null,
                    ]}
                    testID="onboarding-index-accept"
                  >
                    <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                      Preparar índice
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isBusy}
                    onPress={closeWithDecline}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      { borderColor: colors.border },
                      pressed ? styles.pressed : null,
                    ]}
                    testID="onboarding-permission-skip"
                  >
                    <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
                      Continuar sem índice
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isBusy}
                    onPress={() => void requestPermission()}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: colors.primary },
                      pressed ? styles.pressed : null,
                    ]}
                    testID={
                      isDeniedStep
                        ? 'onboarding-permission-retry'
                        : 'onboarding-gallery-permission'
                    }
                  >
                    {isBusy ? (
                      <ActivityIndicator color={colors.primaryForeground} />
                    ) : (
                      <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                        {isDeniedStep ? 'Tentar novamente' : 'Permitir acesso'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,4,12,0.75)',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
  },
  icon: {
    width: 45,
    height: 45,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    letterSpacing: -0.4,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondaryButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    textAlign: 'center',
  },
  primaryButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
  loading: {
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  error: {
    marginTop: 12,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
});