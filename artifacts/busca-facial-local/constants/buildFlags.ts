export const DIAG_FLAGS = {
  ads: process.env.EXPO_PUBLIC_DIAG_ADS ?? 'on',
  autoresume: process.env.EXPO_PUBLIC_DIAG_AUTORESUME ?? 'on',
};

export const isAdsDisabled = DIAG_FLAGS.ads === 'off';
export const isAutoresumeDisabled = DIAG_FLAGS.autoresume === 'off';
