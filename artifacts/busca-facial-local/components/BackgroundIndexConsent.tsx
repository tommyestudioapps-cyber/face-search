import { Feather } from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';

interface BackgroundIndexConsentProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function BackgroundIndexConsent({
  visible,
  onAccept,
  onDecline,
}: BackgroundIndexConsentProps) {
  const colors = useColors();

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onDecline}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: colors.accent }]}>
            <Feather name="database" size={21} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Preparar índice local?
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            O índice organiza os dados dos rostos da sua galeria para acelerar
            as próximas buscas. Ao aceitar, a preparação acontece em segundo
            plano e suas fotos não saem deste aparelho.
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onDecline}
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: colors.border },
                pressed ? styles.pressed : null,
              ]}
              testID="background-index-decline"
            >
              <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
                Recusar
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onAccept}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primary },
                pressed ? styles.pressed : null,
              ]}
              testID="background-index-accept"
            >
              <Text style={styles.primaryButtonText}>Aceitar</Text>
            </Pressable>
          </View>
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
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },
});