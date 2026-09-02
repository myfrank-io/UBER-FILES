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
const { fetch: refreshSession } = useUserSession()
const impersonating = ref(false)
async function enterSpace() {
  impersonating.value = true
  try {
    await $fetch(`/api/admin/drivers/${id}/impersonate`, { method: 'POST' })
    // Recharger l'état de session client (désormais DRIVER) AVANT de naviguer,
    // sinon le middleware `dashboard` lit l'ancien rôle ADMIN et renvoie au login.
    await refreshSession()
    await navigateTo('/dashboard')
  } catch (e) {
    saveError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
    impersonating.value = false
  }
}

// ─── Lien de configuration guidée ───────────────────────────────────────────
// Généré/copié ici uniquement (jamais visible du chauffeur ailleurs que dans le
// message que l'admin lui envoie). Idempotent tant que le lien est valide.
const setupBusy = ref(false)
const setupError = ref('')
const setupCopied = ref(false)
const setupUrl = ref<string | null>(null)
watchEffect(() => {
  setupUrl.value = data.value?.setup?.url ?? null
})

const SETUP_STATUS: Record<string, { label: string; cls: string }> = {
  none: { label: 'Aucun lien', cls: 'bg-slate-100 text-slate-500' },
  ready: { label: 'Lien envoyé, jamais ouvert', cls: 'bg-amber-100 text-amber-800' },
  started: { label: 'Parcours en cours', cls: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Configuration terminée', cls: 'bg-green-100 text-green-800' },
  expired: { label: 'Lien expiré', cls: 'bg-red-100 text-red-700' },
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    setupCopied.value = true
    setTimeout(() => (setupCopied.value = false), 2000)
  } catch {
    // Presse-papiers indisponible (http, permissions) : le lien reste sélectionnable.
  }
}

async function generateSetupLink(regenerate = false) {
  if (regenerate && !confirm('Régénérer le lien ? L’ancien lien ne fonctionnera plus.')) return
  setupBusy.value = true
  setupError.value = ''
  try {
    const res = await $fetch<{ url: string }>(`/api/admin/drivers/${id}/setup-link`, {
      method: 'POST',
      body: { regenerate },
    })
    setupUrl.value = res.url
    await copyText(res.url)
    await refresh()
  } catch (e) {
    setupError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    setupBusy.value = false
  }
}

