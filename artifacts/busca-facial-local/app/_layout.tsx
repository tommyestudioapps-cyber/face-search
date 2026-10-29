import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { bootMark } from '@/services/observability/bootTrace';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
bootMark('_layout.tsx top-level evaluated');

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Voltar' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  bootMark('RootLayout render start');
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    bootMark('RootLayout mounted useEffect');
    if (__DEV__) {
      console.info('[startup] RootLayout mounted');
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      bootMark('RootLayout SplashScreen.hideAsync calling');
      SplashScreen.hideAsync();
      bootMark('RootLayout SplashScreen.hideAsync called');
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    bootMark('RootLayout awaiting fonts - returning null');
    return null;
  }

  bootMark('RootLayout returning JSX');
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <RootLayoutNav />
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
