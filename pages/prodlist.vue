<template>
  <div style="justify-items: center">
    <v-alert min-width="400px" type="warning">Страница под авторизацией</v-alert>
  </div>

  <prodlist/>
</template>

<script setup lang="ts">
 import {definePageMeta} from "#imports";

 definePageMeta ({
    requiresAuth: true,
 })
</script>

<style scoped>

</style>
