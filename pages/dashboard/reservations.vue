<script setup lang="ts">
// « Réservations » a fusionné avec le calendrier dans l'onglet « Courses ».
// On redirige l'ancienne route vers la vue liste pour préserver les liens
// existants (emails, favoris).
definePageMeta({ redirect: '/dashboard/courses?vue=liste' })
</script>
