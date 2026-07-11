<script setup lang="ts">
// « Clients » vit désormais dans l'onglet « Courses » (vue clients). On
// redirige l'ancienne route pour préserver les liens existants.
definePageMeta({ redirect: '/dashboard/courses?vue=clients' })
</script>
