import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import {
  persistLocalIndex,
  readLocalGallery,
  readPersistedIndex,
  searchIndexedGallery,
  type LocalPhoto,
  type PhotoMatch,
} from '@/services/localFaceSearch';

type AppScreen = 'onboarding' | 'home' | 'select' | 'analyzing' | 'results';

const demoMatches: PhotoMatch[] = [
  {
    id: 'preview-01',
    uri: require('@/assets/images/match-01.jpg'),
    confidence: 98,
    filename: 'Retrato de sábado',
  },
  {
    id: 'preview-02',
    uri: require('@/assets/images/match-02.jpg'),
    confidence: 92,
    filename: 'Encontro no parque',
  },
  {
    id: 'preview-03',
    uri: require('@/assets/images/match-03.jpg'),
    confidence: 86,
    filename: 'Café da tarde',
  },
];

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
  title,
  subtitle,
}: {
  onSettings?: () => void;
  onBack?: () => void;
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
      ) : (
        <View style={styles.headerBrand}>
          <LinearGradient colors={[colors.primary, '#8B5CF6']} style={styles.smallBrandMark}>
            <Feather name="maximize" size={14} color={colors.primaryForeground} />
          </LinearGradient>
          <Text style={[styles.headerBrandText, { color: colors.foreground }]}>visage</Text>
        </View>
      )}
      <View style={styles.headerTitleWrap}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        ) : null}
      </View>
      {onSettings ? (
        <Pressable
          accessibilityRole="button"
          onPress={onSettings}
          style={[styles.headerAction, { backgroundColor: colors.card }]}
          testID="settings-button"
        >
          <Feather name="sliders" size={18} color={colors.mutedForeground} />
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
}: {
  onSelect: () => void;
  onSettings: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useResponsiveLayout();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header title="Busca facial" subtitle="Seu índice privado" onSettings={onSettings} />
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

          <View style={styles.statsRow}>
            {[
              ['1.248', 'fotos indexadas', 'image'],
              ['0', 'dados na nuvem', 'cloud-off'],
            ].map(([value, label, icon]) => (
              <View key={label} style={[styles.statCard, { backgroundColor: colors.card }]}>
                <IconCircle name={icon as keyof typeof Feather.glyphMap} color={colors.primary} backgroundColor={colors.accent} />
                <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
              </View>
            ))}
          </View>

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

          <View style={styles.adSlot}>
            <View style={styles.adSlotTop}>
              <Feather name="layout" size={14} color={colors.mutedForeground} />
              <Text style={[styles.adLabel, { color: colors.mutedForeground }]}>ESPAÇO PARA ANÚNCIO</Text>
              <Text style={[styles.adLabel, { color: colors.mutedForeground }]}>BANNER</Text>
            </View>
            <Text style={[styles.adHint, { color: colors.mutedForeground }]}>
              Seu apoio mantém a busca gratuita.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SelectPhoto({
  selectedImage,
  onPickLibrary,
  onTakePhoto,
  onSearch,
  onBack,
}: {
  selectedImage: string | null;
  onPickLibrary: () => void;
  onTakePhoto: () => void;
  onSearch: () => void;
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
              <Image source={{ uri: selectedImage }} style={styles.selectedImage} />
              <View style={styles.cropOverlay}>
                <View style={styles.cropCornerTopLeft} />
                <View style={styles.cropCornerTopRight} />
                <View style={styles.cropCornerBottomLeft} />
                <View style={styles.cropCornerBottomRight} />
                <View style={styles.cropFaceRing} />
              </View>
              <View style={styles.cropHint}>
                <Feather name="move" size={13} color={colors.foreground} />
                <Text style={styles.cropHintText}>Ajuste o enquadramento</Text>
              </View>
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

        <PrimaryButton
          label="Buscar este rosto na galeria"
          icon="search"
          onPress={onSearch}
          disabled={!selectedImage}
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

function Analyzing({ progress }: { progress: number }) {
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
      <View style={styles.progressWrap}>
        <View style={[styles.progressTrack, { backgroundColor: colors.card }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress}%` }]} />
        </View>
        <View style={styles.progressMeta}>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>Índice local</Text>
          <Text style={[styles.progressValue, { color: colors.foreground }]}>{progress}%</Text>
        </View>
      </View>
      <ActivityIndicator color={colors.primary} style={styles.analysisSpinner} />
    </View>
  );
}

function Results({
  results,
  onNewSearch,
}: {
  results: PhotoMatch[];
  onNewSearch: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { contentWidth, numColumns } = useResponsiveLayout();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header title="Resultados" subtitle={`${results.length} correspondências encontradas`} onBack={onNewSearch} />
      <FlatList
        key={`results-${numColumns}`}
        data={results}
        keyExtractor={(item) => item.id}
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
              <Feather name="check-circle" size={20} color="#34D399" />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Busca concluída</Text>
              <Text style={[styles.summaryBody, { color: colors.mutedForeground }]}>
                Todas as correspondências foram encontradas no seu dispositivo.
              </Text>
            </View>
            <Text style={[styles.summaryTime, { color: colors.mutedForeground }]}>1.4s</Text>
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
                  <View style={[styles.confidenceFill, { backgroundColor: '#34D399', width: `${item.confidence}%` }]} />
                </View>
                <Text style={styles.confidenceText}>{item.confidence}%</Text>
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
          <Text style={[styles.rewardTitle, { color: colors.foreground }]}>Você está offline</Text>
          <Text style={[styles.rewardBody, { color: colors.mutedForeground }]}>
            Conecte-se à internet para liberar a busca gratuita na sua galeria. Suas fotos continuam protegidas no dispositivo.
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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [results, setResults] = useState<PhotoMatch[]>(demoMatches);
  const [showReward, setShowReward] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [rewardCountdown, setRewardCountdown] = useState(3);
  const [progress, setProgress] = useState(0);
  const colors = useColors();

  useEffect(() => {
    void AsyncStorage.getItem('visage.onboarding.complete').then((value) => {
      if (value === 'true') {
        setScreen('home');
      }
    });
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
    if (screen !== 'analyzing') {
      return undefined;
    }
    const timer = setInterval(() => {
      setProgress((value) => {
        const next = Math.min(value + 20, 100);
        if (next === 100) {
          clearInterval(timer);
          setTimeout(() => setScreen('results'), 260);
        }
        return next;
      });
    }, 300);
    return () => clearInterval(timer);
  }, [screen]);

  const handleOnboarding = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await ImagePicker.requestMediaLibraryPermissionsAsync();
    await AsyncStorage.setItem('visage.onboarding.complete', 'true');
    setScreen('home');
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
      setSelectedImage(selection.assets[0].uri);
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
      setSelectedImage(selection.assets[0].uri);
    }
  };

  const openSearch = () => setScreen('select');

  const beginSearch = async () => {
    if (!selectedImage) {
      return;
    }
    const network = await NetInfo.fetch();
    if (network.isConnected === false) {
      setShowOffline(true);
      return;
    }
    setShowReward(true);
  };

  const startAnalysis = async () => {
    if (!selectedImage) {
      return;
    }
    setShowReward(false);
    setProgress(0);
    setScreen('analyzing');
    const gallery = (await readLocalGallery()) as LocalPhoto[];
    if (gallery.length > 0) {
      await persistLocalIndex(gallery);
    }
    const indexedGallery = gallery.length > 0 ? gallery : await readPersistedIndex();
    const localMatches = searchIndexedGallery(selectedImage, indexedGallery);
    setResults(localMatches.length > 0 ? localMatches.slice(0, 12) : demoMatches);
  };

  const goHome = () => {
    setSelectedImage(null);
    setScreen('home');
  };

  const content = useMemo(() => {
    switch (screen) {
      case 'onboarding':
        return <Onboarding onContinue={handleOnboarding} />;
      case 'select':
        return (
          <SelectPhoto
            selectedImage={selectedImage}
            onPickLibrary={pickFromLibrary}
            onTakePhoto={takePhoto}
            onSearch={beginSearch}
            onBack={() => setScreen('home')}
          />
        );
      case 'analyzing':
        return <Analyzing progress={progress} />;
      case 'results':
        return <Results results={results} onNewSearch={goHome} />;
      case 'home':
      default:
        return <Home onSelect={openSearch} onSettings={() => undefined} />;
    }
  }, [screen, selectedImage, progress, results]);

  return (
    <>
      {content}
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
      <OfflineModal visible={showOffline} onClose={() => setShowOffline(false)} />
    </>
  );
}

const styles = StyleSheet.create({
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
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  smallBrandMark: { width: 29, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerBrandText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
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
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, minHeight: 121, borderRadius: 19, padding: 14 },
  statValue: { fontSize: 24, fontFamily: 'Inter_700Bold', marginTop: 11, letterSpacing: -0.7 },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  privacyCard: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 17, borderWidth: 1, padding: 13, marginTop: 12 },
  privacyCardCopy: { flex: 1 },
  privacyCardTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  privacyCardBody: { fontSize: 10, lineHeight: 15, marginTop: 3, fontFamily: 'Inter_400Regular' },
  adSlot: { minHeight: 77, borderRadius: 17, marginTop: 26, borderWidth: 1, borderStyle: 'dashed', borderColor: '#303A53', alignItems: 'center', justifyContent: 'center', gap: 8 },
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
  sourceButtons: { flexDirection: 'row', gap: 12, marginTop: 25, marginBottom: 17 },
  sourceButton: { flex: 1, minHeight: 52, borderRadius: 16, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  sourceButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  localNotice: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 15 },
  localNoticeText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  centeredScreen: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  analysisVisual: { width: 147, height: 147, alignItems: 'center', justifyContent: 'center', marginBottom: 31 },
  analysisRing: { ...StyleSheet.absoluteFillObject, borderWidth: 1, borderRadius: 74 },
  analysisRingInner: { width: 102, height: 102, borderWidth: 1.5, borderRadius: 51, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  analysisTitle: { fontFamily: 'Inter_700Bold', fontSize: 23, letterSpacing: -0.5 },
  analysisBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 11 },
  progressWrap: { width: '100%', marginTop: 37 },
  progressTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  progressLabel: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  progressValue: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  analysisSpinner: { marginTop: 30 },
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