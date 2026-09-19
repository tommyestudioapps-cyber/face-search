import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import { useColors } from '@/hooks/useColors';

export interface AlbumOption {
  id: string | null;
  title: string;
  count: number | null;
}

interface AlbumPickerProps {
  visible: boolean;
  selectedAlbumId: string | null;
  onSelect: (album: AlbumOption) => void;
  onClose: () => void;
}

const ALL_DEVICE_ID = '__all__';

export function AlbumPicker({
  visible,
  selectedAlbumId,
  onSelect,
  onClose,
}: AlbumPickerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [albums, setAlbums] = useState<AlbumOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
        if (!permission.granted) {
          const requested = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
          if (!requested.granted) {
            throw new Error('Permissão de galeria negada');
          }
        }

        const [albumsList, totalAssets] = await Promise.all([
          MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true }),
          MediaLibrary.getAssetsAsync({
            first: 1,
            mediaType: MediaLibrary.MediaType.photo,
          }),
        ]);

        if (cancelled) return;

        const options: AlbumOption[] = [
          {
            id: null,
            title: 'Todo o dispositivo',
            count: totalAssets.totalCount,
          },
          ...albumsList
            .filter((album) => album.assetCount > 0)
            .sort((a, b) => b.assetCount - a.assetCount)
            .map((album) => ({
              id: album.id,
              title: album.title,
              count: album.assetCount,
            })),
        ];

        setAlbums(options);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar pastas');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleSelect = (album: AlbumOption) => {
    onSelect(album);
    onClose();
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
              maxHeight: '80%',
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                Escolher pasta
              </Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Selecione onde buscar o rosto
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} testID="album-picker-close">
              <Feather name="x" size={21} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                Carregando pastas…
              </Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Feather name="alert-circle" size={22} color="#FB7185" />
              <Text style={[styles.errorText, { color: colors.foreground }]}>
                {error}
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {albums.map((album) => {
                const isSelected =
                  (album.id ?? ALL_DEVICE_ID) ===
                  (selectedAlbumId ?? ALL_DEVICE_ID);
                return (
                  <Pressable
                    key={album.id ?? ALL_DEVICE_ID}
                    onPress={() => handleSelect(album)}
                    style={({ pressed }) => [
                      styles.row,
                      { borderColor: colors.border },
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <View
                      style={[
                        styles.rowIcon,
                        {
                          backgroundColor: isSelected
                            ? colors.accent
                            : colors.background,
                        },
                      ]}
                    >
                      <Feather
                        name={album.id ? 'folder' : 'globe'}
                        size={18}
                        color={isSelected ? colors.primary : colors.mutedForeground}
                      />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                        {album.title}
                      </Text>
                      {album.count !== null ? (
                        <Text
                          style={[styles.rowCount, { color: colors.mutedForeground }]}
                        >
                          {album.count} {album.count === 1 ? 'foto' : 'fotos'}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <Feather name="check" size={20} color={colors.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerCopy: { flex: 1 },
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
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.7 },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1 },
  rowTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  rowCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
});