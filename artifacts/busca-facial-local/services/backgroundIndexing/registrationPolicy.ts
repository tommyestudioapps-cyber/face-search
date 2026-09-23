import type { BackgroundIndexConsentStatus } from './consent';

export type RegistrationAction = 'register' | 'unregister' | 'none';

export function registrationAction(
  consent: BackgroundIndexConsentStatus,
  hasPermission: boolean,
  isRegistered: boolean,
): RegistrationAction {
  if (consent !== 'accepted' || !hasPermission) {
    return isRegistered ? 'unregister' : 'none';
  }
  return isRegistered ? 'none' : 'register';
}