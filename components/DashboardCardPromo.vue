<script setup lang="ts">
// Invitation à publier sa carte de visite, sur l'accueil du dashboard.
//
// Elle prend EXACTEMENT la place laissée libre par « Finalisez votre
// configuration » : elle n'apparaît qu'une fois toutes les étapes obligatoires
// faites, au moment où le chauffeur vient de terminer sa mise en route — et
// disparaît dès que la carte est publiée. Jamais deux sollicitations en même
// temps sur cet écran.
import { computeOnboarding } from '~/lib/onboarding'

const { data: me } = await useMe()

const visible = computed(() => {
  const m = me.value as {
    photoUrl?: string | null
    tagline?: string | null
    vehicleCount?: number
    phone?: string | null
    transferBands?: unknown[]
    hourlyRateCents?: number | null
    paymentMethods?: string[]
    stripe?: { connected?: boolean }
    sumup?: { connected?: boolean }
    telegramLinked?: boolean
    card?: { published?: boolean }
  } | null
  if (!m) return false
  if (m.card?.published) return false

  const onboarding = computeOnboarding({
    hasPhoto: Boolean(m.photoUrl),
    hasIntro: Boolean(m.tagline),
    vehicleCount: m.vehicleCount ?? 0,
    hasPhone: Boolean(m.phone),
    hasRates: (m.transferBands?.length ?? 0) > 0 || m.hourlyRateCents != null,
    paymentMethods: (m.paymentMethods ?? []) as never,
    onlinePayoutReady: Boolean(m.stripe?.connected || m.sumup?.connected),
    telegramLinked: Boolean(m.telegramLinked),
  })
  return onboarding.complete
})
</script>

<template>
  <NuxtLink
    v-if="visible"
    to="/dashboard/carte"
    class="card block border-brand-100 bg-gradient-to-br from-brand-50/70 to-white !p-4 transition-colors hover:border-brand-200"
  >
    <div class="flex items-center gap-3">
      <span class="text-2xl" aria-hidden="true">🪪</span>
      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-semibold text-slate-900">Votre carte de visite est prête</h2>
        <p class="mt-0.5 text-[13px] leading-snug text-slate-600">
          Pré-remplie avec vos infos : relisez-la et publiez-la pour la partager par lien ou QR code.
        </p>
      </div>
      <span class="shrink-0 text-slate-400" aria-hidden="true">
        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" />
        </svg>
      </span>
    </div>
  </NuxtLink>
</template>
