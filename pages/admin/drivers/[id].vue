<script setup lang="ts">
definePageMeta({ layout: 'default', middleware: 'admin' })

const route = useRoute()
const id = route.params.id as string
const { formatMoney, formatDateTime } = useFormat()

const { data, refresh } = await useFetch(`/api/admin/drivers/${id}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable.' })

useHead({ title: () => `${data.value?.displayName ?? '…'} — Admin` })

const editing = ref(false)
const form = reactive({
  displayName: '',
  slug: '',
  phone: '',
  contactEmail: '',
})
const saving = ref(false)
const saveError = ref('')
const archiving = ref(false)
const archiveError = ref('')

function openEdit() {
  const d = data.value!
  form.displayName = d.displayName
  form.slug = d.slug
  form.phone = d.phone ?? ''
  form.contactEmail = d.contactEmail ?? ''
  editing.value = true
  saveError.value = ''
}

async function save() {
  saving.value = true
  saveError.value = ''
  try {
    await $fetch(`/api/admin/drivers/${id}`, {
      method: 'PATCH',
      body: {
        displayName: form.displayName,
        slug: form.slug,
        phone: form.phone || null,
        contactEmail: form.contactEmail || null,
      },
    })
    await refresh()
    editing.value = false
  } catch (e) {
    saveError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    saving.value = false
  }
}

// Accès à l'espace du chauffeur : l'admin ouvre une session « en tant que » lui
// pour visiter et modifier son back-office, puis pourra revenir à l'admin.
const impersonating = ref(false)
async function enterSpace() {
  impersonating.value = true
  try {
    await $fetch(`/api/admin/drivers/${id}/impersonate`, { method: 'POST' })
    await navigateTo('/dashboard')
  } catch (e) {
    saveError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
    impersonating.value = false
  }
}

async function archive() {
  if (!confirm(`Suspendre ${data.value?.displayName} ?`)) return
  archiving.value = true
  archiveError.value = ''
  try {
    await $fetch(`/api/admin/drivers/${id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    archiveError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    archiving.value = false
  }
}

async function activate() {
  await $fetch(`/api/admin/drivers/${id}/status`, { method: 'PATCH', body: { status: 'ACTIVE' } })
  await refresh()
}

const statusColors: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  SUSPENDED: 'bg-red-100 text-red-700',
  PENDING: 'bg-amber-100 text-amber-800',
}
</script>

<template>
  <div class="mx-auto max-w-4xl px-5 py-8">
    <NuxtLink to="/admin" class="text-sm text-slate-400 hover:text-slate-700">← Admin</NuxtLink>

    <div v-if="data" class="mt-4">
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">{{ data.displayName }}</h1>
          <NuxtLink :to="`/${data.slug}`" target="_blank" class="text-sm text-brand-600 hover:underline">/{{ data.slug }}</NuxtLink>
        </div>
        <div class="flex items-center gap-2">
          <span class="rounded-full px-3 py-1 text-xs font-semibold" :class="statusColors[data.status]">{{ data.status }}</span>
          <button class="rounded-lg border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50" :disabled="impersonating" @click="enterSpace">
            {{ impersonating ? '…' : '↗ Accéder à son espace' }}
          </button>
          <button class="btn-primary text-sm" @click="openEdit">Modifier</button>
          <button v-if="data.status !== 'SUSPENDED'" class="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50" :disabled="archiving" @click="archive">
            Suspendre
          </button>
          <button v-else class="rounded-lg border border-green-300 px-3 py-1.5 text-sm text-green-700 hover:bg-green-50" @click="activate">
            Réactiver
          </button>
        </div>
      </div>

      <p v-if="archiveError" class="mt-2 text-sm text-red-600">{{ archiveError }}</p>

      <!-- Stats -->
      <div class="mt-6 grid grid-cols-3 gap-3">
        <StatCard title="Courses" :value="data.stats.bookings" />
        <StatCard title="À venir" :value="data.stats.upcomingBookings" />
        <StatCard title="Volume encaissé" :value="formatMoney(data.stats.revenueCents)" />
      </div>

      <!-- Details grid -->
      <div class="mt-6 grid gap-6 sm:grid-cols-2">
        <!-- Compte -->
        <div class="card">
          <h2 class="mb-3 font-semibold text-slate-900">Compte</h2>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-slate-500">Email</dt>
              <dd>{{ data.user?.email ?? '—' }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Téléphone</dt>
              <dd>{{ data.phone ?? '—' }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Email contact</dt>
              <dd>{{ data.contactEmail ?? '—' }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Membre depuis</dt>
              <dd>{{ formatDateTime(data.createdAt) }}</dd>
            </div>
          </dl>
        </div>

        <!-- Encaissement -->
        <div class="card">
          <h2 class="mb-3 font-semibold text-slate-900">Encaissement</h2>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-slate-500">SumUp connecté</dt>
              <dd>{{ data.sumup.connected ? '✅' : '⏳' }}</dd>
            </div>
            <div v-if="data.sumup.merchantCode" class="flex justify-between">
              <dt class="text-slate-500">Code marchand</dt>
              <dd><code class="rounded bg-slate-100 px-1.5 py-0.5">{{ data.sumup.merchantCode }}</code></dd>
            </div>
          </dl>
        </div>

        <!-- Telegram / Clients -->
        <div class="card">
          <h2 class="mb-3 font-semibold text-slate-900">Intégrations</h2>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-slate-500">Telegram lié</dt>
              <dd>{{ data.telegramLinked ? '✅' : '⏳' }}</dd>
            </div>
            <div v-if="!data.telegramLinked" class="flex justify-between">
              <dt class="text-slate-500">Code d'appairage</dt>
              <dd><code class="rounded bg-slate-100 px-1.5 py-0.5">{{ data.telegramLinkCode }}</code></dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Clients</dt>
              <dd>{{ data.stats.customers }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Demandes de devis</dt>
              <dd>{{ data.stats.rideRequests }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Paiements réussis</dt>
              <dd>{{ data.stats.payments }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>

    <!-- Edit modal -->
    <AppModal v-if="editing" @close="editing = false">
      <h2 class="mb-4 text-lg font-semibold text-slate-900">Modifier le chauffeur</h2>
      <div class="grid gap-3">
        <div>
          <label class="label">Nom affiché</label>
          <input v-model="form.displayName" class="field" />
        </div>
        <div>
          <label class="label">Slug URL</label>
          <input v-model="form.slug" class="field" />
        </div>
        <div>
          <label class="label">Téléphone</label>
          <input v-model="form.phone" class="field" />
        </div>
        <div>
          <label class="label">Email contact</label>
          <input v-model="form.contactEmail" class="field" type="email" />
        </div>
      </div>
      <p v-if="saveError" class="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{{ saveError }}</p>
      <div class="mt-5 flex justify-end gap-3">
        <button class="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50" @click="editing = false">Annuler</button>
        <button class="btn-primary" :disabled="saving" @click="save">{{ saving ? '…' : 'Enregistrer' }}</button>
      </div>
    </AppModal>
  </div>
</template>
