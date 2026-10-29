import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, FontAwesome } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';
import { useFaceCapture } from '@/hooks/useFaceCapture';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { clearPersistedSession } from '@/services/faceCapture/sessionPersistence';
import { FaceCaptureFeedback } from '@/components/FaceCaptureFeedback';
import { FaceSelectionOverlay } from '@/components/FaceSelectionOverlay';
import { FaceSearchProgress } from '@/components/FaceSearchProgress';
import {
  HomeIndexingIndicator,
  type HomeIndexingState,
} from '@/components/HomeIndexingIndicator';
import { PhotoViewer } from '@/components/PhotoViewer';
import { IndexSettings } from '@/components/IndexSettings';
import { IndexedGallery } from '@/components/IndexedGallery';
import { GlobalMatchesPanel } from '@/components/GlobalMatchesPanel';
import { OnboardingPermissions } from '@/components/OnboardingPermissions';
import {
  BACKGROUND_INDEX_DECLINED_MESSAGE,
  getBackgroundIndexConsent,
  setBackgroundIndexConsent,
  type BackgroundIndexConsentStatus,
} from '@/services/backgroundIndexing/consent';
import {
  ensureBatteryOptimizationExemptionAsked,
  ensureNotificationPermissionAsked,
  restoreIndexingNotification,
} from '@/services/backgroundIndexing/foregroundService';
import {
  hasFullGalleryPhotoPermission,
  hasGalleryPhotoPermission,
  requestGalleryPhotoPermission,
} from '@/services/backgroundIndexing/galleryPermission';
import { clearBackgroundIndexCursor } from '@/services/backgroundIndexing/checkpoint';
import {
  AlbumPicker,
  type AlbumOption,
} from '@/components/AlbumPicker';
import NetInfo from '@react-native-community/netinfo';
import { initMobileAds } from '@/services/ads/adConfig';
import { preloadRewardedAd, showRewardedAd } from '@/services/ads/rewardedAdService';
import { AdBanner } from '@/components/AdBanner';
import { useFaceSearch, type FaceSearchStatus } from '@/hooks/useFaceSearch';
import type {
  BackgroundIndexState,
  FaceIndexProgress,
  FaceRecognitionError,
  FaceSearchResult,
  SearchProgressEvent,
} from '@/services/faceSearch';
import type {
  AlignedFace,
  DetectedFace,
  FaceCaptureError,
  FaceCaptureStatus,
} from '@/services/faceCapture';
import '@/services/backgroundIndexing/foregroundService';

import {
  DEFAULT_PRECISION_LEVEL,
  PRECISION_STORAGE_KEY,
  precisionLevelToThreshold,
} from '@/constants/precision';

type AppScreen = 'onboarding' | 'home' | 'select' | 'analyzing' | 'results' | 'indexed';

const ALBUM_STORAGE_KEY = 'visage.index.album';
const HEADER_ACTION_SIZE = 38;

