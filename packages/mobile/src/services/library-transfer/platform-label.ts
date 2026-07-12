import { Platform } from 'react-native';

export function getLibraryTransferDeviceName(): string {
  return Platform.OS === 'ios' ? 'TON iOS' : 'TON Android';
}
