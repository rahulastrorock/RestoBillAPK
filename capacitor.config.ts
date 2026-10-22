import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.restobill.app',
  appName: 'RestoBill',
  webDir: 'src/renderer',
  android: {
    allowMixedContent: true,
    backgroundColor: '#0f1117',
  },
  server: {
    androidScheme: 'https'
  }
};

export default config;
