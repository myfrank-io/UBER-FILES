<script setup lang="ts">
// L'onglet « Gains » a été supprimé (l'accueil affiche l'essentiel du mois).
// On redirige l'ancienne route vers l'accueil pour préserver les liens existants.
definePageMeta({ redirect: '/dashboard' })
</script>
