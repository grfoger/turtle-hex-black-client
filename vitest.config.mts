import { defineVitestConfig } from '@nuxt/test-utils/config';
import swc from 'unplugin-swc';

export default defineVitestConfig({
  test: {
    onConsoleLog: (log) => {
      if (log.includes('<Suspense>')) return false;
    },
    globals: true,
    setupFiles: ['vuetify.config.ts', 'inputmask.config.ts'],
    deps: {
      inline: ['vuetify'],
    },
    coverage: {
      provider: 'v8',
    },
  },
  plugins: [
    swc.vite(), // Плагин для восстановления поддержки декораторов в Vite
  ],
});
