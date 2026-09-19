import { Feather } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { IndexedPhoto } from '@/services/faceSearch';

interface IndexedGalleryProps {
  photos: IndexedPhoto[];
  isLoading: boolean;
  onBack: () => void;
}

export function IndexedGallery({
  photos,
  isLoading,
  onBack,
}: IndexedGalleryProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { contentWidth, numColumns } = useResponsiveLayout();

  const renderItem = ({ item }: { item: IndexedPhoto }) => (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Image
        source={{ uri: item.uri }}
        style={styles.thumbnail}
        resizeMode="cover"
      />
      <View style={styles.cardBody}>
        <Text
          numberOfLines={1}
          style={[styles.filename, { color: colors.foreground }]}
        >
          {item.filename ?? 'Foto da galeria'}
        </Text>
        <View style={styles.badgeRow}>
          <Feather name="user" size={11} color="#34D399" />
          <Text style={styles.badgeText}>
            {item.faceCount === 1
              ? '1 rosto'
              : `${item.faceCount} rostos`}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable onPress={onBack} hitSlop={14} testID="indexed-back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Fotos indexadas
          </Text>
          <Text
            style={[styles.headerSubtitle, { color: colors.mutedForeground }]}
          >
            {photos.length === 1
              ? '1 foto processada neste aparelho'
              : `${photos.length} fotos processadas neste aparelho`}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading && photos.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text
            style={[styles.loadingText, { color: colors.mutedForeground }]}
          >
            Carregando índice local…
          </Text>
        </View>
      ) : (
        <FlatList
          key={`indexed-${numColumns}`}
          data={photos}
          keyExtractor={(item) => item.assetId}
          numColumns={numColumns}
          contentContainerStyle={[
            styles.list,
            {
              width: contentWidth,
              alignSelf: 'center',
              paddingBottom: insets.bottom + 28,
            },
          ]}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Feather
                name="image"
                size={34}
                color={colors.mutedForeground}
              />
              <Text
                style={[styles.emptyTitle, { color: colors.foreground }]}
              >
                Nenhuma foto indexada
              </Text>
              <Text
                style={[styles.emptyBody, { color: colors.mutedForeground }]}
              >
                Faça uma busca para que o app processe sua galeria local.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: 78,
    paddingHorizontal: 22,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCopy: { flex: 1 },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 3,
  },
  headerSpacer: { width: 22 },
  list: { paddingTop: 13 },
  row: { gap: 12, marginBottom: 12 },
  card: { flex: 1, borderRadius: 17, overflow: 'hidden', borderWidth: 1 },
  thumbnail: { width: '100%', aspectRatio: 1 },
  cardBody: { padding: 10, gap: 6 },
  filename: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  badgeText: {
    color: '#6EE7B7',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingTop: 80,
    gap: 12,
  },
  loadingText: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    marginTop: 10,
  },
  emptyBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});