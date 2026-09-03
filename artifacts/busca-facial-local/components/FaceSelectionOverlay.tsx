import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DetectedFace } from '@/services/faceCapture';

interface FaceSelectionOverlayProps {
  faces: DetectedFace[];
  selectedFaceId: number | null;
  imageWidth: number;
  imageHeight: number;
  onSelect: (faceId: number) => void;
}

export function FaceSelectionOverlay({
  faces,
  selectedFaceId,
  imageWidth,
  imageHeight,
  onSelect,
}: FaceSelectionOverlayProps) {
  const sourceAspectRatio = imageWidth / imageHeight;
  const displayedWidth = sourceAspectRatio < 1 ? sourceAspectRatio * 100 : 100;
  const displayedHeight = sourceAspectRatio > 1 ? (100 / sourceAspectRatio) : 100;
  const horizontalOffset = (100 - displayedWidth) / 2;
  const verticalOffset = (100 - displayedHeight) / 2;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {faces.map((face) => {
        const selected = face.id === selectedFaceId;
        const accepted = face.quality.accepted;
        return (
          <Pressable
            key={face.id}
            accessibilityRole="button"
            accessibilityLabel={`Rosto ${face.id + 1}${accepted ? '' : ', qualidade insuficiente'}`}
            onPress={() => onSelect(face.id)}
            style={[
              styles.faceBox,
              {
                left: `${horizontalOffset + face.bounds.minX * displayedWidth}%`,
                top: `${verticalOffset + face.bounds.minY * displayedHeight}%`,
                width: `${face.bounds.width * displayedWidth}%`,
                height: `${face.bounds.height * displayedHeight}%`,
              },
              accepted ? styles.accepted : styles.rejected,
              selected ? styles.selected : null,
            ]}
            testID={`detected-face-${face.id}`}
          >
            <View style={[styles.label, selected ? styles.selectedLabel : null]}>
              <Text style={styles.labelText}>{selected ? 'Selecionado' : `Rosto ${face.id + 1}`}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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