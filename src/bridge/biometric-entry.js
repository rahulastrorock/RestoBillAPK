import { Capacitor, registerPlugin } from '@capacitor/core';
import { NativeBiometric, BiometryType } from '@capgo/capacitor-native-biometric';

window.Capacitor = Capacitor;
window.NativeBiometric = NativeBiometric;
window.BiometryType = BiometryType;
