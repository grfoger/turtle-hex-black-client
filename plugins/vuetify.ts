// import this after install `@mdi/font` package
import '@mdi/font/css/materialdesignicons.css'

import 'vuetify/styles'
import { createVuetify } from 'vuetify'



export default defineNuxtPlugin((app) => {
    const vuetifyConfig = {
        // Здесь указываются опции по умолчанию для Vuetify
        theme: {
            defaultTheme: 'light', // Определение темы по умолчанию
            themes: {
                light: {
                    dark: false,
                    colors: {
                        background: '#FFFFFF',
                        surface: '#F5F5F5',
                        primary: '#6200EE',
                        secondary: '#03DAC6',
                    },
                },
                dark: {
                    dark: true,
                    colors: {
                        background: '#121212',
                        surface: '#333333',
                        primary: '#BB86FC',
                        secondary: '#03DAC6',
                    },
                },
            },
        },
        // Дополнительные настройки, которые могут быть полезны:
        defaults: {
            VAlert: { variant: 'tonal', VIcon: { size: '12' } },
            VBtn: { rounded: true },
            VCard: { rounded: 'lg', elevation: 12, border: true },
        },
    };

    const vuetify = createVuetify(vuetifyConfig)
    app.vueApp.use(vuetify)
})
