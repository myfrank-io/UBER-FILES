<script setup lang="ts">
// Back-office admin (Chams) : pilotage des chauffeurs, activité, facturation.
definePageMeta({ layout: 'default', middleware: 'admin' })
useHead({ title: 'Administration — Chams' })
const { formatMoney, formatDateTime } = useFormat()

const { data, refresh } = await useFetch('/api/admin/overview')
const { clear } = useUserSession()

const showCreate = ref(false)
const form = reactive({ slug: '', displayName: '', email: '', password: '', phone: '', siren: '', monthlyFee: 49 })
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
        siren: form.siren || undefined,
        monthlyFeeCents: Math.round(form.monthlyFee * 100),
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
</script>

<template>
  <div class="mx-auto max-w-5xl px-5 py-8">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-slate-900">Administration — Chams</h1>
      <button class="text-sm text-slate-400 hover:text-slate-700" @click="logout">Déconnexion</button>
    </div>

    <!-- Stats -->
    <div v-if="data" class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div class="card !p-4"><p class="text-xs text-slate-500">Chauffeurs</p><p class="mt-1 text-xl font-bold">{{ data.stats.driversTotal }}</p></div>
      <div class="card !p-4"><p class="text-xs text-slate-500">Actifs</p><p class="mt-1 text-xl font-bold">{{ data.stats.driversActive }}</p></div>
      <div class="card !p-4"><p class="text-xs text-slate-500">Courses</p><p class="mt-1 text-xl font-bold">{{ data.stats.bookingsConfirmed }}</p></div>
      <div class="card !p-4"><p class="text-xs text-slate-500">GMV</p><p class="mt-1 text-xl font-bold">{{ formatMoney(data.stats.gmvCents) }}</p></div>
      <div class="card !p-4"><p class="text-xs text-slate-500">Commission</p><p class="mt-1 text-xl font-bold">{{ formatMoney(data.stats.commissionCents) }}</p></div>
      <div class="card !p-4"><p class="text-xs text-slate-500">MRR forfaits</p><p class="mt-1 text-xl font-bold">{{ formatMoney(data.stats.mrrCents) }}</p></div>
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
        <input v-model="form.siren" class="field" placeholder="SIREN (optionnel)" />
        <input v-model.number="form.monthlyFee" class="field" type="number" placeholder="Forfait mensuel €" />
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
    <div class="mt-8 overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th class="py-2">Chauffeur</th><th>Statut</th><th>SIREN</th><th>Stripe</th><th>Courses</th><th>Forfait</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in data?.drivers" :key="d.id" class="border-b border-slate-100">
            <td class="py-3">
              <p class="font-medium text-slate-900">{{ d.displayName }}</p>
              <NuxtLink :to="`/${d.slug}`" class="text-xs text-brand-600 hover:underline">/{{ d.slug }}</NuxtLink>
            </td>
            <td><span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusColors[d.status]">{{ d.status }}</span></td>
            <td>{{ d.sirenVerified ? '✅' : '—' }}</td>
            <td>{{ d.stripeReady ? '✅' : '⏳' }}</td>
            <td>{{ d.bookings }}</td>
            <td>{{ formatMoney(d.monthlyFeeCents) }}</td>
            <td class="text-right">
              <button v-if="d.status !== 'ACTIVE'" class="text-xs font-semibold text-green-700 hover:underline" @click="setStatus(d.id, 'ACTIVE')">Activer</button>
              <button v-else class="text-xs font-semibold text-red-600 hover:underline" @click="setStatus(d.id, 'SUSPENDED')">Suspendre</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
