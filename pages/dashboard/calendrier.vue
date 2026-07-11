<script setup lang="ts">
// « Calendrier » a fusionné avec les réservations dans l'onglet « Courses »
// (vue agenda par défaut). On redirige l'ancienne route pour préserver les
// liens existants.
definePageMeta({ redirect: '/dashboard/courses' })
</script>
