import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface PhotoViewerProps {
  photos?: string[];
  initialIndex?: number;
  uri?: string | null;
  visible: boolean;
  onClose: () => void;
}

interface ZoomableImageProps {
  uri: string;
  width: number;
  height: number;
  isActive: boolean;
  onZoomChange: (zoomed: boolean) => void;
}

const ZoomableImage = React.memo(function ZoomableImage({
  uri,
  width,
  height,
  isActive,
  onZoomChange,
}: ZoomableImageProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const startPan = useRef({ x: 0, y: 0 });
  const initialDist = useRef(0);
  const baseScale = useRef(1);
  const lastTap = useRef(0);

  const resetZoom = useCallback(() => {
    scaleRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }),
    ]).start(() => {
      onZoomChange(false);
    });
  }, [scale, pan, onZoomChange]);

  useEffect(() => {
    if (!isActive && scaleRef.current !== 1) {
      resetZoom();
    }
  }, [isActive, resetZoom]);

  const toggleDoubleTap = () => {
    if (scaleRef.current > 1.2) {
      resetZoom();
    } else {
      scaleRef.current = 2.5;
      onZoomChange(true);
      Animated.spring(scale, {
        toValue: 2.5,
        useNativeDriver: true,
        friction: 7,
      }).start();
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (evt) => {
          // Intercepta imediatamente se houver 2 dedos, impedindo que a FlatList roube o gesto
          return evt.nativeEvent.touches.length >= 2;
        },
        onMoveShouldSetPanResponderCapture: (evt) => {
          return evt.nativeEvent.touches.length >= 2;
        },
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (evt, gestureState) => {
          if (evt.nativeEvent.touches.length >= 2) return true;
          if (scaleRef.current > 1.05) {
            return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
          }
          return false;
        },
        onPanResponderGrant: (evt) => {
          if (evt.nativeEvent.touches.length >= 2) {
            onZoomChange(true);
            const [t0, t1] = evt.nativeEvent.touches;
            initialDist.current = Math.hypot(t0.pageX - t1.pageX, t0.pageY - t1.pageY);
            baseScale.current = scaleRef.current;
          }
          startPan.current = { x: panRef.current.x, y: panRef.current.y };
        },
        onPanResponderMove: (evt, gestureState) => {
          if (evt.nativeEvent.touches.length >= 2) {
            const [t0, t1] = evt.nativeEvent.touches;
            const currentDist = Math.hypot(t0.pageX - t1.pageX, t0.pageY - t1.pageY);
            if (initialDist.current > 0) {
              const newScale = Math.min(
                Math.max(baseScale.current * (currentDist / initialDist.current), 1),
                4.5,
              );
              scaleRef.current = newScale;
              scale.setValue(newScale);
              if (newScale > 1.05) {
                onZoomChange(true);
              }
            }
          } else if (evt.nativeEvent.touches.length === 1 && scaleRef.current > 1.05) {
            const newX = startPan.current.x + gestureState.dx;
            const newY = startPan.current.y + gestureState.dy;
            panRef.current = { x: newX, y: newY };
            pan.setValue({ x: newX, y: newY });
          }
        },
        onPanResponderRelease: (evt, gestureState) => {
          initialDist.current = 0;

          // Detectar toque duplo direto no responder se houve pouco movimento
          const movedDist = Math.hypot(gestureState.dx, gestureState.dy);
          if (movedDist < 8 && evt.nativeEvent.touches.length === 0) {
            const now = Date.now();
            if (now - lastTap.current < 300) {
              lastTap.current = 0;
              toggleDoubleTap();
              return;
            }
            lastTap.current = now;
          }

          if (scaleRef.current <= 1.05) {
            resetZoom();
          } else {
            const maxX = (width * (scaleRef.current - 1)) / 2;
            const maxY = (height * (scaleRef.current - 1)) / 2;
            const clampedX = Math.min(Math.max(panRef.current.x, -maxX), maxX);
            const clampedY = Math.min(Math.max(panRef.current.y, -maxY), maxY);
            panRef.current = { x: clampedX, y: clampedY };
            Animated.spring(pan, {
              toValue: { x: clampedX, y: clampedY },
              useNativeDriver: true,
              friction: 7,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          initialDist.current = 0;
          if (scaleRef.current <= 1.05) {
            resetZoom();
          }
        },
      }),
    [width, height, scale, pan, onZoomChange, resetZoom],
  );

  return (
    <View
      style={{ width, height, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}
      {...panResponder.panHandlers}
    >
      <Pressable
        onPress={() => {
          const now = Date.now();
          if (now - lastTap.current < 300) {
            lastTap.current = 0;
            toggleDoubleTap();
          } else {
            lastTap.current = now;
          }
        }}
        style={{ width, height, justifyContent: 'center', alignItems: 'center' }}
      >
        <Animated.View
          style={{
            width,
            height,
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { scale },
            ],
          }}
        >
          <Image
            source={{ uri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
          />
        </Animated.View>
      </Pressable>
    </View>
  );
});

export function PhotoViewer({ photos, initialIndex = 0, uri, visible, onClose }: PhotoViewerProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const photoList = useMemo(() => {
    if (photos && photos.length > 0) return photos;
    if (uri) return [uri];
    return [];
  }, [photos, uri]);

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isZoomed, setIsZoomed] = useState(false);
  const flatListRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (visible && photoList.length > 0) {
      const targetIndex = Math.min(Math.max(initialIndex, 0), photoList.length - 1);
      setCurrentIndex(targetIndex);
      setIsZoomed(false);
      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({ index: targetIndex, animated: false });
        } catch {
          // flatListRef pode ainda não ter finalizado medição inicial
        }
      }, 60);
    }
  }, [visible, initialIndex, photoList.length]);

  const currentPhoto = photoList[currentIndex] ?? null;

  const sharePhoto = async (targetUri: string) => {
    if (!targetUri) return;

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          'Compartilhamento indisponível',
          'Este dispositivo não oferece uma opção de compartilhamento para esta foto.',
        );
        return;
      }

      let shareableUri = targetUri;
      // No Android 11+ (Scoped Storage), arquivos em storage/emulated ou content://
      // precisam ser copiados para o cache do app para o FileProvider do Android
      // conseguir compartilhar via Sharesheet nativo sem violação de permissão.
      try {
        const isPng = targetUri.toLowerCase().endsWith('.png');
        const extension = isPng ? 'png' : 'jpg';
        const sourceFile = new File(targetUri);
        const cacheFile = new File(Paths.cache, `shared_photo_${Date.now()}.${extension}`);
        sourceFile.copy(cacheFile);
        shareableUri = cacheFile.uri;
      } catch (copyErr) {
        console.warn('[Share] Cópia para cache falhou, usando URI original:', copyErr);
      }

      await Sharing.shareAsync(shareableUri, {
        mimeType: shareableUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
        dialogTitle: 'Compartilhar foto',
        UTI: 'public.jpeg',
      });
    } catch (err) {
      console.warn('[Share] Erro ao abrir sharesheet:', err);
      Alert.alert(
        'Não foi possível compartilhar',
        'Tente compartilhar esta foto novamente.',
      );
    }
  };

  const handleZoomChange = useCallback((zoomed: boolean) => {
    setIsZoomed(zoomed);
  }, []);

  return (
    <>
      <StatusBar hidden={visible} />
      <Modal
        visible={visible}
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <View style={styles.backdrop}>
          <FlatList
            ref={flatListRef}
            data={photoList}
            horizontal
            pagingEnabled
            scrollEnabled={!isZoomed}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={
              initialIndex >= 0 && initialIndex < photoList.length ? initialIndex : 0
            }
            getItemLayout={(_, index) => ({
              length: windowWidth,
              offset: windowWidth * index,
              index,
            })}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
              }, 100);
            }}
            onMomentumScrollEnd={(e) => {
              const nextIndex = Math.round(e.nativeEvent.contentOffset.x / windowWidth);
              if (nextIndex >= 0 && nextIndex < photoList.length) {
                setCurrentIndex(nextIndex);
              }
            }}
            keyExtractor={(item, index) => `${item}_${index}`}
            renderItem={({ item, index }) => (
              <ZoomableImage
                uri={item}
                width={windowWidth}
                height={windowHeight}
                isActive={index === currentIndex}
                onZoomChange={handleZoomChange}
              />
            )}
            removeClippedSubviews
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={5}
          />

          <View
            pointerEvents="box-none"
            style={[styles.topBar, { paddingTop: insets.top + 8 }]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar foto"
              hitSlop={8}
              onPress={onClose}
              style={styles.actionButton}
            >
              <Feather name="x" size={23} color="#FFFFFF" />
            </Pressable>

            {photoList.length > 1 ? (
              <View style={styles.counterBadge}>
                <Text style={styles.counterText}>
                  {`${currentIndex + 1} de ${photoList.length}`}
                </Text>
              </View>
            ) : (
              <View style={styles.actionButtonPlaceholder} />
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Compartilhar foto"
              disabled={!currentPhoto}
              hitSlop={8}
              onPress={() => currentPhoto && void sharePhoto(currentPhoto)}
              style={styles.actionButton}
            >
              <Feather name="share-2" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  counterBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.3,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  actionButtonPlaceholder: {
    width: 44,
    height: 44,
  },
});