const initialBackgroundIndexState: BackgroundIndexState = {
  status: 'idle',
  scope: 'gallery',
  processedAssets: 0,
  totalAssets: null,
  lastAssetId: null,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastError: null,
};

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
  backgroundColor,
  foregroundColor,
  highlighted = false,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
  backgroundColor?: string;
  foregroundColor?: string;
  highlighted?: boolean;
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
        { backgroundColor: backgroundColor ?? colors.primary },
        highlighted ? styles.highlightedPrimaryButton : null,
        disabled ? styles.disabledButton : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text
        style={[
          styles.primaryButtonText,
          foregroundColor ? { color: foregroundColor } : null,
        ]}
      >
        {label}
      </Text>
      <Feather
        name={icon}
        size={18}
        color={foregroundColor ?? colors.primaryForeground}
      />
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
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollMetricsRef = useRef({
    viewportHeight: 0,
    contentHeight: 0,
    contentTop: 0,
    buttonTop: 0,
    buttonHeight: 0,
  });
  const autoScrollStartedRef = useRef(false);
  const autoScrollDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);

  const cancelAutoScroll = useCallback(() => {
    if (autoScrollDelayRef.current !== null) {
      clearTimeout(autoScrollDelayRef.current);
      autoScrollDelayRef.current = null;
    }
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }, []);

  const maybeAutoScroll = useCallback(() => {
    if (autoScrollStartedRef.current) return;

    const {
      viewportHeight,
      contentHeight,
      contentTop,
      buttonTop,
      buttonHeight,
    } = scrollMetricsRef.current;
    if (!viewportHeight || !contentHeight || !buttonHeight) return;

    const maxOffset = contentHeight - viewportHeight;
    const buttonOffset =
      contentTop + buttonTop + buttonHeight - viewportHeight + 20;
    const targetOffset = Math.min(maxOffset, Math.max(0, buttonOffset));
    if (targetOffset <= 8) return;

    autoScrollStartedRef.current = true;
    autoScrollDelayRef.current = setTimeout(() => {
      const duration = 1600;
      let startedAt: number | null = null;
      const animateScroll = (timestamp: number) => {
        startedAt ??= timestamp;
        const progress = Math.min((timestamp - startedAt) / duration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        scrollRef.current?.scrollTo({
          y: targetOffset * easedProgress,
          animated: false,
        });

        if (progress < 1) {
          autoScrollFrameRef.current = requestAnimationFrame(animateScroll);
        } else {
          autoScrollFrameRef.current = null;
        }
      };
      autoScrollFrameRef.current = requestAnimationFrame(animateScroll);
    }, 250);
  }, []);

  useEffect(
    () => () => {
      cancelAutoScroll();
    },
    [cancelAutoScroll],
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.onboardingBrand,
          {
            width: contentWidth,
            alignSelf: 'center',
            paddingTop: insets.top + 24,
          },
        ]}
      >
        <Text style={[styles.brandName, { color: colors.foreground }]}>
          Search Face Local
        </Text>
        <Text
          style={[
            styles.eyebrow,
            styles.onboardingEyebrow,
            { color: colors.primary },
          ]}
        >
          Privacidade por padrão
        </Text>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.onboardingScroll}
        contentContainerStyle={[
          styles.onboardingContent,
          {
            paddingTop: 8,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
        onLayout={({ nativeEvent }) => {
          scrollMetricsRef.current.viewportHeight = nativeEvent.layout.height;
          maybeAutoScroll();
        }}
        onContentSizeChange={(_, contentHeight) => {
          scrollMetricsRef.current.contentHeight = contentHeight;
          maybeAutoScroll();
        }}
        onScrollBeginDrag={() => {
          autoScrollStartedRef.current = true;
          cancelAutoScroll();
        }}
      >
        <View
          style={[styles.contentFrame, { width: contentWidth }]}
          onLayout={({ nativeEvent }) => {
            scrollMetricsRef.current.contentTop = nativeEvent.layout.y;
            maybeAutoScroll();
          }}
        >
          <View style={styles.onboardingCopy}>
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

          <View
            onLayout={({ nativeEvent }) => {
              scrollMetricsRef.current.buttonTop = nativeEvent.layout.y;
              scrollMetricsRef.current.buttonHeight = nativeEvent.layout.height;
              maybeAutoScroll();
            }}
          >
            <PrimaryButton
              label="Continuar com segurança"
              icon="arrow-right"
              onPress={onContinue}
              testID="onboarding-continue"
              backgroundColor="#34D399"
              foregroundColor="#052019"
              highlighted
            />
          </View>
          <Text style={[styles.legalNote, { color: colors.mutedForeground }]}>
            Ao continuar, você permite que o Search Face Local acesse suas fotos para realizar a busca local.
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
  subtitleIcon,
  centeredTitle = false,
}: {
  onSettings?: () => void;
  onBack?: () => void;
  onNext?: () => void;
  title: string;
  subtitle?: string;
  subtitleIcon?: React.ReactNode;
  centeredTitle?: boolean;
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
      <View style={[styles.headerTitleWrap, centeredTitle ? styles.centeredHeaderTitleWrap : null]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? (
          <View style={styles.headerSubtitleRow}>
            {subtitleIcon}
            <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
          </View>
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
  matchCount,
  indexingState,
  indexingCount,
  indexingTotalAssets,
  onOpenMatches,
  hasActiveFace,
}: {
  onSelect: () => void;
  onSettings: () => void;
  onOpenIndexed: () => void;
  onContinueFace: () => void;
  matchCount: number;
  indexingState: HomeIndexingState;
  indexingCount: number;
  indexingTotalAssets: number | null;
  onOpenMatches: () => void;
  hasActiveFace: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { contentWidth, horizontalPadding } = useResponsiveLayout();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header
        title="Search Face Local"
        onSettings={onSettings}
        onNext={onSelect}
        centeredTitle
      />
      <HomeIndexingIndicator
        state={indexingState}
        processedAssets={indexingCount}
        totalAssets={indexingTotalAssets}
        horizontalPadding={horizontalPadding}
        anchorColumnWidth={HEADER_ACTION_SIZE}
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

          <GlobalMatchesPanel
            inline
            matchCount={matchCount}
            onPress={onOpenMatches}
          />

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
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View
      style={[
        styles.adFooter,
        {
          paddingBottom: Math.max(bottomInset, 4),
        },
      ]}
    >
      <AdBanner />
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
  matchCount,
  onPickLibrary,
  onTakePhoto,
  onSelectFace,
  onSearch,
  albumLabel,
  onPressAlbum,
  onBack,
  onOpenMatches,
  activeSlot,
  onSelectSlot,
  onClearSlot,
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
  matchCount: number;
  onPickLibrary: () => void;
  onTakePhoto: () => void;
  onSelectFace: (faceId: number) => void;
  onSearch: () => void;
  albumLabel: string;
  onPressAlbum: () => void;
  onBack: () => void;
  onOpenMatches: () => void;
  activeSlot: 0 | 1;
  onSelectSlot: (slot: 0 | 1) => void;
  onClearSlot: (slot: 0 | 1) => void;
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
              <Pressable
                onPress={() => onClearSlot(activeSlot)}
                testID="clear-active-slot"
                style={({ pressed }) => [
                  styles.cropClearButton,
                  { backgroundColor: 'rgba(8,11,20,0.75)' },
                  pressed ? styles.pressed : null,
                ]}
              >
                <Feather name="trash-2" size={16} color={colors.foreground} />
              </Pressable>
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Adicionar foto pela galeria"
              accessibilityHint="Abre a galeria para escolher uma foto"
              onPress={onPickLibrary}
              testID="empty-photo-picker"
              style={({ pressed }) => [
                styles.emptyCrop,
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={[styles.emptyCropIcon, { backgroundColor: colors.accent }]}>
                <Feather name="maximize" size={27} color={colors.primary} />
              </View>
              <Text style={[styles.emptyCropTitle, { color: colors.foreground }]}>
                Adicione uma foto para começar
              </Text>
              <Text style={[styles.emptyCropBody, { color: colors.mutedForeground }]}>
                Enquadre apenas a cabeça ou o rosto da pessoa desejada.
              </Text>
            </Pressable>
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
          Para melhores resultados, use uma foto nítida
        </Text>

        <View style={styles.slotSelector}>
          {([0, 1] as const).map((slot) => {
            const isActive = slot === activeSlot;
            return (
              <Pressable
                key={slot}
                onPress={() => onSelectSlot(slot)}
                testID={`select-slot-${slot}`}
                style={({ pressed }) => [
                  styles.slotOption,
                  pressed ? styles.pressed : null,
                ]}
              >
                <View
                  style={[
                    styles.slotDot,
                    {
                      backgroundColor: isActive ? colors.primary : '#050810',
                      borderColor: colors.border,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.slotLabel,
                    { color: isActive ? colors.foreground : colors.mutedForeground },
                  ]}
                >
                  {`Foto ${slot + 1}`}
                </Text>
              </Pressable>
            );
          })}
        </View>

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

        <GlobalMatchesPanel
          inline
          matchCount={matchCount}
          onPress={onOpenMatches}
        />

        <PrimaryButton
          label={alignedImageUri ? 'Ver anúncio e buscar na galeria' : 'Aguardando rosto válido'}
          icon="search"
          onPress={onSearch}
          disabled={!selectedImage || !alignedImageUri || captureProcessing}
          testID="search-face"
        />
        <View style={styles.localNotice}>
          <Text style={[styles.localNoticeText, { color: colors.mutedForeground }]}>
            A busca é feita no índice local e não faz envios.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function BiometricTargetCorners({ size, color }: { size: number; color: string }) {
  const cornerLength = Math.max(8, Math.round(size * 0.16));
  const stroke = 2;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <View
        style={{
          position: 'absolute',
          top: -2,
          left: -2,
          width: cornerLength,
          height: cornerLength,
          borderTopWidth: stroke,
          borderLeftWidth: stroke,
          borderColor: color,
          borderTopLeftRadius: 6,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: -2,
          right: -2,
          width: cornerLength,
          height: cornerLength,
          borderTopWidth: stroke,
          borderRightWidth: stroke,
          borderColor: color,
          borderTopRightRadius: 6,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: -2,
          left: -2,
          width: cornerLength,
          height: cornerLength,
          borderBottomWidth: stroke,
          borderLeftWidth: stroke,
          borderColor: color,
          borderBottomLeftRadius: 6,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: -2,
          right: -2,
          width: cornerLength,
          height: cornerLength,
          borderBottomWidth: stroke,
          borderRightWidth: stroke,
          borderColor: color,
          borderBottomRightRadius: 6,
        }}
      />
    </View>
  );
}

function BiometricScanVisual({
  alignedFaces,
  primaryColor,
  accentColor,
}: {
  alignedFaces: AlignedFace[];
  primaryColor: string;
  accentColor: string;
}) {
  const isDual = alignedFaces.length >= 2;
  const radarScale = useSharedValue(1);
  const radarOpacity = useSharedValue(0.7);
  const scanPosition = useSharedValue(0);

  useEffect(() => {
    radarScale.value = withRepeat(
      withTiming(1.35, { duration: 2200, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    radarOpacity.value = withRepeat(
      withTiming(0, { duration: 2200, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    scanPosition.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(radarScale);
      cancelAnimation(radarOpacity);
      cancelAnimation(scanPosition);
    };
  }, [radarScale, radarOpacity, scanPosition]);

  const radarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: radarScale.value }],
    opacity: radarOpacity.value,
  }));

  const frameHeight = isDual ? 82 : 96;
  const beamYRange = frameHeight * 0.72;

  const beamStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: (scanPosition.value - 0.5) * beamYRange * 2,
      },
    ],
  }));

  if (isDual) {
    const face1 = alignedFaces[0];
    const face2 = alignedFaces[1];
    return (
      <View style={styles.biometricContainerDual}>
        {/* Radar elíptico conjunto */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.biometricRadarDual,
            { borderColor: primaryColor },
            radarStyle,
          ]}
        />

        {/* Rosto 1 */}
        <View style={[styles.biometricFrameDual, { borderColor: accentColor }]}>
          {face1?.uri ? (
            <Image source={{ uri: face1.uri }} style={styles.biometricImageDual} />
          ) : (
            <Feather name="user" size={28} color={primaryColor} />
          )}
          <BiometricTargetCorners size={78} color={primaryColor} />
        </View>

        {/* Elo de conexão central */}
        <View style={[styles.biometricLinkBadge, { borderColor: primaryColor }]}>
          <Feather name="link-2" size={13} color={primaryColor} />
        </View>

        {/* Rosto 2 */}
        <View style={[styles.biometricFrameDual, { borderColor: accentColor }]}>
          {face2?.uri ? (
            <Image source={{ uri: face2.uri }} style={styles.biometricImageDual} />
          ) : (
            <Feather name="user" size={28} color={primaryColor} />
          )}
          <BiometricTargetCorners size={78} color={primaryColor} />
        </View>

        {/* Feixe laser horizontal sincronizado atravessando ambos os rostos */}
        <Animated.View
          pointerEvents="none"
          style={[styles.biometricBeamDual, beamStyle]}
        >
          <LinearGradient
            colors={['transparent', primaryColor, 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.biometricBeamGradient}
          />
        </Animated.View>
      </View>
    );
  }

  // Rosto único
  const singleFace = alignedFaces[0];
  return (
    <View style={styles.biometricContainerSingle}>
      {/* Radar circular concêntrico */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.biometricRadarSingle,
          { borderColor: primaryColor },
          radarStyle,
        ]}
      />

      {/* Moldura circular com o rosto */}
      <View style={[styles.biometricFrameSingle, { borderColor: accentColor }]}>
        {singleFace?.uri ? (
          <Image source={{ uri: singleFace.uri }} style={styles.biometricImageSingle} />
        ) : (
          <Feather name="user" size={36} color={primaryColor} />
        )}
        <BiometricTargetCorners size={96} color={primaryColor} />
      </View>

      {/* Feixe laser vertical sobre o rosto */}
      <Animated.View
        pointerEvents="none"
        style={[styles.biometricBeamSingle, beamStyle]}
      >
        <LinearGradient
          colors={['transparent', primaryColor, 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.biometricBeamGradient}
        />
      </Animated.View>
    </View>
  );
}

function Analyzing({
  progress,
  status,
  error,
  matchCount,
  liveMatches,
  searchProgress,
  onCancel,
  onDismiss,
  alignedFaces,
}: {
  progress: FaceIndexProgress;
  status: FaceSearchStatus;
  error: FaceRecognitionError | null;
  matchCount: number;
  liveMatches: number;
  searchProgress: SearchProgressEvent | null;
  onCancel: () => void;
  onDismiss: () => void;
  alignedFaces: AlignedFace[];
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isDual = alignedFaces.length >= 2;

  return (
    <View style={[styles.screen, styles.centeredScreen, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      <BiometricScanVisual
        alignedFaces={alignedFaces}
        primaryColor={colors.primary}
        accentColor={colors.accent}
      />
      <Text style={[styles.analysisTitle, { color: colors.foreground }]}>
        {isDual ? 'Buscando rostos em conjunto' : 'Analisando sua galeria'}
      </Text>
      <Text style={[styles.analysisBody, { color: colors.mutedForeground }]}>
        {isDual
          ? 'Identificando fotos com ambos os rostos.\nSuas fotos continuam no seu dispositivo.'
          : 'Comparando vetores localmente.\nSuas fotos continuam no seu dispositivo.'}
      </Text>
      <View style={styles.analysisProgressCard}>
        <FaceSearchProgress
          progress={progress}
          status={status}
          error={error}
          matchCount={matchCount}
          liveMatches={liveMatches}
          searchProgress={searchProgress}
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
  onOpenPhoto,
}: {
  results: FaceSearchResult[];
  onNewSearch: () => void;
  onOpenPhoto: (uri: string, index: number) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { contentWidth, numColumns } = useResponsiveLayout();
  const hasResults = results.length > 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header
        title="Resultados"
        subtitle={`${results.length} correspondências encontradas`}
        subtitleIcon={hasResults ? <Feather name="check-circle" size={13} color="#34D399" /> : null}
        onBack={onNewSearch}
      />
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
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => onOpenPhoto(item.uri, index)}
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${item.filename ?? 'foto'}`}
            style={({ pressed }) => [
              styles.resultCard,
              { backgroundColor: colors.card },
              pressed ? styles.pressed : null,
            ]}
          >
            <Image source={typeof item.uri === 'number' ? item.uri : { uri: item.uri }} style={styles.resultImage} />
            <View style={styles.resultCardBody}>
              <Text numberOfLines={1} style={[styles.resultFilename, { color: colors.foreground }]}>
                {item.filename ?? 'Foto da galeria'}
              </Text>
              <View style={styles.confidenceRow}>
                <Text numberOfLines={1} style={[styles.confidenceText, { color: colors.mutedForeground }]}>
                  {getFolderNameFromUri(item.uri)}
                </Text>
              </View>
            </View>
          </Pressable>
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
          <Text style={[styles.rewardTitle, { color: colors.foreground }]}>Conexão necessária</Text>
          <Text style={[styles.rewardBody, { color: colors.mutedForeground }]}>
            É necessária uma conexão com a internet para carregar o anúncio patrocinado e liberar a busca facial gratuita.
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
            <Text style={styles.primaryButtonText}>Tentar novamente</Text>
            <Feather name="refresh-cw" size={17} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function getFolderNameFromUri(uri: string): string {
  try {
    const cleanUri = uri.split('?')[0];
    const segments = cleanUri.split('/').filter(Boolean);
    if (segments.length >= 2) {
      const candidate = segments[segments.length - 2];
      if (candidate && candidate.length > 0) {
        return decodeURIComponent(candidate);
      }
    }
  } catch {
    // fallthrough
  }
  return 'Galeria';
}

export default function HomeScreen() {
  const [screen, setScreen] = useState<AppScreen>('onboarding');
  const [indexedFilter, setIndexedFilter] = useState<'all' | 'withFaces'>('all');
  const [viewerPhotos, setViewerPhotos] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number>(0);
  const [showReward, setShowReward] = useState(false);
  const [showIndexSettings, setShowIndexSettings] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedAlbumTitle, setSelectedAlbumTitle] =
    useState<string>('Todo o dispositivo');
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [precisionLevel, setPrecisionLevel] = useState<number>(DEFAULT_PRECISION_LEVEL);
  const [rewardCountdown, setRewardCountdown] = useState(3);
  const [matchesReturnScreen, setMatchesReturnScreen] = useState<AppScreen | null>(null);
  const [showOnboardingPermissions, setShowOnboardingPermissions] = useState(false);
  const [backgroundIndexConsent, setBackgroundIndexConsentState] =
    useState<BackgroundIndexConsentStatus>('unknown');
  const [hasGalleryPhotoAccess, setHasGalleryPhotoAccess] = useState(false);
  const [backgroundIndexState, setBackgroundIndexState] =
    useState<BackgroundIndexState>(initialBackgroundIndexState);
  const [indexHydrated, setIndexHydrated] = useState(false);
  const [isUpdatingBackgroundIndex, setIsUpdatingBackgroundIndex] = useState(false);
  const mountedRef = useRef(true);
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
    slots,
    activeSlot,
    setActiveSlot,
    clearSlot,
  } = useFaceCapture();
  const selectedImage = slots[activeSlot].sourceUri;
  const {
    status: faceSearchStatus,
    operation: faceSearchOperation,
    isOperationActive: faceSearchOperationActive,
    clearState: faceSearchClearState,
    progress: faceSearchProgress,
    searchProgress: faceSearchSearchProgress,
    liveMatches: faceSearchLiveMatches,
    results,
    summary,
    storedIndexStats,
    backgroundSyncToken: faceSearchBackgroundSyncToken,
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

  const syncBackgroundTask = async (): Promise<void> => {
    if (Platform.OS === 'web') return;
    const { syncBackgroundIndexRegistration } =
      await import('@/services/backgroundIndexing/scheduler');
    await syncBackgroundIndexRegistration();
  };

  const startForegroundIndexingIfNeeded = useCallback(
    async (trigger: 'auto' | 'explicit' = 'auto'): Promise<void> => {
      if (Platform.OS === 'web') return;

      if (AppState.currentState === 'active') {
        restoreIndexingNotification();
      }

      const foregroundIndexLoop = await import(
        '@/services/backgroundIndexing/foregroundIndexLoop'
      );
      foregroundIndexLoop.startForegroundIndexing({
        trigger,
        onPartialProgress: (processedAssets, totalAssets) => {
          if (!mountedRef.current) return;
          // Evita acumular setState em fila enquanto a UI está suspensa
          // (tela apagada ou app em background). O valor real é lido do
          // SQLite pelo listener de AppState quando o app volta a 'active',
          // evitando o salto visual (ex: de 71 direto para 334).
          if (AppState.currentState !== 'active') return;
          setBackgroundIndexState((current) => {
            const resolvedTotal = totalAssets ?? current.totalAssets;
            const reachedTotalNow =
              typeof resolvedTotal === 'number' &&
              resolvedTotal > 0 &&
              processedAssets >= resolvedTotal &&
              current.processedAssets < resolvedTotal;
            if (reachedTotalNow) {
              void refreshIndexedPhotos();
            }
            return {
              ...current,
              status: 'running',
              processedAssets,
              totalAssets: resolvedTotal,
              lastError: null,
            };
          });
        },
        onFinalOutcome: async (outcome) => {
          if (!mountedRef.current) return;
          const status = outcome.status === 'blocked'
            ? 'waiting'
            : outcome.status;
          setBackgroundIndexState((current) => ({
            ...current,
            status,
            processedAssets: outcome.cumulativeProcessed,
            totalAssets: outcome.cumulativeTotal,
            lastCompletedAt: outcome.status === 'completed'
              ? Date.now()
              : current.lastCompletedAt,
            lastError: null,
          }));

          if (
            outcome.status === 'completed' ||
            outcome.status === 'cancelled' ||
            outcome.status === 'paused'
          ) {
            const { AppState } = await import('react-native');
            if (AppState.currentState === 'active') {
              await refreshIndexedPhotos();
            }
          }
        },
      });
    },
    [refreshIndexedPhotos],
  );

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
        setScreen('home');
      }

      let galleryPermissionGranted = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          galleryPermissionGranted = await hasGalleryPhotoPermission();
          console.warn(
            `[A14Diag] boot perm attempt=${attempt + 1} result=${galleryPermissionGranted}`,
          );
        } catch (error) {
          console.warn(
            `[A14Diag] boot perm attempt=${attempt + 1} erro`,
            error,
          );
          galleryPermissionGranted = false;
        }
        if (galleryPermissionGranted) break;
        if (attempt < 2) {
          await new Promise<void>((resolve) => setTimeout(resolve, 500));
        }
      }
      console.warn(
        `[A14Diag] boot galleryPermissionGranted final=${galleryPermissionGranted}`,
      );
      const faceSearchModule = Platform.OS === 'web'
        ? null
        : await import('@/services/faceSearch');
      if (faceSearchModule) {
        const { reconcileOrphanRunningState } = await import(
          '@/services/backgroundIndexing/reconcileOrphanRunning'
        );
        await reconcileOrphanRunningState();
      }
      const persistedIndexState = faceSearchModule
        ? await faceSearchModule.getBackgroundIndexState()
        : null;
      // O checkpoint (AsyncStorage) é atualizado a cada página; o SQLite só
      // ao fim do batch. Se o app foi fechado no meio, o checkpoint tem o
      // valor mais recente. Usar o maior dos dois evita mostrar 0 na Home.
      let reconciledState = persistedIndexState;
      if (persistedIndexState && Platform.OS !== 'web') {
        try {
          const checkpointMod = await import(
            '@/services/backgroundIndexing/checkpoint'
          );
          const checkpoint = await checkpointMod.loadBackgroundIndexCursor();
          if (
            checkpoint &&
            typeof checkpoint.processedAssets === 'number' &&
            checkpoint.processedAssets > persistedIndexState.processedAssets
          ) {
            reconciledState = {
              ...persistedIndexState,
              processedAssets: checkpoint.processedAssets,
            };
            if (__DEV__) {
              console.log(
                `[Boot] checkpoint mais recente: ${checkpoint.processedAssets} > ${persistedIndexState.processedAssets}; usando checkpoint`,
              );
            }
          }
        } catch (checkpointError) {
          if (__DEV__) {
            console.log('[Boot] falha ao ler checkpoint', checkpointError);
          }
        }
      }
      if (
        reconciledState &&
        reconciledState.status === 'error' &&
        consent === 'accepted' &&
        galleryPermissionGranted
      ) {
        reconciledState = {
          ...reconciledState,
          status: 'paused',
          lastError: null,
        };
      }
      if (cancelled) return;

      console.warn(
        `[A14Diag] boot setHasGalleryPhotoAccess=${galleryPermissionGranted}`,
      );
      setHasGalleryPhotoAccess(galleryPermissionGranted);
      if (reconciledState) {
        console.warn(
          `[A14Diag] boot setBackgroundIndexState status=${reconciledState?.status} processed=${reconciledState?.processedAssets} total=${reconciledState?.totalAssets}`,
        );
        setBackgroundIndexState(reconciledState);
      }
      if (onboardingValue === 'true') {
        const canAskForConsent = consent === 'unknown' && galleryPermissionGranted;
        setShowOnboardingPermissions(canAskForConsent);
      }
      await syncBackgroundTask();
      if (!cancelled) {
        console.warn('[A14Diag] boot setIndexHydrated=true');
        setIndexHydrated(true);
        if (consent === 'accepted' && galleryPermissionGranted && Platform.OS !== 'web') {
          setTimeout(() => {
            if (cancelled) return;
            void (async () => {
              try {
                const galleryIndexer = await import(
                  '@/services/faceSearch/galleryIndexer'
                );
                const knownTotal =
                  reconciledState?.totalAssets ??
                  reconciledState?.processedAssets ??
                  0;
                const quick = await galleryIndexer.quickCheckGalleryChanged(
                  knownTotal,
                  null,
                );
                if (!cancelled && quick.changed) {
                  console.warn(
                    `[SyncIncremental] Mudança detectada: ${knownTotal} → ${quick.totalAssets} (${quick.reason})`,
                  );
                  void startForegroundIndexingIfNeeded('auto');
                }
              } catch (err) {
                console.warn('[SyncIncremental] falha na checagem suave', err);
              }
            })();
          }, 800);
        }
      }
    })().catch((error) => {
      console.error('[BackgroundIndex] não foi possível preparar a inicialização', error);
      if (!cancelled) {
        console.warn('[A14Diag] boot setIndexHydrated=true');
        setIndexHydrated(true);
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
    void AsyncStorage.getItem(PRECISION_STORAGE_KEY).then((value) => {
      if (!value) return;
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed)) {
        setPrecisionLevel(parsed);
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePrecisionChange = useCallback((level: number) => {
    setPrecisionLevel(level);
    void AsyncStorage.setItem(PRECISION_STORAGE_KEY, String(level)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (faceSearchBackgroundSyncToken === 0 || Platform.OS === 'web') return;
    let cancelled = false;
    void (async () => {
      const module = await import('@/services/faceSearch');
      const state = await module.getBackgroundIndexState();
      if (!cancelled && mountedRef.current) {
        setBackgroundIndexState(state);
      }
    })().catch((error) => {
      console.error(
        '[BackgroundIndex] não foi possível atualizar estado após busca',
        error,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [faceSearchBackgroundSyncToken]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
      setActiveAlignedFace(session.alignedFace);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const timer = setTimeout(() => {
      void initMobileAds().then((ok) => {
        if (ok) preloadRewardedAd();
      }).catch(() => {});
    }, 2500);
    return () => clearTimeout(timer);
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

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (backgroundIndexConsent !== 'accepted') return;
    if (!hasGalleryPhotoAccess) return;
    if (backgroundIndexState.status === 'completed') return;
    if (backgroundIndexState.status === 'cancelled') return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      void startForegroundIndexingIfNeeded();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    backgroundIndexConsent,
    hasGalleryPhotoAccess,
    backgroundIndexState.status,
    startForegroundIndexingIfNeeded,
  ]);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let cancelled = false;
    let subscription: { remove: () => void } | null = null;
    void import('react-native').then(({ AppState }) => {
      if (cancelled) return;
      subscription = AppState.addEventListener('change', (nextState) => {
        console.warn(`[A14Diag] AppState change=${nextState}`);
        if (nextState !== 'active') return;
        void (async () => {
          try {
            const accessOk = await hasGalleryPhotoPermission();
            console.warn(
              `[A14Diag] AppState accessOk=${accessOk} atual=${hasGalleryPhotoAccess}`,
            );
            if (mountedRef.current && accessOk !== hasGalleryPhotoAccess) {
              setHasGalleryPhotoAccess(accessOk);
            }
          } catch (error) {
            console.warn('[A14Diag] AppState falha access', error);
          }

          let fullPermissionOk = false;
          let permissionConfirmed = false;
          try {
            fullPermissionOk = await hasFullGalleryPhotoPermission();
            permissionConfirmed = true;
            console.warn(
              `[A14Diag] AppState fullPermissionOk=${fullPermissionOk}`,
            );
          } catch (error) {
            console.warn('[A14Diag] AppState falha fullPerm', error);
            permissionConfirmed = false;
          }

          let latestState: BackgroundIndexState | null = null;
          try {
            const module = await import('@/services/faceSearch');
            latestState = await module.getBackgroundIndexState();
            try {
              const checkpointMod = await import(
                '@/services/backgroundIndexing/checkpoint'
              );
              const checkpoint = await checkpointMod.loadBackgroundIndexCursor();
              if (
                latestState &&
                checkpoint &&
                typeof checkpoint.processedAssets === 'number' &&
                checkpoint.processedAssets > latestState.processedAssets
              ) {
                latestState = {
                  ...latestState,
                  processedAssets: checkpoint.processedAssets,
                };
              }
            } catch {
              // ignore checkpoint read error
            }
            if (
              latestState &&
              latestState.status === 'error' &&
              backgroundIndexConsent === 'accepted' &&
              fullPermissionOk
            ) {
              latestState = {
                ...latestState,
                status: 'paused',
                lastError: null,
              };
            }
            console.warn(
              `[A14Diag] AppState readState status=${latestState?.status} processed=${latestState?.processedAssets} total=${latestState?.totalAssets}`,
            );
            if (mountedRef.current && latestState) {
              setBackgroundIndexState(latestState);
            }
          } catch (error) {
            console.warn('[A14Diag] AppState falha readState', error);
            return;
          }

          try {
            await refreshIndexedPhotos();
          } catch (error) {
            console.warn('[A14Diag] AppState falha refreshFotos', error);
          }

          console.warn(
            `[A14Diag] AppState decisão: permissionConfirmed=${permissionConfirmed} fullPermissionOk=${fullPermissionOk} consent=${backgroundIndexConsent} status=${latestState?.status}`,
          );
          if (!permissionConfirmed) return;
          if (!fullPermissionOk) return;
          if (backgroundIndexConsent !== 'accepted') return;
          if (latestState?.status === 'completed') {
            try {
              const galleryIndexer = await import(
                '@/services/faceSearch/galleryIndexer'
              );
              const knownTotal =
                latestState.totalAssets ?? latestState.processedAssets ?? 0;
              if (typeof galleryIndexer.quickCheckGalleryChanged === 'function') {
                const quick = await galleryIndexer.quickCheckGalleryChanged(knownTotal, null);
                if (quick.changed) {
                  console.warn(
                    `[SyncIncremental] Mudança na galeria detectada ao retomar: ${knownTotal} → ${quick.totalAssets} (motivo=${quick.reason})`,
                  );
                  const updatedState: BackgroundIndexState = {
                    ...latestState,
                    status: 'running',
                    totalAssets: quick.totalAssets,
                  };
                  if (mountedRef.current) {
                    setBackgroundIndexState(updatedState);
                  }
                  const faceSearchRepo = await import(
                    '@/services/faceSearch/repository'
                  );
                  await faceSearchRepo.faceSearchRepository.updateBackgroundIndexState({
                    status: 'running',
                    totalAssets: quick.totalAssets,
                  });
                  void startForegroundIndexingIfNeeded('auto');
                }
              } else {
                const currentTotal = await galleryIndexer.countGalleryAssets(null);
                if (currentTotal > knownTotal) {
                  console.warn(
                    `[SyncIncremental] Fotos novas na galeria detectadas no boot: ${knownTotal} → ${currentTotal} (+${currentTotal - knownTotal})`,
                  );
                  const updatedState: BackgroundIndexState = {
                    ...latestState,
                    status: 'running',
                    totalAssets: currentTotal,
                  };
                  if (mountedRef.current) {
                    setBackgroundIndexState(updatedState);
                  }
                  const faceSearchRepo = await import(
                    '@/services/faceSearch/repository'
                  );
                  await faceSearchRepo.faceSearchRepository.updateBackgroundIndexState({
                    status: 'running',
                    totalAssets: currentTotal,
                  });
                  void startForegroundIndexingIfNeeded('auto');
                }
              }
            } catch (checkErr) {
              console.warn('[SyncIncremental] erro checando total da galeria', checkErr);
            }
            return;
          }
          if (latestState?.status === 'cancelled') return;
          console.warn('[A14Diag] AppState iniciando loop');
          void startForegroundIndexingIfNeeded();
        })();
      });
    });
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [
    backgroundIndexConsent,
    hasGalleryPhotoAccess,
    backgroundIndexState.status,
    refreshIndexedPhotos,
    startForegroundIndexingIfNeeded,
  ]);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const WATCHDOG_INTERVAL_MS = 15_000;
    const id = setInterval(() => {
      void (async () => {
        try {
          // NÃO tentar iniciar FGS de background (Android 12+).
          // Isso já causou code:DENIED e processos mortos em CEM.
          if (AppState.currentState !== 'active') return;
          // Não competir por recursos nem pelo SQLite durante busca manual ativa
          if (screen === 'analyzing' || faceSearchOperationActive) {
            return;
          }
            console.warn(
              `[A14Diag] Watchdog tick status=${backgroundIndexState.status} consent=${backgroundIndexConsent}`,
            );
          if (backgroundIndexConsent !== 'accepted') return;
          if (
            backgroundIndexState.status === 'completed' ||
            backgroundIndexState.status === 'cancelled'
          ) {
            return;
          }
          try {
            const accessOk = await hasGalleryPhotoPermission();
            console.warn(
              `[A14Diag] Watchdog accessOk=${accessOk} atual=${hasGalleryPhotoAccess}`,
            );
            if (mountedRef.current && accessOk !== hasGalleryPhotoAccess) {
              setHasGalleryPhotoAccess(accessOk);
            }
          } catch (error) {
            console.warn('[A14Diag] Watchdog falha access', error);
          }

          let fullPermissionOk = false;
          let permissionConfirmed = false;
          try {
            fullPermissionOk = await hasFullGalleryPhotoPermission();
            permissionConfirmed = true;
            console.warn(
              `[A14Diag] Watchdog fullPermissionOk=${fullPermissionOk}`,
            );
          } catch (error) {
            console.warn('[A14Diag] Watchdog falha fullPerm', error);
            permissionConfirmed = false;
          }
          if (!permissionConfirmed) return;
          if (!fullPermissionOk) return;

          const foregroundIndexLoop = await import(
            '@/services/backgroundIndexing/foregroundIndexLoop'
          );
          // Revalidação fresca: o React pode estar desatualizado.
          try {
            const module = await import('@/services/faceSearch');
            const fresh = await module.getBackgroundIndexState();
            if (fresh.status === 'completed' || fresh.status === 'cancelled') {
              console.warn(
                `[Watchdog] abortando reinício (fresh status=${fresh.status})`,
              );
              return;
            }
          } catch (error) {
            console.warn('[Watchdog] falha ao reler estado', error);
            return;
          }
          if (__DEV__) {
            console.log(
              `[Watchdog] loop status=${backgroundIndexState.status}`,
            );
          }
          await startForegroundIndexingIfNeeded();
        } catch (error) {
          if (__DEV__) {
            console.log('[Watchdog] erro ao reiniciar loop', error);
          }
        }
      })();
    }, WATCHDOG_INTERVAL_MS);
    return () => clearInterval(id);
  }, [
    backgroundIndexConsent,
    hasGalleryPhotoAccess,
    backgroundIndexState.status,
    startForegroundIndexingIfNeeded,
  ]);

  const handleOnboarding = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowOnboardingPermissions(true);
  };

  const completeOnboardingPermissions = async (result: {
    galleryGranted: boolean;
    indexAccepted: boolean;
  }) => {
    await AsyncStorage.setItem('visage.onboarding.complete', 'true');
    setScreen('home');
    setHasGalleryPhotoAccess(result.galleryGranted);

    if (!result.galleryGranted || backgroundIndexConsent !== 'unknown') {
      setShowOnboardingPermissions(false);
      return;
    }

    if (result.indexAccepted) {
      await acceptBackgroundIndex();
    } else {
      await declineBackgroundIndex();
    }
  };

  const acceptBackgroundIndex = async () => {
    try {
      if (!(await hasGalleryPhotoPermission())) {
        await requestGalleryPhotoPermission();
      }
      await clearBackgroundIndexCursor();
      await setBackgroundIndexConsent('accepted');
      if (mountedRef.current) {
        setHasGalleryPhotoAccess(true);
        setBackgroundIndexConsentState('accepted');
        setShowOnboardingPermissions(false);
      }
    } catch (error) {
      if (__DEV__) {
        console.error('[BackgroundIndex] não foi possível salvar a aceitação', error);
      }
      Alert.alert(
        'Não foi possível ativar o índice',
        'Verifique a permissão das fotos e tente novamente nos filtros.',
      );
      return;
    }
    try {
      if (Platform.OS === 'android') {
        await ensureNotificationPermissionAsked();
        await ensureBatteryOptimizationExemptionAsked();
      }
      const registration = syncBackgroundTask();
      const immediateBatch = startForegroundIndexingIfNeeded('explicit');
      const [registrationResult] = await Promise.allSettled([
        registration,
        immediateBatch,
      ]);
      if (registrationResult.status === 'rejected') {
        throw registrationResult.reason;
      }
      if (__DEV__) {
        console.log(
          `[Perm:diag] ctx=after-sync consent=${backgroundIndexConsent} hasPhotoAccess=${hasGalleryPhotoAccess}`,
        );
      }
    } catch (error) {
      console.error('[BackgroundIndex] agendamento indisponível', error);
      Alert.alert(
        'Agendamento indisponível',
        'A autorização foi salva, mas a tarefa em segundo plano não foi registrada. Instale uma versão atualizada do aplicativo e tente novamente.',
      );
    }
  };

  const declineBackgroundIndex = async () => {
    try {
      await setBackgroundIndexConsent('declined');
      if (mountedRef.current) {
        setBackgroundIndexConsentState('declined');
        setShowOnboardingPermissions(false);
        setBackgroundIndexState((current) => ({
          ...current,
          status: 'paused',
          lastError: null,
        }));
      }
      await clearBackgroundIndexCursor();
      try {
        await syncBackgroundTask();
      } catch (error) {
        console.error('[BackgroundIndex] falha ao cancelar o agendamento', error);
      }
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
        if (mountedRef.current) {
          setHasGalleryPhotoAccess(true);
          setBackgroundIndexConsentState('accepted');
          setBackgroundIndexState((current) => ({
            ...current,
            status: 'running',
            lastError: null,
          }));
        }
        try {
          if (Platform.OS === 'android') {
            await ensureNotificationPermissionAsked();
            await ensureBatteryOptimizationExemptionAsked();
          }
          const registration = syncBackgroundTask();
          const immediateBatch = startForegroundIndexingIfNeeded('explicit');
          const [registrationResult] = await Promise.allSettled([
            registration,
            immediateBatch,
          ]);
          if (registrationResult.status === 'rejected') {
            throw registrationResult.reason;
          }
          if (__DEV__) {
            console.log(
              `[Perm:diag] ctx=after-sync consent=${backgroundIndexConsent} hasPhotoAccess=${hasGalleryPhotoAccess}`,
            );
          }
        } catch (error) {
          console.error('[BackgroundIndex] agendamento indisponível', error);
          Alert.alert(
            'Agendamento indisponível',
            'A autorização foi salva, mas a tarefa em segundo plano não foi registrada. Instale uma versão atualizada do aplicativo e tente novamente.',
          );
        }
        return;
      }

      if (Platform.OS !== 'web') {
        const foregroundIndexLoop = await import(
          '@/services/backgroundIndexing/foregroundIndexLoop'
        );
        foregroundIndexLoop.getActiveForegroundIndexing()?.cancel();
      }
      cancelIndexing();
      await setBackgroundIndexConsent('declined');
      if (mountedRef.current) {
        setBackgroundIndexConsentState('declined');
        setBackgroundIndexState((current) => ({
          ...current,
          status: 'paused',
          lastError: null,
        }));
      }
      await clearBackgroundIndexCursor();
      try {
        await syncBackgroundTask();
      } catch (error) {
        console.error('[BackgroundIndex] falha ao cancelar o agendamento', error);
      }
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
      if (mountedRef.current) {
        setIsUpdatingBackgroundIndex(false);
      }
    }
  };

  const clearLocalIndex = async (): Promise<void> => {
    await clearIndex();
    if (mountedRef.current) {
      setBackgroundIndexState({ ...initialBackgroundIndexState });
    }
  };

  const pickFromLibrary = async () => {
    try {
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!selection.canceled && selection.assets[0]?.uri) {
        const uri = selection.assets[0].uri;
        void analyzeFace(uri, activeSlot);
      }
    } catch (error) {
      console.error('[Gallery] não foi possível abrir a galeria', error);
      Alert.alert(
        'Não foi possível abrir a galeria',
        'Confira a permissão de acesso às fotos e tente novamente.',
      );
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
      void analyzeFace(uri, activeSlot);
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

  const collectAlignedFaces = (): AlignedFace[] => {
    const collected: AlignedFace[] = [];
    for (const slot of slots) {
      if (slot.alignedFace && slot.alignedFace.standardized) {
        collected.push(slot.alignedFace);
      }
    }
    return collected;
  };

  const beginSearch = async () => {
    const alignedFaces = collectAlignedFaces();
    if (alignedFaces.length === 0) {
      return;
    }
    if (alignedFaces[0]) {
      setActiveAlignedFace(alignedFaces[0]);
    }
    if (Platform.OS === 'web') {
      void startAnalysis();
      return;
    }
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        setShowOffline(true);
        return;
      }
    } catch {}

    showRewardedAd({
      onRewardEarned: () => {
        void startAnalysis();
      },
      onError: (err) => {
        console.warn('[AdMob] Falha ao carregar anúncio:', err);
        Alert.alert(
          'Anúncio indisponível',
          'Não foi possível carregar o anúncio no momento. Verifique sua conexão com a internet e tente novamente em instantes.',
          [{ text: 'OK' }]
        );
      },
    });
  };

  const startAnalysis = async () => {
    const alignedFaces = collectAlignedFaces();
    if (alignedFaces.length === 0) {
      return;
    }
    if (alignedFaces[0]) {
      setActiveAlignedFace(alignedFaces[0]);
    }
    setShowReward(false);
    setMatchesReturnScreen(screen);
    setScreen('analyzing');
    // Pausa a indexação de segundo plano durante a busca manual para prioridade total na CPU e no SQLite
    try {
      const foregroundIndexLoop = await import(
        '@/services/backgroundIndexing/foregroundIndexLoop'
      );
      foregroundIndexLoop.getActiveForegroundIndexing()?.cancel();
    } catch {}
    try {
      const searchSummary = await indexAndSearch(
        alignedFaces,
        selectedAlbumId,
        precisionLevelToThreshold(precisionLevel),
      );
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
            matchCount={results.length}
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
            onOpenMatches={openMatches}
            activeSlot={activeSlot}
            onSelectSlot={setActiveSlot}
            onClearSlot={clearSlot}
          />
        );
      case 'analyzing':
        return (
          <Analyzing
            progress={faceSearchProgress}
            status={faceSearchStatus}
            error={faceSearchError}
            matchCount={results.length}
            liveMatches={faceSearchLiveMatches}
            searchProgress={faceSearchSearchProgress}
            onCancel={cancelIndexing}
            onDismiss={dismissSearchProgress}
            alignedFaces={collectAlignedFaces()}
          />
        );
      case 'results':
        return (
          <Results
            results={results}
            onNewSearch={matchesReturnScreen ? returnFromMatches : goHome}
            onOpenPhoto={(uri, index) => {
              setViewerPhotos(results.map((r) => r.uri));
              setViewerIndex(index);
            }}
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
            matchCount={results.length}
            indexingState={
              !indexHydrated
                ? 'loading'
                : backgroundIndexState.status === 'completed' ||
                    (typeof backgroundIndexState.totalAssets === 'number' &&
                      backgroundIndexState.totalAssets > 0 &&
                      backgroundIndexState.processedAssets >=
                        backgroundIndexState.totalAssets &&
                      backgroundIndexState.status !== 'cancelled')
                  ? 'completed'
                  : backgroundIndexState.status === 'running' ||
                      backgroundIndexState.status === 'paused' ||
                      (backgroundIndexConsent === 'accepted' &&
                        hasGalleryPhotoAccess &&
                        backgroundIndexState.status !== 'cancelled')
                    ? 'indexing'
                    : 'off'
            }
            indexingCount={backgroundIndexState.processedAssets}
            indexingTotalAssets={backgroundIndexState.totalAssets}
            onOpenMatches={openMatches}
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
    setViewerPhotos,
    setViewerIndex,
    handleSelectAlbum,
    cancelIndexing,
    results,
    backgroundIndexState,
    matchesReturnScreen,
  ]);

  return (
    <>
      <View style={[styles.appShell, { backgroundColor: colors.background }]}>
        {content}
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
      {showOnboardingPermissions ? (
        <OnboardingPermissions onComplete={completeOnboardingPermissions} />
      ) : null}
      <OfflineModal visible={showOffline} onClose={() => setShowOffline(false)} />
      <IndexSettings
        visible={showIndexSettings}
        stats={storedIndexStats}
        operation={faceSearchOperation}
        isOperationActive={faceSearchOperationActive}
        clearState={faceSearchClearState}
        progress={faceSearchProgress}
        onClose={() => setShowIndexSettings(false)}
        onClearIndex={clearLocalIndex}
        backgroundIndexEnabled={
          backgroundIndexConsent === 'accepted' && hasGalleryPhotoAccess
        }
        backgroundIndexState={backgroundIndexState}
        hasGalleryPhotoPermission={hasGalleryPhotoAccess}
        isBackgroundIndexUpdating={isUpdatingBackgroundIndex}
        onBackgroundIndexToggle={toggleBackgroundIndex}
        precisionLevel={precisionLevel}
        onPrecisionLevelChange={handlePrecisionChange}
      />
      <AlbumPicker
        visible={showAlbumPicker}
        selectedAlbumId={selectedAlbumId}
        onSelect={handleSelectAlbum}
        onClose={() => setShowAlbumPicker(false)}
      />
      <PhotoViewer
        visible={viewerPhotos.length > 0}
        photos={viewerPhotos}
        initialIndex={viewerIndex}
        onClose={() => setViewerPhotos([])}
      />
    </>
  );
}

const styles = StyleSheet.create({
  appShell: { flex: 1 },
  screen: { flex: 1 },
  onboardingScroll: { flex: 1 },
  onboardingContent: { flexGrow: 1 },
  contentFrame: { alignSelf: 'center' },
  onboardingBrand: { alignItems: 'center', marginBottom: 14 },
  onboardingEyebrow: { marginTop: 18, marginBottom: 0 },
  brandName: { fontSize: 23, fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
  onboardingCopy: { marginTop: 0 },
  eyebrow: { fontSize: 14, fontFamily: 'Inter_700Bold', letterSpacing: 0.2, marginBottom: 11 },
  onboardingTitle: { fontSize: 32, lineHeight: 36, fontFamily: 'Inter_700Bold', letterSpacing: -1.3 },
  onboardingSubtitle: { fontSize: 15, lineHeight: 23, fontFamily: 'Inter_400Regular', marginTop: 12, maxWidth: 340 },
  privacyList: { gap: 14, marginTop: 24, marginBottom: 20 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  iconCircle: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  privacyText: { flex: 1 },
  privacyTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  privacyDescription: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular' },
  primaryButton: { minHeight: 53, borderRadius: 17, paddingHorizontal: 18, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  highlightedPrimaryButton: { borderWidth: 1, borderColor: '#6EE7B7', elevation: 6 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter_700Bold' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  disabledButton: { opacity: 0.38 },
  legalNote: { textAlign: 'center', fontSize: 11, lineHeight: 16, marginTop: 12, paddingHorizontal: 17 },
  header: { minHeight: 78, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitleWrap: { flex: 1 },
  centeredHeaderTitleWrap: { alignItems: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: -0.4 },
  headerSubtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  headerSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  headerAction: { width: HEADER_ACTION_SIZE, height: HEADER_ACTION_SIZE, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerActionPlaceholder: { width: HEADER_ACTION_SIZE },
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
  helperText: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 14, textAlign: 'center', paddingHorizontal: 23, marginTop: 12 },
  slotSelector: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  slotOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  slotDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  slotLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  cropClearButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
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
  biometricContainerSingle: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  biometricRadarSingle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
  },
  biometricFrameSingle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#070D14',
  },
  biometricImageSingle: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  biometricBeamSingle: {
    position: 'absolute',
    width: 96,
    height: 3,
  },
  biometricContainerDual: {
    minWidth: 200,
    height: 130,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  biometricRadarDual: {
    position: 'absolute',
    width: 196,
    height: 104,
    borderRadius: 52,
    borderWidth: 1.5,
  },
  biometricFrameDual: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#070D14',
  },
  biometricImageDual: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  biometricLinkBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    backgroundColor: '#06130E',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
    zIndex: 2,
  },
  biometricBeamDual: {
    position: 'absolute',
    width: 184,
    height: 3,
  },
  biometricBeamGradient: {
    flex: 1,
    height: '100%',
  },
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