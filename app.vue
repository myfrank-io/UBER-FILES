<script setup lang="ts">
// Point d'entrée de l'application. Le layout par défaut englobe les pages.
</script>

<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <!-- ⚠️ Outil de dev (commutateur d'espaces) — invisible en production, à retirer en V1 finale -->
    <DevSwitcher />
  </div>
</template>
