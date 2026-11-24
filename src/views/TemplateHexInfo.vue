<template>
  <div class="home">
    <h1>Детали гекса #{{ $route.params.id }}</h1>
    <router-link to="/">Назад</router-link>
    <TestMapView />
  </div>

</template>
<script setup lang="ts">
import TestMapView from "@/components/TestMapView.vue";
</script>
<style scoped>
.home {
  width: 100%;
  height: 100vh;
}
</style>
