<script setup lang="ts">
// L'onglet « Clients » a été intégré à l'accueil. On redirige l'ancienne route
// vers le sous-onglet correspondant pour préserver les liens existants.
definePageMeta({ redirect: '/dashboard?tab=clients' })
</script>
