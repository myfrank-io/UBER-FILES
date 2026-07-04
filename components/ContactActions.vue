<script setup lang="ts">
// Pastilles de contact : appeler, envoyer un SMS ou un email en un geste.
// Pensé mobile-first (liens tel:/sms:/mailto: natifs). `@click.stop` : ne
// déclenche pas le clic des cartes parentes (détail réservation, etc.).
const props = defineProps<{
  phone?: string | null
  email?: string | null
  // Par défaut le numéro est affiché dans la pastille d'appel (reconnaissable) ;
  // passer false pour un simple « Appeler » compact.
  showPhone?: boolean
}>()

const tel = computed(() => (props.phone ?? '').replace(/[^+\d]/g, ''))
</script>

<template>
  <span v-if="phone || email" class="flex flex-wrap items-center gap-1.5" @click.stop>
    <a
      v-if="phone"
      :href="`tel:${tel}`"
      class="inline-flex min-h-[40px] items-center gap-1 rounded-full border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-brand-400 hover:text-brand-700"
    >
      📞 {{ showPhone === false ? 'Appeler' : phone }}
    </a>
    <a
      v-if="phone"
      :href="`sms:${tel}`"
      class="inline-flex min-h-[40px] items-center gap-1 rounded-full border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-brand-400 hover:text-brand-700"
    >
      💬 SMS
    </a>
    <a
      v-if="email"
      :href="`mailto:${email}`"
      :title="email"
      class="inline-flex min-h-[40px] items-center gap-1 rounded-full border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-brand-400 hover:text-brand-700"
    >
      ✉️ Email
    </a>
  </span>
</template>
