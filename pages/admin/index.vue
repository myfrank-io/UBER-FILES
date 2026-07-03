<script setup lang="ts">
// Back-office admin (Chams) : pilotage des chauffeurs, activité, facturation.
definePageMeta({ layout: 'default', middleware: 'admin' })
useHead({ title: 'Administration — Chams' })
const { formatMoney, formatDateTime } = useFormat()

const { data, refresh } = await useFetch('/api/admin/overview')
const { clear } = useUserSession()

const showCreate = ref(false)
const form = reactive({ slug: '', displayName: '', email: '', password: '', phone: '' })
const errorMsg = ref('')
const result = ref<{ telegramLinkCode: string; slug: string } | null>(null)
const creating = ref(false)

async function createDriver() {
  creating.value = true
  errorMsg.value = ''
  result.value = null
  try {
    result.value = await $fetch('/api/admin/drivers', {
      method: 'POST',
      body: {
        slug: form.slug,
        displayName: form.displayName,
        email: form.email,
        password: form.password,
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

    <!-- Création -->
    <div class="mt-8">
      <button class="btn-primary" @click="showCreate = !showCreate">
        {{ showCreate ? 'Fermer' : '+ Nouveau chauffeur' }}
      </button>
    </div>

    <div v-if="showCreate" class="card mt-4">
      <h2 class="font-semibold text-slate-900">Onboarder un chauffeur</h2>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <input v-model="form.displayName" class="field" placeholder="Nom affiché" />
        <input v-model="form.slug" class="field" placeholder="slug-url (ex: karim-paris)" />
        <input v-model="form.email" class="field" type="email" placeholder="Email de connexion" />
        <input v-model="form.password" class="field" type="text" placeholder="Mot de passe initial (8+)" />
        <input v-model="form.phone" class="field" placeholder="Téléphone (optionnel)" />
      </div>
      <p v-if="errorMsg" class="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{{ errorMsg }}</p>
      <div v-if="result" class="mt-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
        ✅ Chauffeur créé. Page : <strong>/{{ result.slug }}</strong>.
        Code d'appairage Telegram : <code class="rounded bg-white px-1.5 py-0.5">{{ result.telegramLinkCode }}</code>
        (le chauffeur envoie <code>/start {{ result.telegramLinkCode }}</code> au bot).
      </div>
      <button class="btn-primary mt-4" :disabled="creating" @click="createDriver">
        {{ creating ? '…' : 'Créer le compte' }}
      </button>
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
