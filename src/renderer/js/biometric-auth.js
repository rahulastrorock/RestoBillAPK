/**
 * RestoBill - Hardware Biometric Authentication Service
 * 
 * Provides REAL physical fingerprint and biometric verification via:
 * 1. Native Android BiometricPrompt (via @capgo/capacitor-native-biometric) on Android APK.
 * 2. WebAuthn Platform Authenticator (Windows Hello / Touch ID / WebAuthn) in modern browsers.
 */

window.BiometricAuth = {
  /**
   * Check if real physical biometric hardware is available and enrolled on the device.
   * @returns {Promise<{available: boolean, mode: 'native' | 'webauthn' | 'none', label: string, biometryType?: number, reason?: string}>}
   */
  async checkAvailability() {
    // 1. Check Native Android / Capacitor environment
    if (window.NativeBiometric) {
      try {
        const isNative = window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' 
          ? window.Capacitor.isNativePlatform() 
          : false;

        // If running inside Android Capacitor APK
        if (isNative) {
          const res = await window.NativeBiometric.isAvailable({ useFallback: true });
          if (res && res.isAvailable) {
            return {
              available: true,
              mode: 'native',
              label: 'Android Fingerprint / Biometrics',
              biometryType: res.biometryType || 3
            };
          } else {
            return {
              available: false,
              mode: 'none',
              label: 'Native Biometrics',
              reason: 'No biometric hardware detected or no fingerprints are enrolled in Android Settings.'
            };
          }
        }
      } catch (e) {
        console.warn('Native biometric availability check error:', e);
      }
    }

    // 2. Check WebAuthn Platform Authenticator (Windows Hello, Touch ID, Android Chrome WebAuthn)
    if (window.PublicKeyCredential && typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      try {
        const hasPlatformAuth = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (hasPlatformAuth) {
          return {
            available: true,
            mode: 'webauthn',
            label: 'Platform Biometrics (Windows Hello / Touch ID / WebAuthn)'
          };
        }
      } catch (e) {
        console.warn('WebAuthn platform check error:', e);
      }
    }

    // If on native Android without enrolled fingerprints
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return {
        available: false,
        mode: 'none',
        label: 'Android Fingerprint',
        reason: 'Please set up a fingerprint or screen lock in your Android phone Settings first.'
      };
    }

    return {
      available: false,
      mode: 'none',
      label: 'No Biometric Sensor',
      reason: 'No physical biometric sensor (fingerprint / Face) detected on this browser/device.'
    };
  },

  /**
   * Physically enroll / verify fingerprint on the hardware.
   * @param {string} username 
   * @param {string} displayName 
   * @returns {Promise<{success: boolean, mode: string, credentialId?: string}>}
   */
  async enroll(username, displayName) {
    const avail = await this.checkAvailability();
    if (!avail.available) {
      throw new Error(avail.reason || 'Biometric hardware sensor is not available on this device.');
    }

    if (avail.mode === 'native') {
      // Android Native Biometric Prompt: physically waits for finger touch
      await window.NativeBiometric.verifyIdentity({
        title: 'Register Fingerprint',
        subtitle: `Link fingerprint to @${username} (${displayName})`,
        description: 'Touch your device fingerprint sensor to confirm registration',
        negativeButtonText: 'Cancel',
        maxAttempts: 3
      });

      return {
        success: true,
        mode: 'native'
      };
    }

    if (avail.mode === 'webauthn') {
      // Browser WebAuthn Prompt (Windows Hello / Touch ID)
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const userId = new TextEncoder().encode(username + '_' + Date.now());

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: 'RestoBill',
            id: window.location.hostname || 'localhost'
          },
          user: {
            id: userId,
            name: username,
            displayName: displayName || username
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },  // ES256
            { alg: -257, type: 'public-key' } // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required'
          },
          timeout: 60000
        }
      });

      if (!credential) {
        throw new Error('Biometric registration was cancelled.');
      }

      // Convert rawId to Base64 for storing
      const rawIdBytes = new Uint8Array(credential.rawId);
      let binaryStr = '';
      for (let i = 0; i < rawIdBytes.byteLength; i++) {
        binaryStr += String.fromCharCode(rawIdBytes[i]);
      }
      const credentialId = btoa(binaryStr);

      return {
        success: true,
        mode: 'webauthn',
        credentialId
      };
    }

    throw new Error('Unsupported biometric authentication mode.');
  },

  /**
   * Physically authenticate the user with their fingerprint.
   * @param {string} username 
   * @param {object} profile The stored registration metadata
   * @returns {Promise<boolean>}
   */
  async verify(username, profile = {}) {
    const avail = await this.checkAvailability();
    if (!avail.available) {
      throw new Error(avail.reason || 'Biometric hardware sensor is not available on this device.');
    }

    if (avail.mode === 'native') {
      // Android Native Biometric Prompt: triggers Android OS dialog and waits for physical finger touch
      await window.NativeBiometric.verifyIdentity({
        title: 'RestoBill Fingerprint Login',
        subtitle: `Authenticating as ${profile.name || username}`,
        description: 'Touch your device fingerprint sensor to sign in',
        negativeButtonText: 'Use Password Instead'
      });

      return true;
    }

    if (avail.mode === 'webauthn') {
      // Browser WebAuthn prompt
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const getOptions = {
        publicKey: {
          challenge,
          rpId: window.location.hostname || 'localhost',
          userVerification: 'required',
          timeout: 60000
        }
      };

      if (profile.credentialId) {
        const binStr = atob(profile.credentialId);
        const credId = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
          credId[i] = binStr.charCodeAt(i);
        }
        getOptions.publicKey.allowCredentials = [{
          id: credId,
          type: 'public-key'
        }];
      }

      const assertion = await navigator.credentials.get(getOptions);
      if (!assertion) {
        throw new Error('Biometric verification cancelled.');
      }

      return true;
    }

    throw new Error('No supported biometric verification method available.');
  }
};
