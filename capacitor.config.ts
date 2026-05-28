import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.danzai.mianleme',
  appName: '面了么',
  webDir: 'dist',
  backgroundColor: '#F2F2F7',
  zoomEnabled: false,
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
  },
  server: {
    allowNavigation: [
      'interview.danzaii.cn',
      'mianleme.vercel.app',
    ],
  },
};

export default config;
