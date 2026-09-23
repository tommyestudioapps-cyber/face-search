import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';
import { useFaceCapture } from '@/hooks/useFaceCapture';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { clearPersistedSession } from '@/services/faceCapture/sessionPersistence';
import { FaceCaptureFeedback } from '@/components/FaceCaptureFeedback';
import { FaceSelectionOverlay } from '@/components/FaceSelectionOverlay';
import { FaceSearchProgress } from '@/components/FaceSearchProgress';
import { IndexSettings } from '@/components/IndexSettings';
import { IndexedGallery } from '@/components/IndexedGallery';
import { GlobalMatchesPanel } from '@/components/GlobalMatchesPanel';
import { BackgroundIndexConsent } from '@/components/BackgroundIndexConsent';
import {
  BACKGROUND_INDEX_DECLINED_MESSAGE,
  getBackgroundIndexConsent,
  setBackgroundIndexConsent,
  type BackgroundIndexConsentStatus,
} from '@/services/backgroundIndexing/consent';
import {
  hasGalleryPhotoPermission,
  requestGalleryPhotoPermission,
} from '@/services/backgroundIndexing/galleryPermission';
import {
  AlbumPicker,
  type AlbumOption,
} from '@/components/AlbumPicker';
import { useFaceSearch, type FaceSearchStatus } from '@/hooks/useFaceSearch';
import type {
  FaceIndexProgress,
  FaceRecognitionError,
  FaceSearchResult,
} from '@/services/faceSearch';
import type {
  DetectedFace,
  FaceCaptureError,
  FaceCaptureStatus,
} from '@/services/faceCapture';

type AppScreen = 'onboarding' | 'home' | 'select' | 'analyzing' | 'results' | 'indexed';

const ALBUM_STORAGE_KEY = 'visage.index.album';

function IconCircle({
  name,
  color,
  size = 20,
  backgroundColor,
}: {
  name: keyof typeof Feather.glyphMap;
  color: string;
  size?: number;
  backgroundColor?: string;
}) {
  return (
    <View style={[styles.iconCircle, backgroundColor ? { backgroundColor } : null]}>
      <Feather name={name} size={size} color={color} />
    </View>
  );
}

function PrimaryButton({
  label,
  icon,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  const colors = useColors();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      testID={testID}
      style={({ pressed }) => [
        styles.primaryButton,
        { backgroundColor: colors.primary },
        disabled ? styles.disabledButton : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
      <Feather name={icon} size={18} color={colors.primaryForeground} />
    </Pressable>
  );
}

function Onboarding({
  onContinue,
}: {
  onContinue: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useResponsiveLayout();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.onboardingContent,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.contentFrame, { width: contentWidth }]}>
          <View style={styles.brandRow}>
            <LinearGradient
              colors={[colors.primary, '#8B5CF6']}
              style={styles.brandMark}
            >
              <Feather name="maximize" size={21} color={colors.primaryForeground} />
            </LinearGradient>
            <Text style={[styles.brandName, { color: colors.foreground }]}>
              visage
            </Text>
          </View>

          <View style={styles.onboardingHero}>
            <View style={styles.heroOrbLarge} />
            <View style={styles.heroOrbSmall} />
            <LinearGradient
              colors={['#25235C', '#11182D']}
              style={styles.faceCard}
            >
              <View style={styles.faceLines}>
                <View style={styles.faceArc} />
                <View style={styles.faceEyeRow}>
                  <View style={styles.faceEye} />
                  <View style={styles.faceEye} />
                </View>
                <View style={styles.faceSmile} />
              </View>
              <View style={styles.scanLine} />
              <View style={styles.localBadge}>
                <Feather name="lock" size={12} color={colors.primaryForeground} />
                <Text style={styles.localBadgeText}>PROCESSAMENTO LOCAL</Text>
              </View>
            </LinearGradient>
          </View>

          <View style={styles.onboardingCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>
              PRIVACIDADE POR PADRÃO
            </Text>
            <Text style={[styles.onboardingTitle, { color: colors.foreground }]}>
              Encontre qualquer rosto.{'\n'}
              <Text style={{ color: colors.primary }}>Sem enviar nada.</Text>
            </Text>
            <Text style={[styles.onboardingSubtitle, { color: colors.mutedForeground }]}>
              Suas fotos são processadas 100% no seu dispositivo e nunca saem do seu celular.
            </Text>
          </View>

          <View style={styles.privacyList}>
            {[
              ['cpu', 'Tudo acontece no seu celular', 'Nenhuma imagem ou vetor é enviado para a nuvem.'],
              ['database', 'Índice local inteligente', 'Reutilize análises já feitas sem gastar dados.'],
              ['shield', 'Você no controle', 'Apague o índice local quando quiser.'],
            ].map(([icon, title, description]) => (
              <View key={title} style={styles.privacyRow}>
                <IconCircle
                  name={icon as keyof typeof Feather.glyphMap}
                  color={colors.primary}
                  backgroundColor={colors.accent}
                />
                <View style={styles.privacyText}>
                  <Text style={[styles.privacyTitle, { color: colors.foreground }]}>
                    {title}
                  </Text>
                  <Text style={[styles.privacyDescription, { color: colors.mutedForeground }]}>
                    {description}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <PrimaryButton
            label="Continuar com segurança"
            icon="arrow-right"
            onPress={onContinue}
            testID="onboarding-continue"
          />
          <Text style={[styles.legalNote, { color: colors.mutedForeground }]}>
            Ao continuar, você permite que o visage acesse suas fotos para realizar a busca local.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Header({
  onSettings,
  onBack,
  onNext,
  title,
  subtitle,
}: {
  onSettings?: () => void;
  onBack?: () => void;
  onNext?: () => void;
  title: string;
  subtitle?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { horizontalPadding } = useResponsiveLayout();

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: Platform.OS === 'web' ? 67 : insets.top + 8,
          paddingHorizontal: horizontalPadding,
        },
      ]}
    >
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={14} testID="header-back">
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
      ) : onSettings ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir configurações do índice"
          onPress={onSettings}
          style={[styles.headerAction, { backgroundColor: colors.card }]}
          testID="settings-button"
        >
          <Feather name="sliders" size={18} color={colors.mutedForeground} />
        </Pressable>
      ) : (
        <View style={styles.headerActionPlaceholder} />
      )}
      <View style={styles.headerTitleWrap}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        ) : null}
      </View>
      {onNext ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Escolher uma foto"
          onPress={onNext}
          style={[styles.headerAction, { backgroundColor: colors.primary }]}
          testID="header-next"
        >
          <Feather name="arrow-right" size={19} color={colors.primaryForeground} />
        </Pressable>
      ) : (
        <View style={styles.headerActionPlaceholder} />
      )}
    </View>
  );
}

