<script setup lang="ts">
// Layout par défaut minimal : chaque section (page publique, back-office) gère son propre habillage.
</script>

<template>
  <!-- Le sélecteur de langue n'est plus global : seules les pages client
       traduites ([slug], devis, réservation) l'affichent, dans leur flux. -->
  <div class="min-h-screen">
    <slot />
    <AppToast />
  </div>
</template>
