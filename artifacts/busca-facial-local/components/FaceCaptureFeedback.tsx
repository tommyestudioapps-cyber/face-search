import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { FaceCaptureError } from '@/services/faceCapture';

interface FaceCaptureFeedbackProps {
  isProcessing: boolean;
  error: FaceCaptureError | null;
  faceCount: number;
  hasAlignedFace: boolean;
}

function getErrorMessage(error: FaceCaptureError): string {
  switch (error.code) {
    case 'web-unsupported':
      return 'A captura real funciona no APK instalado.';
    case 'no-face':
      return 'Nenhum rosto foi encontrado. Use uma foto nítida e bem iluminada.';
    case 'multiple-faces':
      return 'Selecione um dos rostos detectados para continuar.';
    case 'quality-rejected':
      return error.message;
    case 'model-unavailable':
      return 'O modelo facial não está disponível neste APK.';
    case 'native-module-unavailable':
      return 'O módulo facial não está disponível neste APK de desenvolvimento.';
    case 'invalid-image':
      return 'Não foi possível preparar esta imagem.';
    case 'cancelled':
      return 'A captura foi cancelada.';
    default:
      return 'Não foi possível analisar o rosto. Tente outra imagem.';
  }
}

export function FaceCaptureFeedback({
  isProcessing,
  error,
  faceCount,
  hasAlignedFace,
}: FaceCaptureFeedbackProps) {
  const colors = useColors();

  if (isProcessing) {
    return (
      <View style={[styles.feedback, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ActivityIndicator color={colors.primary} size="small" />
        <Text style={[styles.text, { color: colors.mutedForeground }]}>Detectando e alinhando o rosto…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.feedback, styles.errorFeedback, { borderColor: colors.border }]}>
        <Feather name="alert-circle" size={17} color="#FBBF24" />
        <Text style={[styles.text, { color: colors.foreground }]}>{getErrorMessage(error)}</Text>
      </View>
    );
  }

  if (hasAlignedFace) {
    return (
      <View style={[styles.feedback, styles.successFeedback, { borderColor: colors.border }]}>
        <Feather name="check-circle" size={17} color="#34D399" />
        <Text style={[styles.text, { color: colors.foreground }]}>Rosto capturado e alinhado.</Text>
      </View>
    );
  }

  if (faceCount > 1) {
    return (
      <View style={[styles.feedback, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="users" size={17} color={colors.primary} />
        <Text style={[styles.text, { color: colors.mutedForeground }]}>Toque no rosto que deseja selecionar.</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  feedback: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  errorFeedback: {
    backgroundColor: '#332718',
  },
  successFeedback: {
    backgroundColor: '#123429',
  },
  text: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  faceBox: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 12,
    padding: 3,
  },
  accepted: {
    borderColor: '#34D399',
  },
  rejected: {
    borderColor: '#FBBF24',
  },
  selected: {
    borderColor: '#A5B4FC',
    borderWidth: 3,
  },
  label: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    backgroundColor: '#111827CC',
  },
  selectedLabel: {
    backgroundColor: '#4F46E5',
  },
  labelText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
  },
});