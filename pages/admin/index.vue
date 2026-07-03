<script setup lang="ts">
// Back-office admin (Chams) : pilotage des chauffeurs, activité, facturation.
definePageMeta({ layout: 'default', middleware: 'admin' })
useHead({ title: 'Administration — Chams' })
const { formatMoney, formatDateTime } = useFormat()

const { data, refresh } = await useFetch('/api/admin/overview')
const { clear } = useUserSession()

const showCreate = ref(false)
const form = reactive({ firstName: '', email: '', phone: '' })
const errorMsg = ref('')
const result = ref<{ slug: string; firstName: string; inviteUrl: string } | null>(null)
const creating = ref(false)

async function inviteDriver() {
  creating.value = true
  errorMsg.value = ''
  result.value = null
  try {
    result.value = await $fetch('/api/admin/invite-driver', {
      method: 'POST',
      body: {
        firstName: form.firstName,
        email: form.email,
        phone: form.phone || undefined,
      },
    })
    await refresh()
  } catch (e) {
    errorMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    creating.value = false
  }
}

// Lien WhatsApp pré-rempli avec le message d'invitation. Le numéro est normalisé
// au format international (les numéros français commençant par 0 → +33).
function normalizePhone(phone: string): string {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.length === 10 && d.startsWith('0')) d = '33' + d.slice(1)
  return d
}
const whatsappUrl = computed(() => {
  if (!result.value || !form.phone) return null
  const digits = normalizePhone(form.phone)
  if (!digits) return null
  const message = `Bonjour ${result.value.firstName}, voici votre lien pour créer votre espace chauffeur Ridewiz : ${result.value.inviteUrl}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
})

function resetInvite() {
  form.firstName = ''
  form.email = ''
  form.phone = ''
  result.value = null
  errorMsg.value = ''
}

async function setStatus(id: string, status: string) {
  await $fetch(`/api/admin/drivers/${id}/status`, { method: 'PATCH', body: { status } })
  await refresh()
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/dashboard/login')
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  SUSPENDED: 'bg-red-100 text-red-700',
  PENDING: 'bg-amber-100 text-amber-800',
}

const search = ref('')
const filteredDrivers = computed(() => {
  if (!data.value?.drivers) return []
  const q = search.value.toLowerCase().trim()
  if (!q) return data.value.drivers
  return data.value.drivers.filter((d) =>
    d.displayName.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q),
  )
})
</script>

<template>
  <div class="mx-auto max-w-5xl px-5 py-8">
    <div class="flex items-center justify-between">
      <h1 class="font-serif text-2xl font-medium tracking-tight text-slate-900">Administration — Chams</h1>
      <button class="text-sm text-slate-400 hover:text-slate-700" @click="logout">Déconnexion</button>
    </div>

    <!-- Stats -->
    <div v-if="data" class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard title="Chauffeurs" :value="data.stats.driversTotal" />
      <StatCard title="Actifs" :value="data.stats.driversActive" />
      <StatCard title="Courses" :value="data.stats.bookingsConfirmed" />
      <StatCard title="Volume encaissé" :value="formatMoney(data.stats.gmvCents)" />
    </div>

    <!-- Invitation d'un chauffeur -->
    <div class="mt-8">
      <button class="btn-primary" @click="showCreate = !showCreate">
        {{ showCreate ? 'Fermer' : '+ Nouveau chauffeur' }}
      </button>
    </div>

    <div v-if="showCreate" class="card mt-4">
      <h2 class="font-semibold text-slate-900">Inviter un chauffeur</h2>
      <p class="mt-1 text-sm text-slate-500">
        Renseignez son prénom et son email : il recevra un lien pour créer son compte.
      </p>

      <!-- Formulaire d'invitation -->
      <template v-if="!result">
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <input v-model="form.firstName" class="field" placeholder="Prénom" />
          <input v-model="form.email" class="field" type="email" placeholder="Email" />
          <input v-model="form.phone" class="field" placeholder="Téléphone (optionnel)" />
        </div>
        <p v-if="errorMsg" class="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{{ errorMsg }}</p>
        <button
          class="btn-primary mt-4"
          :disabled="creating || !form.firstName.trim() || !form.email.trim()"
          @click="inviteDriver"
        >
          {{ creating ? 'Envoi…' : '✉️ Envoyer l’invitation' }}
        </button>
      </template>

      <!-- Confirmation + option WhatsApp -->
      <div v-else class="mt-4 space-y-3">
        <div class="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          ✅ Invitation envoyée à <strong>{{ result.firstName }}</strong> par email.
          Sa page sera <strong>/{{ result.slug }}</strong> une fois son compte activé.
        </div>
        <div class="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-600">
          Lien d’invitation :
          <a :href="result.inviteUrl" target="_blank" class="break-all text-brand-600 hover:underline">{{ result.inviteUrl }}</a>
        </div>
        <div class="flex flex-wrap gap-3">
          <a
            v-if="whatsappUrl"
            :href="whatsappUrl"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1EBE5B]"
          >
            💬 Envoyer l’invitation sur WhatsApp
          </a>
          <button class="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50" @click="resetInvite">
            Inviter un autre chauffeur
          </button>
        </div>
      </div>
    </div>

    <!-- Liste chauffeurs -->
    <div class="mt-8">
      <input v-model="search" class="field max-w-sm" placeholder="Rechercher par nom ou slug…" />
    </div>
    <div class="mt-3 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th class="py-2">Chauffeur</th><th>Statut</th><th>SumUp</th><th>Courses</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in filteredDrivers" :key="d.id" class="border-b border-slate-100">
            <td class="py-3">
              <NuxtLink :to="`/admin/drivers/${d.id}`" class="font-medium text-slate-900 hover:text-brand-600">{{ d.displayName }}</NuxtLink>
              <br />
              <NuxtLink :to="`/${d.slug}`" target="_blank" class="text-xs text-brand-600 hover:underline">/{{ d.slug }}</NuxtLink>
            </td>
            <td><span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusColors[d.status]">{{ d.status }}</span></td>
            <td>{{ d.sumupConnected ? '✅' : '⏳' }}</td>
            <td>{{ d.bookings }}</td>
            <td class="text-right">
              <NuxtLink :to="`/admin/drivers/${d.id}`" class="mr-2 text-xs text-slate-500 hover:text-slate-800">Détail →</NuxtLink>
              <button v-if="d.status !== 'ACTIVE'" class="text-xs font-semibold text-green-700 hover:underline" @click="setStatus(d.id, 'ACTIVE')">Activer</button>
              <button v-else class="text-xs font-semibold text-red-600 hover:underline" @click="setStatus(d.id, 'SUSPENDED')">Suspendre</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="filteredDrivers.length === 0" class="py-8 text-center text-sm text-slate-400">Aucun chauffeur trouvé.</p>
    </div>
  </div>
</template>