async function revokeSetupLink() {
  if (!confirm('Révoquer le lien de configuration ? Il ne fonctionnera plus.')) return
  setupBusy.value = true
  setupError.value = ''
  try {
    await $fetch(`/api/admin/drivers/${id}/setup-link`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    setupError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    setupBusy.value = false
  }
}

// Message prêt à envoyer (WhatsApp si téléphone connu).
const setupMessage = computed(() => {
  if (!setupUrl.value || !data.value) return ''
  const first = data.value.displayName.split(/\s+/)[0]
  return `Bonjour ${first}, voici votre lien pour configurer votre espace Ridewiz en quelques minutes : ${setupUrl.value}`
})
const setupWhatsapp = computed(() => {
  const phone = data.value?.phone
  if (!phone || !setupMessage.value) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.length === 10 && digits.startsWith('0')) digits = '33' + digits.slice(1)
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(setupMessage.value)}` : null
})

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
const statusLabels: Record<string, string> = {
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  PENDING: 'En attente',
}
</script>

<template>
  <div class="mx-auto max-w-4xl px-5 py-8">
    <NuxtLink to="/admin" class="text-sm text-slate-400 hover:text-slate-700">← Admin</NuxtLink>

    <div v-if="data" class="mt-4">
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="font-serif text-2xl font-medium tracking-tight text-slate-900">{{ data.displayName }}</h1>
          <NuxtLink :to="`/${data.slug}`" target="_blank" class="text-sm text-brand-600 hover:underline">/{{ data.slug }}</NuxtLink>
        </div>
        <!-- flex-wrap + nowrap sur chaque bouton : la rangée ne déborde jamais de l'écran. -->
        <div class="flex flex-wrap items-center gap-2">
          <span class="whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold" :class="statusColors[data.status]">{{ statusLabels[data.status] ?? data.status }}</span>
          <button class="whitespace-nowrap rounded-lg border border-brand-300 px-3 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50" :disabled="impersonating" @click="enterSpace">
            {{ impersonating ? '…' : '↗ Accéder à son espace' }}
          </button>
          <button class="btn-primary whitespace-nowrap text-sm" @click="openEdit">Modifier</button>
          <button v-if="data.status !== 'SUSPENDED'" class="whitespace-nowrap rounded-lg border border-red-300 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50" :disabled="archiving" @click="archive">
            Suspendre
          </button>
          <button v-else class="whitespace-nowrap rounded-lg border border-green-300 px-3 py-2.5 text-sm text-green-700 hover:bg-green-50" @click="activate">
            Réactiver
          </button>
        </div>
      </div>

      <p v-if="archiveError" class="mt-2 text-sm text-red-600">{{ archiveError }}</p>

      <!-- Stats -->
      <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard title="Courses" :value="data.stats.bookings" />
        <StatCard title="À venir" :value="data.stats.upcomingBookings" />
        <StatCard class="col-span-2 sm:col-span-1" title="Volume encaissé" :value="formatMoney(data.stats.revenueCents)" />
      </div>

      <!-- Configuration guidée -->
      <div class="card mt-6 border-brand-100 bg-gradient-to-br from-brand-50/60 to-white" data-testid="setup-card">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-semibold text-slate-900">🧭 Configuration guidée</h2>
          <span class="rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="SETUP_STATUS[data.setup.status]?.cls">
            {{ SETUP_STATUS[data.setup.status]?.label ?? data.setup.status }}
          </span>
        </div>
        <p class="mt-1 text-sm text-slate-600">
          Envoyez ce lien au chauffeur : il remplit lui-même profil, véhicule, tarifs, paiement, SumUp,
          Google et Telegram depuis un parcours simplifié. Les informations déjà renseignées sont sautées.
        </p>
        <p v-if="data.setup.completedAt" class="mt-1 text-xs text-slate-500">Terminée le {{ formatDateTime(data.setup.completedAt) }}.</p>
        <p v-else-if="data.setup.startedAt" class="mt-1 text-xs text-slate-500">Ouverte le {{ formatDateTime(data.setup.startedAt) }}.</p>

        <div v-if="setupUrl" class="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          <span class="break-all" data-testid="setup-url">{{ setupUrl }}</span>
          <span v-if="data.setup.expiresAt" class="block text-slate-400">Valable jusqu'au {{ formatDateTime(data.setup.expiresAt) }}</span>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <button class="btn-primary text-sm" :disabled="setupBusy" data-testid="setup-generate" @click="setupUrl ? copyText(setupUrl) : generateSetupLink(false)">
            {{ setupBusy ? '…' : setupCopied ? '✓ Lien copié' : setupUrl ? '📋 Copier le lien' : '🔗 Générer le lien' }}
          </button>
          <a
            v-if="setupWhatsapp"
            :href="setupWhatsapp"
            target="_blank"
            rel="noopener"
            class="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-semibold text-white hover:bg-[#1EBE5B]"
          >💬 Envoyer sur WhatsApp</a>
          <a v-if="setupUrl" :href="setupUrl" target="_blank" rel="noopener" class="btn-ghost text-sm">Tester ↗</a>
          <button v-if="setupUrl" class="btn-ghost text-sm" :disabled="setupBusy" @click="generateSetupLink(true)">Régénérer</button>
          <button v-if="setupUrl" class="rounded-xl px-3 text-sm text-red-600 hover:bg-red-50" :disabled="setupBusy" @click="revokeSetupLink">Révoquer</button>
        </div>
        <p v-if="setupError" class="mt-2 text-sm text-red-600">{{ setupError }}</p>
      </div>

      <!-- Details grid -->
      <div class="mt-6 grid gap-6 sm:grid-cols-2">
        <!-- Compte -->
        <div class="card">
          <h2 class="mb-3 font-semibold text-slate-900">Compte</h2>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-slate-500">Email</dt>
              <dd class="text-right">
                {{ data.user?.email ?? '—' }}
                <span
                  v-if="data.user"
                  class="ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                  :class="data.user.emailVerified ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'"
                >
                  {{ data.user.emailVerified ? '✓ vérifié' : 'non vérifié' }}
                </span>
              </dd>
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
              <dt class="text-slate-500">SumUp</dt>
              <dd>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-semibold"
                  :class="data.sumup.connected ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'"
                >
                  {{ data.sumup.connected ? 'Connecté' : 'Non connecté' }}
                </span>
              </dd>
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
              <dt class="text-slate-500">Telegram</dt>
              <dd>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-semibold"
                  :class="data.telegramLinked ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500'"
                >
                  {{ data.telegramLinked ? 'Connecté' : 'Non connecté' }}
                </span>
              </dd>
            </div>
            <!-- Uniquement si un code existe : une pastille vide ressemble à un bug. -->
            <div v-if="!data.telegramLinked && data.telegramLinkCode" class="flex justify-between">
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
