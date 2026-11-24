import '@abraham/reflection';
import { config } from '@vue/test-utils';
import { vuetify } from './app-modules/core/plugins/vuetify';

// Install vuetify in globally in mock function
config.global.plugins.push(vuetify);
(global.CSS as any) = { supports: () => false };
