import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PhotoViewerProps {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
}

interface ImageSize {
  width: number;
  height: number;
}

interface StageSize {
  width: number;
  height: number;
}

interface ImageBounds extends ImageSize {
  left: number;
  top: number;
}

export function PhotoViewer({ uri, visible, onClose }: PhotoViewerProps) {
  const insets = useSafeAreaInsets();
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);

  useEffect(() => {
    setImageSize(null);
  }, [uri]);

  let imageBounds: ImageBounds | null = null;
  if (
    imageSize &&
    stageSize.width > 0 &&
    stageSize.height > 0 &&
    imageSize.width > 0 &&
    imageSize.height > 0
  ) {
    const scale = Math.min(
      stageSize.width / imageSize.width,
      stageSize.height / imageSize.height,
    );
    const width = imageSize.width * scale;
    const height = imageSize.height * scale;
    imageBounds = {
      width,
      height,
      left: (stageSize.width - width) / 2,
      top: (stageSize.height - height) / 2,
    };
  }

  const sharePhoto = async () => {
    if (!uri) return;

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          'Compartilhamento indisponível',
          'Este dispositivo não oferece uma opção de compartilhamento para esta foto.',
        );
        return;
      }
      await Sharing.shareAsync(uri);
    } catch {
      Alert.alert(
        'Não foi possível compartilhar',
        'Tente compartilhar esta foto novamente.',
      );
    }
  };

  return (
    <>
      <StatusBar hidden={visible} />
      <Modal
        visible={visible}
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <View
          style={styles.backdrop}
          onLayout={({ nativeEvent }) => {
            const { width, height } = nativeEvent.layout;
            setStageSize((current) =>
              current.width === width && current.height === height
                ? current
                : { width, height },
            );
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar visualização"
            style={StyleSheet.absoluteFill}
            onPress={(event) => {
              if (!imageBounds) {
                onClose();
                return;
              }

              const { locationX, locationY } = event.nativeEvent;
              const insideImage =
                locationX >= imageBounds.left &&
                locationX <= imageBounds.left + imageBounds.width &&
                locationY >= imageBounds.top &&
                locationY <= imageBounds.top + imageBounds.height;
              if (!insideImage) onClose();
            }}
          />
          {uri ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Image
                key={uri}
                source={{ uri }}
                resizeMode="contain"
                onLoad={({ nativeEvent }) => {
                  const { width, height } = nativeEvent.source;
                  if (width > 0 && height > 0) setImageSize({ width, height });
                }}
                style={[
                  styles.image,
                  imageBounds
                    ? imageBounds
                    : StyleSheet.absoluteFillObject,
                ]}
              />
            </View>
          ) : null}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Compartilhar foto"
              disabled={!uri}
              hitSlop={8}
              onPress={() => void sharePhoto()}
              style={styles.actionButton}
            >
              <Feather name="share" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000' },
  image: { position: 'absolute' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 1,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});