function Home({
  onSelect,
  onSettings,
  onOpenIndexed,
  onContinueFace,
  hasActiveFace,
}: {
  onSelect: () => void;
  onSettings: () => void;
  onOpenIndexed: () => void;
  onContinueFace: () => void;
  hasActiveFace: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useResponsiveLayout();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header
        title="Busca facial"
        subtitle="Seu índice privado"
        onSettings={onSettings}
        onNext={onSelect}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.homeContent, { width: contentWidth, alignSelf: 'center' }]}>
          <LinearGradient
            colors={['#1B1C4A', '#12182E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.homeHero}
          >
            <View style={styles.heroGlow} />
            <Text style={[styles.homeHeroKicker, { color: '#A5B4FC' }]}>PRONTO PARA ENCONTRAR</Text>
            <Text style={[styles.homeHeroTitle, { color: colors.foreground }]}>
              Qual rosto você{'\n'}está procurando?
            </Text>
            <Text style={[styles.homeHeroBody, { color: '#A9B4D1' }]}>
              Escolha uma foto para começar uma busca totalmente local.
            </Text>
            <Pressable
              onPress={onSelect}
              style={({ pressed }) => [styles.heroAction, pressed ? styles.pressed : null]}
              testID="open-photo-selector"
            >
              <View style={styles.heroActionIcon}>
                <Feather name="plus" size={18} color={colors.foreground} />
              </View>
              <Text style={[styles.heroActionText, { color: colors.foreground }]}>
                Escolher uma foto
              </Text>
              <Feather name="arrow-up-right" size={18} color="#A5B4FC" />
            </Pressable>
          </LinearGradient>

          <View style={styles.sectionHeading}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Seu espaço local</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
                Tudo pronto para sua próxima busca
              </Text>
            </View>
            <View style={[styles.readyPill, { backgroundColor: '#123429' }]}>
              <View style={styles.readyDot} />
              <Text style={styles.readyText}>ATIVO</Text>
            </View>
          </View>

          {hasActiveFace ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continuar busca com rosto selecionado"
              onPress={onContinueFace}
              testID="continue-active-face"
              style={({ pressed }) => [
                styles.continueCard,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={[styles.continueIcon, { backgroundColor: colors.accent }]}>
                <Feather name="user-check" size={19} color={colors.primary} />
              </View>
              <View style={styles.continueCopy}>
                <Text style={[styles.continueTitle, { color: colors.foreground }]}>
                  Continuar busca
                </Text>
                <Text
                  style={[styles.continueSubtitle, { color: colors.mutedForeground }]}
                >
                  Um rosto já está selecionado e pronto para buscar
                </Text>
              </View>
              <Feather name="arrow-right" size={18} color={colors.primary} />
            </Pressable>
          ) : null}

          <View style={[styles.privacyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <IconCircle name="shield" color="#34D399" backgroundColor="#123429" size={18} />
            <View style={styles.privacyCardCopy}>
              <Text style={[styles.privacyCardTitle, { color: colors.foreground }]}>Privacidade protegida</Text>
              <Text style={[styles.privacyCardBody, { color: colors.mutedForeground }]}>
                O índice de rostos fica salvo somente neste dispositivo.
              </Text>
            </View>
            <Feather name="check" size={18} color="#34D399" />
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

function AdFooter() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View
      style={[
        styles.adFooter,
        {
          backgroundColor: colors.background,
          paddingBottom: bottomInset + 8,
        },
      ]}
    >
      <View
        style={[
          styles.adSlot,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.adSlotTop}>
          <Feather name="layout" size={14} color={colors.mutedForeground} />
          <Text style={[styles.adLabel, { color: colors.mutedForeground }]}>
            ESPAÇO PARA ANÚNCIO
          </Text>
          <Text style={[styles.adLabel, { color: colors.mutedForeground }]}>
            BANNER
          </Text>
        </View>
        <Text style={[styles.adHint, { color: colors.mutedForeground }]}>
          Seu apoio mantém a busca gratuita.
        </Text>
      </View>
    </View>
  );
}

function SelectPhoto({
  selectedImage,
  normalizedImageUri,
  alignedImageUri,
  faces,
  selectedFaceId,
  imageWidth,
  imageHeight,
  captureError,
  captureProcessing,
  captureStatus,
  onPickLibrary,
  onTakePhoto,
  onSelectFace,
  onSearch,
  albumLabel,
  onPressAlbum,
  onBack,
}: {
  selectedImage: string | null;
  normalizedImageUri: string | null;
  alignedImageUri: string | null;
  faces: DetectedFace[];
  selectedFaceId: number | null;
  imageWidth: number | null;
  imageHeight: number | null;
  captureError: FaceCaptureError | null;
  captureProcessing: boolean;
  captureStatus: FaceCaptureStatus;
  onPickLibrary: () => void;
  onTakePhoto: () => void;
  onSelectFace: (faceId: number) => void;
  onSearch: () => void;
  albumLabel: string;
  onPressAlbum: () => void;
  onBack: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useResponsiveLayout();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header title="Escolher rosto" subtitle="Isole uma pessoa para buscar" onBack={onBack} />
      <ScrollView
        contentContainerStyle={[
          styles.selectContent,
          {
            width: contentWidth,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.cropStage,
            {
              width: Math.min(contentWidth, layout.cropMaxSize),
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {selectedImage ? (
            <>
              <Image
                source={{ uri: normalizedImageUri ?? selectedImage }}
                style={styles.selectedImage}
              />
              {faces.length === 0 ? (
                <View style={styles.cropOverlay}>
                  <View style={styles.cropCornerTopLeft} />
                  <View style={styles.cropCornerTopRight} />
                  <View style={styles.cropCornerBottomLeft} />
                  <View style={styles.cropCornerBottomRight} />
                  <View style={styles.cropFaceRing} />
                </View>
              ) : null}
              <View style={styles.cropHint}>
                <Feather
                  name={faces.length > 0 ? 'check-circle' : 'move'}
                  size={13}
                  color={faces.length > 0 ? '#34D399' : colors.foreground}
                />
                <Text style={styles.cropHintText}>
                  {faces.length > 0 ? 'Rosto detectado' : 'Detectando o rosto'}
                </Text>
              </View>
              {imageWidth && imageHeight ? (
                <FaceSelectionOverlay
                  faces={faces}
                  selectedFaceId={selectedFaceId}
                  imageWidth={imageWidth}
                  imageHeight={imageHeight}
                  onSelect={onSelectFace}
                />
              ) : null}
            </>
          ) : (
            <View style={styles.emptyCrop}>
              <View style={[styles.emptyCropIcon, { backgroundColor: colors.accent }]}>
                <Feather name="maximize" size={27} color={colors.primary} />
              </View>
              <Text style={[styles.emptyCropTitle, { color: colors.foreground }]}>
                Adicione uma foto para começar
              </Text>
              <Text style={[styles.emptyCropBody, { color: colors.mutedForeground }]}>
                Enquadre apenas a cabeça ou o rosto da pessoa desejada.
              </Text>
            </View>
          )}
        </View>

        <FaceCaptureFeedback
          isProcessing={captureProcessing}
          status={captureStatus}
          error={captureError}
          faceCount={faces.length}
          hasAlignedFace={Boolean(alignedImageUri)}
        />

        <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
          Para melhores resultados, use uma foto nítida e com boa iluminação.
        </Text>

        <View style={styles.sourceButtons}>
          <Pressable
            onPress={onPickLibrary}
            style={({ pressed }) => [
              styles.sourceButton,
              { borderColor: colors.border, backgroundColor: colors.card },
              pressed ? styles.pressed : null,
            ]}
            testID="pick-from-library"
          >
            <Feather name="image" size={19} color={colors.primary} />
            <Text style={[styles.sourceButtonText, { color: colors.foreground }]}>Galeria</Text>
          </Pressable>
          <Pressable
            onPress={onTakePhoto}
            style={({ pressed }) => [
              styles.sourceButton,
              { borderColor: colors.border, backgroundColor: colors.card },
              pressed ? styles.pressed : null,
            ]}
            testID="take-photo"
          >
            <Feather name="camera" size={19} color={colors.primary} />
            <Text style={[styles.sourceButtonText, { color: colors.foreground }]}>Câmera</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Pasta de busca: ${albumLabel}`}
          onPress={onPressAlbum}
          testID="open-album-picker"
          style={({ pressed }) => [
            styles.albumButton,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed ? styles.pressed : null,
          ]}
        >
          <Feather name="folder" size={17} color={colors.primary} />
          <View style={styles.albumCopy}>
            <Text style={[styles.albumLabel, { color: colors.mutedForeground }]}>
              Buscar em
            </Text>
            <Text style={[styles.albumValue, { color: colors.foreground }]}>
              {albumLabel}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </Pressable>

        <PrimaryButton
          label={alignedImageUri ? 'Buscar este rosto na galeria' : 'Aguardando rosto válido'}
          icon="search"
          onPress={onSearch}
          disabled={!selectedImage || !alignedImageUri || captureProcessing}
          testID="search-face"
        />
        <View style={styles.localNotice}>
          <Feather name="wifi-off" size={15} color={colors.mutedForeground} />
          <Text style={[styles.localNoticeText, { color: colors.mutedForeground }]}>
            A busca é feita no índice local e não envia suas fotos.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Analyzing({
  progress,
  status,
  error,
  onCancel,
  onDismiss,
}: {
  progress: FaceIndexProgress;
  status: FaceSearchStatus;
  error: FaceRecognitionError | null;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, styles.centeredScreen, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <View style={styles.analysisVisual}>
        <View style={[styles.analysisRing, { borderColor: colors.accent }]} />
        <View style={[styles.analysisRingInner, { borderColor: colors.primary }]} />
        <Feather name="maximize" size={41} color={colors.primary} />
      </View>
      <Text style={[styles.analysisTitle, { color: colors.foreground }]}>Analisando sua galeria</Text>
      <Text style={[styles.analysisBody, { color: colors.mutedForeground }]}>
        Comparando vetores localmente.{'\n'}Suas fotos continuam no seu dispositivo.
      </Text>
      <View style={styles.analysisProgressCard}>
        <FaceSearchProgress
          progress={progress}
          status={status}
          error={error}
          onCancel={onCancel}
          onDismiss={onDismiss}
        />
      </View>
    </View>
  );
}

function Results({
  results,
  onNewSearch,
}: {
  results: FaceSearchResult[];
  onNewSearch: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { contentWidth, numColumns } = useResponsiveLayout();
  const hasResults = results.length > 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header title="Resultados" subtitle={`${results.length} correspondências encontradas`} onBack={onNewSearch} />
      <FlatList
        key={`results-${numColumns}`}
        data={results}
        keyExtractor={(item) => item.assetId}
        numColumns={numColumns}
        scrollEnabled={results.length > 0}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.resultsList,
          { width: contentWidth, alignSelf: 'center', paddingBottom: insets.bottom + 28 },
        ]}
        columnWrapperStyle={styles.resultsRow}
        ListHeaderComponent={
          <View style={[styles.resultSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.summaryIcon}>
              <Feather
                name={hasResults ? 'check-circle' : 'clock'}
                size={20}
                color={hasResults ? '#34D399' : colors.primary}
              />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={[styles.summaryTitle, { color: colors.foreground }]}>
                {hasResults ? 'Busca concluída' : 'Captura pronta'}
              </Text>
              <Text style={[styles.summaryBody, { color: colors.mutedForeground }]}>
                {hasResults
                  ? 'Todas as correspondências foram encontradas no seu dispositivo.'
                  : 'Nenhuma foto do índice atingiu o limiar mínimo de similaridade.'}
              </Text>
            </View>
            {hasResults ? (
             <Text style={[styles.summaryTime, { color: colors.mutedForeground }]}>Local</Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.resultCard, { backgroundColor: colors.card }]}>
            <Image source={typeof item.uri === 'number' ? item.uri : { uri: item.uri }} style={styles.resultImage} />
            <View style={styles.resultCardBody}>
              <Text numberOfLines={1} style={[styles.resultFilename, { color: colors.foreground }]}>
                {item.filename ?? 'Foto da galeria'}
              </Text>
              <View style={styles.confidenceRow}>
                 <View style={[styles.confidenceBar, { backgroundColor: colors.muted }]}>
                   <View style={[styles.confidenceFill, { backgroundColor: colors.primary, width: `${Math.round(item.similarity * 100)}%` }]} />
                </View>
                 <Text style={styles.confidenceText}>{Math.round(item.similarity * 100)}%</Text>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyResults}>
            <IconCircle name="search" color={colors.mutedForeground} backgroundColor={colors.card} size={22} />
            <Text style={[styles.emptyResultsTitle, { color: colors.foreground }]}>Nenhuma correspondência</Text>
            <Text style={[styles.emptyResultsBody, { color: colors.mutedForeground }]}>
              Tente uma foto mais nítida ou com o rosto mais visível.
            </Text>
          </View>
        }
      />
      <View
        style={[
          styles.resultsFooter,
          {
            width: contentWidth,
            alignSelf: 'center',
            paddingBottom: insets.bottom + 12,
            backgroundColor: colors.background,
          },
        ]}
      >
        <PrimaryButton label="Nova busca" icon="plus" onPress={onNewSearch} testID="new-search" />
      </View>
    </View>
  );
}

function RewardModal({
  visible,
  onClose,
  onStart,
  countdown,
}: {
  visible: boolean;
  onClose: () => void;
  onStart: () => void;
  countdown: number;
}) {
  const colors = useColors();
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.rewardModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.rewardIcon, { backgroundColor: colors.accent }]}>
            <Feather name="play" size={21} color={colors.primary} />
          </View>
          <Text style={[styles.rewardEyebrow, { color: colors.primary }]}>BUSCA GRATUITA</Text>
          <Text style={[styles.rewardTitle, { color: colors.foreground }]}>Assista para revelar</Text>
          <Text style={[styles.rewardBody, { color: colors.mutedForeground }]}>
            Um breve anúncio ajuda a manter o processamento local gratuito para você.
          </Text>
          <View style={[styles.videoPlaceholder, { backgroundColor: colors.background }]}>
            <View style={styles.videoProgress} />
            <Feather name="play-circle" size={34} color={colors.primary} />
            <Text style={[styles.videoText, { color: colors.mutedForeground }]}>ANÚNCIO RECOMPENSADO</Text>
          </View>
          <Pressable
            onPress={onStart}
            style={({ pressed }) => [
              styles.rewardButton,
              { backgroundColor: colors.primary },
              pressed ? styles.pressed : null,
            ]}
            testID="watch-reward"
          >
            <Text style={styles.primaryButtonText}>
              {countdown > 0 ? `Carregando anúncio · ${countdown}` : 'Continuar para resultados'}
            </Text>
            {countdown === 0 ? <Feather name="arrow-right" size={17} color={colors.primaryForeground} /> : null}
          </Pressable>
          <Pressable onPress={onClose} hitSlop={12} style={styles.cancelReward}>
            <Text style={[styles.cancelRewardText, { color: colors.mutedForeground }]}>Agora não</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function OfflineModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.rewardModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.rewardIcon, { backgroundColor: '#3A222D' }]}>
            <Feather name="wifi-off" size={21} color="#FB7185" />
          </View>
          <Text style={[styles.rewardTitle, { color: colors.foreground }]}>Processamento 100% Local</Text>
          <Text style={[styles.rewardBody, { color: colors.mutedForeground }]}>
            O app funciona sem conexão. Fotos, embeddings e dados faciais permanecem protegidos neste dispositivo.
          </Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.rewardButton,
              { backgroundColor: colors.primary },
              pressed ? styles.pressed : null,
            ]}
            testID="offline-close"
          >
            <Text style={styles.primaryButtonText}>Entendi</Text>
            <Feather name="check" size={17} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function HomeScreen() {
  const [screen, setScreen] = useState<AppScreen>('onboarding');
  const [indexedFilter, setIndexedFilter] = useState<'all' | 'withFaces'>('all');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showReward, setShowReward] = useState(false);
  const [showIndexSettings, setShowIndexSettings] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedAlbumTitle, setSelectedAlbumTitle] =
    useState<string>('Todo o dispositivo');
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [rewardCountdown, setRewardCountdown] = useState(3);
  const [matchesReturnScreen, setMatchesReturnScreen] = useState<AppScreen | null>(null);
  const [showBackgroundIndexConsent, setShowBackgroundIndexConsent] = useState(false);
  const [backgroundIndexConsent, setBackgroundIndexConsentState] =
    useState<BackgroundIndexConsentStatus>('unknown');
  const [hasGalleryPhotoAccess, setHasGalleryPhotoAccess] = useState(false);
  const [isUpdatingBackgroundIndex, setIsUpdatingBackgroundIndex] = useState(false);
  const colors = useColors();
  const {
    faces,
    selectedFaceId,
    setSelectedFaceId,
    alignedFace,
    status: captureStatus,
    isProcessing: captureProcessing,
    error: captureError,
    analyze: analyzeFace,
    align: alignFace,
    reset: resetCapture,
    imageWidth,
    imageHeight,
    normalizedImageUri,
    restoreFromSession,
  } = useFaceCapture();
  const {
    status: faceSearchStatus,
    operation: faceSearchOperation,
    isOperationActive: faceSearchOperationActive,
    clearState: faceSearchClearState,
    progress: faceSearchProgress,
    results,
    summary,
    storedIndexStats,
    indexedPhotos,
    isLoadingIndexedPhotos,
    refreshIndexedPhotos,
    error: faceSearchError,
    cancelIndexing,
    clearIndex,
    indexAndSearch,
    setActiveAlignedFace,
    rehydrateSession,
  } = useFaceSearch();

  useEffect(() => {
    if (__DEV__) {
      console.info('[startup] HomeScreen mounted');
    }
    let cancelled = false;
    void (async () => {
      const [onboardingValue, consent] = await Promise.all([
        AsyncStorage.getItem('visage.onboarding.complete'),
        getBackgroundIndexConsent(),
      ]);
      if (cancelled) return;

      setBackgroundIndexConsentState(consent);
      if (onboardingValue === 'true') {
        if (cancelled) return;
        setScreen('home');
        const galleryPermissionGranted = await hasGalleryPhotoPermission();
        if (cancelled) return;
        setHasGalleryPhotoAccess(galleryPermissionGranted);
        const canAskForConsent = consent === 'unknown' && galleryPermissionGranted;
        setShowBackgroundIndexConsent(canAskForConsent);
      }
    })().catch((error) => {
      if (__DEV__) {
        console.error('[BackgroundIndex] não foi possível ler o consentimento', error);
      }
    });
    void AsyncStorage.getItem(ALBUM_STORAGE_KEY).then((value) => {
      if (!value) return;
      try {
        const parsed = JSON.parse(value) as { id: string | null; title: string };
        if (parsed.id) {
          setSelectedAlbumId(parsed.id);
          setSelectedAlbumTitle(parsed.title);
        }
      } catch {
        // ignore parse error
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await restoreFromSession();
      if (cancelled || !session) return;
      if (__DEV__) {
        console.log(
          `[Boot] restaurando sessão de ${new Date(session.savedAt).toISOString()}`,
        );
      }
      setSelectedImage(session.sourceUri);
      setActiveAlignedFace(session.alignedFace);
      await rehydrateSession(session.alignedFace);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showReward) {
      setRewardCountdown(3);
      return undefined;
    }
    const timer = setInterval(() => {
      setRewardCountdown((value) => {
        if (value <= 1) {
          clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 900);
    return () => clearInterval(timer);
  }, [showReward]);

  const handleOnboarding = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await ImagePicker.requestMediaLibraryPermissionsAsync();
    let galleryPermissionGranted = false;
    try {
      await requestGalleryPhotoPermission();
      galleryPermissionGranted = true;
      setHasGalleryPhotoAccess(true);
    } catch (error) {
      if (__DEV__) {
        console.error('[BackgroundIndex] permissão da galeria não concedida', error);
      }
    }
    await AsyncStorage.setItem('visage.onboarding.complete', 'true');
    setScreen('home');
    if (backgroundIndexConsent === 'unknown' && galleryPermissionGranted) {
      setShowBackgroundIndexConsent(true);
    }
  };

  const acceptBackgroundIndex = async () => {
    try {
      if (!(await hasGalleryPhotoPermission())) {
        await requestGalleryPhotoPermission();
        setHasGalleryPhotoAccess(true);
      }
      await setBackgroundIndexConsent('accepted');
      setBackgroundIndexConsentState('accepted');
      setShowBackgroundIndexConsent(false);
    } catch (error) {
      if (__DEV__) {
        console.error('[BackgroundIndex] não foi possível salvar a aceitação', error);
      }
      Alert.alert(
        'Permissão necessária',
        'Permita o acesso às fotos para ativar a preparação do índice.',
      );
    }
  };

  const declineBackgroundIndex = async () => {
    try {
      await setBackgroundIndexConsent('declined');
      setBackgroundIndexConsentState('declined');
      setShowBackgroundIndexConsent(false);
      Alert.alert('Índice local desativado', BACKGROUND_INDEX_DECLINED_MESSAGE);
    } catch (error) {
      if (__DEV__) {
        console.error('[BackgroundIndex] não foi possível salvar a recusa', error);
      }
    }
  };

  const toggleBackgroundIndex = async (enabled: boolean) => {
    if (isUpdatingBackgroundIndex) {
      return;
    }

    setIsUpdatingBackgroundIndex(true);
    try {
      if (enabled) {
        await requestGalleryPhotoPermission();
        await setBackgroundIndexConsent('accepted');
        setHasGalleryPhotoAccess(true);
        setBackgroundIndexConsentState('accepted');
        return;
      }

      cancelIndexing();
      await setBackgroundIndexConsent('declined');
      setBackgroundIndexConsentState('declined');
      Alert.alert('Índice local desativado', BACKGROUND_INDEX_DECLINED_MESSAGE);
    } catch (error) {
      if (__DEV__) {
        console.error('[BackgroundIndex] não foi possível alterar o índice', error);
      }
      if (enabled) {
        Alert.alert(
          'Permissão necessária',
          'Permita o acesso às fotos para ativar a preparação do índice.',
        );
      } else {
        Alert.alert(
          'Não foi possível parar o índice',
          'Tente novamente em alguns instantes.',
        );
      }
    } finally {
      setIsUpdatingBackgroundIndex(false);
    }
  };

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }
    const selection = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!selection.canceled && selection.assets[0]?.uri) {
      const uri = selection.assets[0].uri;
      await clearPersistedSession();
      await resetCapture();
      setSelectedImage(uri);
      void analyzeFace(uri);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return;
    }
    const selection = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!selection.canceled && selection.assets[0]?.uri) {
      const uri = selection.assets[0].uri;
      await clearPersistedSession();
      await resetCapture();
      setSelectedImage(uri);
      void analyzeFace(uri);
    }
  };

  const openSearch = () => setScreen('select');

  const handleSelectAlbum = (album: AlbumOption) => {
    setSelectedAlbumId(album.id);
    setSelectedAlbumTitle(album.title);
    void AsyncStorage.setItem(
      ALBUM_STORAGE_KEY,
      JSON.stringify({ id: album.id, title: album.title }),
    );
    if (__DEV__) {
      console.log(
        `[Album] selecionado id=${album.id ?? 'all'} title=${album.title}`,
      );
    }
  };

  const openIndexed = () => {
    if (__DEV__) {
      console.log(
        `[Indexed] abrindo galeria (todas). fotos=${storedIndexStats.indexedPhotos}`,
      );
    }
    setIndexedFilter('all');
    setScreen('indexed');
    void refreshIndexedPhotos();
  };

  const openIndexedFaces = () => {
    if (__DEV__) {
      console.log(
        `[Indexed] abrindo galeria (rostos). rostos=${storedIndexStats.indexedFaces}`,
      );
    }
    setIndexedFilter('withFaces');
    setScreen('indexed');
    void refreshIndexedPhotos();
  };

  const continueFaceSearch = () => {
    if (alignedFace && alignedFace.standardized) {
      setActiveAlignedFace(alignedFace);
    }
    if (__DEV__) {
      console.log('[Face] continuando busca com rosto existente');
    }
    setScreen('select');
  };

  const beginSearch = async () => {
    if (alignedFace && alignedFace.standardized) {
      setActiveAlignedFace(alignedFace);
    }
    if (
      !selectedImage ||
      !alignedFace ||
      captureStatus !== 'completed' ||
      !alignedFace.standardized
    ) {
      return;
    }
    setShowReward(true);
  };

  const startAnalysis = async () => {
    if (alignedFace && alignedFace.standardized) {
      setActiveAlignedFace(alignedFace);
    }
    if (
      !selectedImage ||
      !alignedFace ||
      captureStatus !== 'completed' ||
      !alignedFace.standardized
    ) {
      return;
    }
    setShowReward(false);
    setMatchesReturnScreen(screen);
    setScreen('analyzing');
    try {
      const searchSummary = await indexAndSearch(alignedFace, selectedAlbumId);
      if (searchSummary) {
        setScreen('results');
      }
    } catch {
      // The progress component presents the friendly error and recovery action.
    }
  };

  const openMatches = () => {
    if (__DEV__) {
      console.log(`[Matches] abrindo ${results.length} resultados`);
    }
    setMatchesReturnScreen(screen);
    setScreen('results');
  };

  const returnFromMatches = () => {
    const destination = matchesReturnScreen ?? 'home';
    setMatchesReturnScreen(null);
    setScreen(destination);
  };

  const goHome = () => {
    setMatchesReturnScreen(null);
    setScreen('home');
  };

  const leaveSelection = () => {
    setScreen('home');
  };

  const dismissSearchProgress = () => {
    cancelIndexing();
    setScreen('select');
  };

  const content = useMemo(() => {
    switch (screen) {
      case 'onboarding':
        return <Onboarding onContinue={handleOnboarding} />;
      case 'select':
        return (
          <SelectPhoto
            selectedImage={selectedImage}
            normalizedImageUri={normalizedImageUri}
            alignedImageUri={alignedFace?.uri ?? null}
            faces={faces}
            selectedFaceId={selectedFaceId}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            captureError={captureError}
            captureProcessing={captureProcessing}
            captureStatus={captureStatus}
            onPickLibrary={pickFromLibrary}
            onTakePhoto={takePhoto}
            onSelectFace={(faceId) => {
              setSelectedFaceId(faceId);
              void alignFace(faceId);
            }}
            onSearch={beginSearch}
            albumLabel={selectedAlbumTitle}
            onPressAlbum={() => setShowAlbumPicker(true)}
            onBack={leaveSelection}
          />
        );
      case 'analyzing':
        return (
          <Analyzing
            progress={faceSearchProgress}
            status={faceSearchStatus}
            error={faceSearchError}
            onCancel={cancelIndexing}
            onDismiss={dismissSearchProgress}
          />
        );
      case 'results':
        return (
          <Results
            results={results}
            onNewSearch={matchesReturnScreen ? returnFromMatches : goHome}
          />
        );
      case 'indexed': {
        const visiblePhotos =
          indexedFilter === 'withFaces'
            ? indexedPhotos.filter((photo) => photo.faceCount > 0)
            : indexedPhotos;
        if (__DEV__) {
          console.log(
            `[Indexed] renderizando mode=${indexedFilter} total=${indexedPhotos.length} visíveis=${visiblePhotos.length}`,
          );
        }
        return (
          <IndexedGallery
            photos={visiblePhotos}
            isLoading={isLoadingIndexedPhotos}
            mode={indexedFilter}
            onBack={() => setScreen('home')}
          />
        );
      }
      case 'home':
      default:
        return (
          <Home
            onSelect={openSearch}
            onSettings={() => setShowIndexSettings(true)}
            onOpenIndexed={openIndexed}
            onContinueFace={continueFaceSearch}
            hasActiveFace={Boolean(alignedFace)}
          />
        );
    }
  }, [
    screen,
    selectedImage,
    alignedFace?.uri,
    faces,
    selectedFaceId,
    imageWidth,
    imageHeight,
    normalizedImageUri,
    captureError,
    captureProcessing,
    captureStatus,
    faceSearchProgress,
    faceSearchStatus,
    faceSearchError,
    storedIndexStats,
    indexedPhotos,
    indexedFilter,
    isLoadingIndexedPhotos,
    refreshIndexedPhotos,
    openIndexed,
    continueFaceSearch,
    openMatches,
    selectedAlbumTitle,
    setShowAlbumPicker,
    handleSelectAlbum,
    cancelIndexing,
    results,
    matchesReturnScreen,
  ]);

  return (
    <>
      <View style={[styles.appShell, { backgroundColor: colors.background }]}>
        {content}
        <GlobalMatchesPanel
          matchCount={results.length}
          onPress={openMatches}
        />
        <AdFooter />
      </View>
      <RewardModal
        visible={showReward}
        countdown={rewardCountdown}
        onClose={() => setShowReward(false)}
        onStart={() => {
          if (rewardCountdown === 0) {
            void startAnalysis();
          }
        }}
      />
      <BackgroundIndexConsent
        visible={showBackgroundIndexConsent}
        onAccept={acceptBackgroundIndex}
        onDecline={declineBackgroundIndex}
      />
      <OfflineModal visible={showOffline} onClose={() => setShowOffline(false)} />
      <IndexSettings
        visible={showIndexSettings}
        stats={storedIndexStats}
        operation={faceSearchOperation}
        isOperationActive={faceSearchOperationActive}
        clearState={faceSearchClearState}
        progress={faceSearchProgress}
        onClose={() => setShowIndexSettings(false)}
        onClearIndex={clearIndex}
        backgroundIndexEnabled={
          backgroundIndexConsent === 'accepted' && hasGalleryPhotoAccess
        }
        hasGalleryPhotoPermission={hasGalleryPhotoAccess}
        isBackgroundIndexUpdating={isUpdatingBackgroundIndex}
        onBackgroundIndexToggle={toggleBackgroundIndex}
        onOpenIndexed={() => {
          setShowIndexSettings(false);
          openIndexed();
        }}
      />
      <AlbumPicker
        visible={showAlbumPicker}
        selectedAlbumId={selectedAlbumId}
        onSelect={handleSelectAlbum}
        onClose={() => setShowAlbumPicker(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  appShell: { flex: 1 },
  screen: { flex: 1 },
  onboardingContent: { flexGrow: 1 },
  contentFrame: { alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 19, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  onboardingHero: { height: 270, marginTop: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroOrbLarge: { position: 'absolute', width: 270, height: 270, borderRadius: 135, backgroundColor: '#111A38', top: 0 },
  heroOrbSmall: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: '#191747', top: 41 },
  faceCard: { width: 162, height: 202, borderRadius: 82, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#3F43A1' },
  faceLines: { width: 104, height: 130, alignItems: 'center', justifyContent: 'center' },
  faceArc: { width: 61, height: 76, borderWidth: 2, borderBottomColor: 'transparent', borderColor: '#A5B4FC', borderRadius: 42, position: 'absolute', top: 6 },
  faceEyeRow: { flexDirection: 'row', gap: 26, position: 'absolute', top: 49 },
  faceEye: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#C7D2FE' },
  faceSmile: { width: 29, height: 13, borderBottomWidth: 2, borderBottomColor: '#A5B4FC', borderRadius: 18, position: 'absolute', top: 72 },
  scanLine: { position: 'absolute', left: 21, right: 21, height: 1, backgroundColor: '#818CF8', top: 99, opacity: 0.8 },
  localBadge: { position: 'absolute', bottom: 19, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#24265D', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  localBadgeText: { color: '#C7D2FE', fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  onboardingCopy: { marginTop: 18 },
  eyebrow: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.4, marginBottom: 11 },
  onboardingTitle: { fontSize: 34, lineHeight: 39, fontFamily: 'Inter_700Bold', letterSpacing: -1.3 },
  onboardingSubtitle: { fontSize: 15, lineHeight: 23, fontFamily: 'Inter_400Regular', marginTop: 15, maxWidth: 340 },
  privacyList: { gap: 18, marginTop: 28, marginBottom: 27 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  iconCircle: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  privacyText: { flex: 1 },
  privacyTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  privacyDescription: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  primaryButton: { minHeight: 53, borderRadius: 17, paddingHorizontal: 18, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  disabledButton: { opacity: 0.38 },
  legalNote: { textAlign: 'center', fontSize: 11, lineHeight: 16, marginTop: 12, paddingHorizontal: 17 },
  header: { minHeight: 78, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  headerSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  headerAction: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerActionPlaceholder: { width: 38 },
  homeContent: { paddingTop: 11 },
  homeHero: { minHeight: 278, borderRadius: 25, padding: 22, justifyContent: 'flex-end', overflow: 'hidden' },
  heroGlow: { position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: '#292672', right: -62, top: -55, opacity: 0.65 },
  homeHeroKicker: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.3, marginBottom: 11 },
  homeHeroTitle: { fontSize: 29, lineHeight: 34, fontFamily: 'Inter_700Bold', letterSpacing: -1 },
  homeHeroBody: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 10, maxWidth: 250 },
  heroAction: { marginTop: 22, minHeight: 49, borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingRight: 14, gap: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  heroActionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6366F1' },
  heroActionText: { flex: 1, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 29, marginBottom: 14 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  sectionSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  readyPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' },
  readyText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.6, color: '#6EE7B7' },
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 17,
    padding: 14,
    marginBottom: 14,
  },
  continueIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueCopy: { flex: 1 },
  continueTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  continueSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  selectStatsWrap: { marginTop: 14 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  privacyCard: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 17, borderWidth: 1, padding: 13, marginTop: 12 },
  privacyCardCopy: { flex: 1 },
  privacyCardTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  privacyCardBody: { fontSize: 10, lineHeight: 15, marginTop: 3, fontFamily: 'Inter_400Regular' },
  adFooter: { width: '100%', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  adSlot: { width: '100%', maxWidth: 480, minHeight: 64, borderRadius: 17, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  adSlotTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  adLabel: { fontSize: 9, letterSpacing: 0.8, fontFamily: 'Inter_600SemiBold' },
  adHint: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  selectContent: { alignSelf: 'center', paddingTop: 12 },
  cropStage: { aspectRatio: 1, borderWidth: 1, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  selectedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  cropOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,5,14,0.2)' },
  cropCornerTopLeft: { position: 'absolute', width: 28, height: 28, borderTopWidth: 2, borderLeftWidth: 2, borderColor: '#A5B4FC', left: 25, top: 25, borderTopLeftRadius: 8 },
  cropCornerTopRight: { position: 'absolute', width: 28, height: 28, borderTopWidth: 2, borderRightWidth: 2, borderColor: '#A5B4FC', right: 25, top: 25, borderTopRightRadius: 8 },
  cropCornerBottomLeft: { position: 'absolute', width: 28, height: 28, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: '#A5B4FC', left: 25, bottom: 25, borderBottomLeftRadius: 8 },
  cropCornerBottomRight: { position: 'absolute', width: 28, height: 28, borderBottomWidth: 2, borderRightWidth: 2, borderColor: '#A5B4FC', right: 25, bottom: 25, borderBottomRightRadius: 8 },
  cropFaceRing: { width: 166, height: 215, borderRadius: 90, borderWidth: 1.5, borderColor: '#C7D2FE' },
  cropHint: { position: 'absolute', bottom: 18, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: 'rgba(8,11,20,0.75)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  cropHintText: { color: '#F8FAFC', fontFamily: 'Inter_500Medium', fontSize: 11 },
  emptyCrop: { alignItems: 'center', paddingHorizontal: 35 },
  emptyCropIcon: { width: 61, height: 61, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  emptyCropTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, textAlign: 'center' },
  emptyCropBody: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  helperText: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 23, marginTop: 14 },
  sourceButtons: { flexDirection: 'row', gap: 12, marginTop: 25, marginBottom: 0 },
  sourceButton: { flex: 1, minHeight: 52, borderRadius: 16, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  sourceButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  albumButton: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 15, padding: 13, marginTop: 10, marginBottom: 10 },
  albumCopy: { flex: 1 },
  albumLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, letterSpacing: 0.4 },
  albumValue: { fontFamily: 'Inter_600SemiBold', fontSize: 14, marginTop: 2 },
  localNotice: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 15 },
  localNoticeText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  centeredScreen: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  analysisVisual: { width: 147, height: 147, alignItems: 'center', justifyContent: 'center', marginBottom: 31 },
  analysisRing: { ...StyleSheet.absoluteFillObject, borderWidth: 1, borderRadius: 74 },
  analysisRingInner: { width: 102, height: 102, borderWidth: 1.5, borderRadius: 51, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  analysisTitle: { fontFamily: 'Inter_700Bold', fontSize: 23, letterSpacing: -0.5 },
  analysisBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 11 },
  analysisProgressCard: { width: '100%', marginTop: 25 },
  resultsList: { paddingTop: 13 },
  resultsRow: { gap: 12, marginBottom: 12 },
  resultSummary: { minHeight: 79, borderRadius: 17, borderWidth: 1, padding: 12, marginBottom: 17, flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#123429', alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1 },
  summaryTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  summaryBody: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14, marginTop: 3 },
  summaryTime: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  resultCard: { flex: 1, overflow: 'hidden', borderRadius: 17 },
  resultImage: { width: '100%', aspectRatio: 0.84, resizeMode: 'cover' },
  resultCardBody: { padding: 10 },
  resultFilename: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  confidenceBar: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  confidenceFill: { height: '100%', borderRadius: 2 },
  confidenceText: { color: '#6EE7B7', fontFamily: 'Inter_700Bold', fontSize: 10 },
  emptyResults: { alignItems: 'center', paddingTop: 50 },
  emptyResultsTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15, marginTop: 14 },
  emptyResultsBody: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', marginTop: 7, lineHeight: 18 },
  resultsFooter: { paddingHorizontal: 22, paddingTop: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,4,12,0.75)', justifyContent: 'flex-end', padding: 14 },
  rewardModal: { borderRadius: 27, borderWidth: 1, padding: 22, paddingBottom: 17 },
  rewardIcon: { width: 47, height: 47, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  rewardEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2, marginBottom: 7 },
  rewardTitle: { fontFamily: 'Inter_700Bold', fontSize: 23, letterSpacing: -0.6 },
  rewardBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 9 },
  videoPlaceholder: { height: 115, borderRadius: 17, marginTop: 18, alignItems: 'center', justifyContent: 'center', gap: 7, overflow: 'hidden' },
  videoProgress: { position: 'absolute', top: 0, left: 0, width: '37%', height: 3, backgroundColor: '#6366F1' },
  videoText: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  rewardButton: { minHeight: 51, marginTop: 17, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  cancelReward: { alignItems: 'center', paddingVertical: 11 },
  cancelRewardText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
});