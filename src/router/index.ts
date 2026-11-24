import { createRouter, createWebHistory } from 'vue-router'
import GeneralView from "@/views/GeneralView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'general-view',
      component: GeneralView,
    },
    {
      path: '/hex/:id',
      name: 'hex-detail',
      component: () => import('../views/TemplateHexInfo.vue') // ленивая загрузка
    }
  ]
})

export default router
