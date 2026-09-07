<script setup lang="ts">
import { SETUP_STEP_LABELS } from '~/lib/setup-flow'
import { INVOICE_STATUS_CLASSES, INVOICE_STATUS_LABELS, formatEuros } from '~/lib/invoice'

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

// ─── Facturation Ridewiz → chauffeur ─────────────────────────────────────────
// Ce que CE chauffeur doit à Ridewiz (accès, paramétrage, cartes), et où en
// sont ses règlements. À ne pas confondre avec « Volume encaissé » plus haut,
// qui est ce que lui encaisse de ses propres clients.
const billing = computed(() => data.value?.billing)

// Une échéance en cours de bascule : la case est désactivée le temps de
// l'aller-retour, pour qu'un double-clic ne parte pas deux fois.
const togglingPart = ref<string | null>(null)
const billingError = ref('')

async function togglePart(invoiceId: string, partId: string, paid: boolean) {
  togglingPart.value = partId
  billingError.value = ''
  try {
    await $fetch(`/api/admin/invoices/${invoiceId}/installments/${partId}`, {
      method: 'PATCH',
      body: { paid },
    })
    await refresh()
  } catch (e) {
    billingError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Enregistrement impossible.'
  } finally {
    togglingPart.value = null
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
  ready: { label: 'Lien créé, jamais ouvert', cls: 'bg-slate-100 text-slate-600' },
  started: { label: 'Parcours en cours', cls: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Configuration terminée', cls: 'bg-green-100 text-green-800' },
  expired: { label: 'Lien expiré', cls: 'bg-red-100 text-red-700' },
}

// Copie dans le geste de clic (Safari refuse le presse-papiers après un appel
// réseau) ; repli sur la sélection + commande de copie classique.
const setupUrlInput = ref<HTMLInputElement | null>(null)
function copySetupUrl() {
  const url = setupUrl.value
  if (!url) return
  const done = () => {
    setupCopied.value = true
    setTimeout(() => (setupCopied.value = false), 2500)
  }
  const legacy = () => {
    const el = setupUrlInput.value
    if (!el) return
    el.focus()
    el.select()
    try {
      if (document.execCommand('copy')) done()
    } catch {
      // Le champ reste sélectionné : Ctrl/Cmd+C fonctionne.
    }
  }
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done).catch(legacy)
  else legacy()
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
  return `Salut ${first}, voici ton lien pour configurer ton espace Ridewiz en quelques minutes : ${setupUrl.value}`
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
        <StatCard class="col-span-2 sm:col-span-1" title="Encaissé par lui" :value="formatMoney(data.stats.revenueCents)" />
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
          Le chauffeur remplit lui-même profil, véhicule, tarifs, paiement, SumUp, Google et Telegram
          depuis un parcours simplifié ; les informations déjà renseignées sont sautées.
          <strong>Rien n'est envoyé automatiquement</strong> : copiez le lien et transmettez-le vous-même.
        </p>
        <p v-if="data.setup.completedAt" class="mt-1 text-xs text-slate-500">Terminée le {{ formatDateTime(data.setup.completedAt) }}.</p>
        <p v-else-if="data.setup.startedAt" class="mt-1 text-xs text-slate-500">Ouverte le {{ formatDateTime(data.setup.startedAt) }}.</p>

        <!-- Avancement : même pourcentage que celui affiché au chauffeur. -->
        <div v-if="data.setup.progress" class="mt-4 rounded-xl border border-slate-200 bg-white p-4" data-testid="setup-progress">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-semibold text-slate-900">
              Avancement
              <span class="ml-1 font-normal text-slate-500">{{ data.setup.progress.requiredDone }} / {{ data.setup.progress.requiredTotal }} étapes obligatoires</span>
            </p>
            <span class="rounded-full px-2.5 py-0.5 text-sm font-bold" :class="data.setup.progress.complete ? 'bg-green-100 text-green-800' : 'bg-brand-600 text-white'" data-testid="setup-progress-percent">
              {{ data.setup.progress.percent }} %
            </span>
          </div>
          <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div class="h-full rounded-full transition-all" :class="data.setup.progress.complete ? 'bg-green-600' : 'bg-brand-600'" :style="{ width: `${data.setup.progress.percent}%` }" />
          </div>
          <ul class="mt-3 grid gap-1.5 sm:grid-cols-2">
            <li v-for="s in data.setup.progress.steps" :key="s.key" class="flex items-center gap-2 text-sm" :data-step="s.key" :data-done="s.done">
              <span
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                :class="s.done ? 'bg-green-100 text-green-700' : s.optional ? 'bg-slate-100 text-slate-400' : 'bg-amber-100 text-amber-800'"
              >{{ s.done ? '✓' : s.optional ? '–' : '!' }}</span>
              <span :class="s.done ? 'text-slate-500' : 'text-slate-900'">{{ SETUP_STEP_LABELS[s.key] }}</span>
              <span v-if="s.optional && !s.done" class="text-xs text-slate-400">(optionnel)</span>
            </li>
          </ul>
        </div>

        <div v-if="setupUrl" class="mt-3">
          <input
            ref="setupUrlInput"
            class="field text-xs"
            :value="setupUrl"
            readonly
            data-testid="setup-url"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <p v-if="data.setup.expiresAt" class="mt-1 text-xs text-slate-400">Valable jusqu'au {{ formatDateTime(data.setup.expiresAt) }}</p>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <button class="btn-primary text-sm" :disabled="setupBusy" data-testid="setup-generate" @click="setupUrl ? copySetupUrl() : generateSetupLink(false)">
            {{ setupBusy ? '…' : setupCopied ? '✓ Lien copié' : setupUrl ? '📋 Copier le lien' : '🔗 Créer le lien' }}
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

        <!-- Cartes NFC physiques : design composé ici, jamais visible du chauffeur. -->
        <div class="card" data-testid="nfc-cards-card">
          <h2 class="mb-1 font-semibold text-slate-900">🪪 Cartes NFC</h2>
          <p class="text-sm text-slate-600">
            Cartes « Avis Google » et « Carte de visite en ligne » : logo, couleurs, QR codes,
            puis envoi des fichiers d'impression à la production.
          </p>
          <NuxtLink :to="`/admin/cartes-nfc/${data.id}`" class="btn-ghost mt-3 text-sm">Composer les cartes →</NuxtLink>
        </div>

        <!-- Facturation : accès, paramétrage, cartes — factures émises à ce chauffeur. -->
        <div class="card" data-testid="invoicing-card">
          <h2 class="mb-1 font-semibold text-slate-900">🧾 Facturation</h2>
          <p class="text-sm text-slate-600">
            Factures de l'accès Ridewiz, du paramétrage et des cartes : lignes, échéancier
            de règlement, PDF et envoi par email.
          </p>
          <NuxtLink to="/admin/factures" class="btn-ghost mt-3 text-sm">Ouvrir la facturation →</NuxtLink>
        </div>
      </div>

      <!-- ═══ Règlements : ce que ce chauffeur doit à Ridewiz ═══ -->
      <section v-if="billing" class="card mt-6" data-testid="billing-card">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="font-semibold text-slate-900">💶 Ce qu'il nous doit</h2>
          <NuxtLink to="/admin/factures" class="text-sm text-brand-700 hover:underline">Facturation →</NuxtLink>
        </div>
        <p class="mt-1 text-sm text-slate-500">
          Factures Ridewiz émises à ce chauffeur. Cochez une échéance quand l'argent est arrivé :
          la facture se solde toute seule une fois tout coché.
        </p>

        <!-- Les trois chiffres qui comptent. -->
        <div class="mt-4 grid grid-cols-3 gap-3">
          <div class="rounded-xl border border-slate-200 p-3">
            <p class="text-xs text-slate-500">Facturé</p>
            <p class="mt-0.5 font-serif text-xl font-medium text-slate-900" data-testid="billed">{{ formatEuros(billing.billedCents) }}</p>
          </div>
          <div class="rounded-xl border border-green-200 bg-green-50/60 p-3">
            <p class="text-xs text-green-800">Encaissé</p>
            <p class="mt-0.5 font-serif text-xl font-medium text-green-800" data-testid="collected">{{ formatEuros(billing.collectedCents) }}</p>
          </div>
          <div class="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <p class="text-xs text-amber-800">Reste à recevoir</p>
            <p class="mt-0.5 font-serif text-xl font-medium text-amber-900" data-testid="outstanding">{{ formatEuros(billing.outstandingCents) }}</p>
          </div>
        </div>
        <p v-if="billing.draftCents > 0" class="mt-2 text-xs text-slate-400">
          {{ formatEuros(billing.draftCents) }} en brouillon, non comptés dans le reste à recevoir.
        </p>

        <p v-if="billingError" class="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{{ billingError }}</p>

        <p v-if="!billing.invoices.length" class="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Aucune facture pour ce chauffeur.
        </p>

        <!-- Une facture par bloc, ses échéances en dessous. -->
        <div
          v-for="invoice in billing.invoices"
          :key="invoice.id"
          class="mt-4 rounded-xl border border-slate-200"
          :data-testid="`invoice-${invoice.number}`"
        >
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div class="flex items-center gap-2">
              <NuxtLink :to="`/admin/factures/${invoice.id}`" class="font-semibold text-slate-900 hover:underline">
                n°{{ invoice.number }}
              </NuxtLink>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="INVOICE_STATUS_CLASSES[invoice.status]">
                {{ INVOICE_STATUS_LABELS[invoice.status] }}
              </span>
              <span class="text-xs text-slate-400">{{ invoice.issuedAtLabel }}</span>
            </div>
            <div class="text-right">
              <span class="font-serif text-lg text-slate-900">{{ formatEuros(invoice.totalCents) }}</span>
              <span v-if="invoice.settlement.outstandingCents > 0 && invoice.status !== 'CANCELLED'" class="ml-2 text-xs text-amber-800">
                reste {{ formatEuros(invoice.settlement.outstandingCents) }}
              </span>
            </div>
          </div>

          <!-- Échéancier : une case par échéance. -->
          <ul v-if="invoice.installments.length" class="divide-y divide-slate-100">
            <li
              v-for="(part, index) in invoice.installments"
              :key="part.id"
              class="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
            >
              <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  class="h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-40"
                  :checked="Boolean(part.paidAt)"
                  :disabled="togglingPart === part.id || invoice.status === 'CANCELLED'"
                  :data-testid="`part-${invoice.number}-${index + 1}`"
                  @change="togglePart(invoice.id, part.id, ($event.target as HTMLInputElement).checked)"
                />
                <span class="min-w-0">
                  <span class="block truncate text-sm" :class="part.paidAt ? 'text-slate-500 line-through' : 'text-slate-900'">
                    {{ part.dueLabel || `Échéance ${index + 1}` }}
                  </span>
                  <span v-if="part.paidAt" class="block text-xs text-green-700">Encaissé le {{ formatDateTime(part.paidAt) }}</span>
                </span>
              </label>
              <span class="font-serif text-base" :class="part.paidAt ? 'text-green-700' : 'text-slate-900'">
                {{ formatEuros(part.amountCents) }}
              </span>
            </li>
          </ul>

          <!-- Sans échéancier, la facture est réglée d'un bloc : on renvoie au
               suivi de la facture plutôt que d'inventer une case ici. -->
          <p v-else class="px-4 py-2.5 text-sm text-slate-500">
            Pas d'échéancier — réglée d'un bloc.
            <NuxtLink :to="`/admin/factures/${invoice.id}`" class="text-brand-700 hover:underline">Changer le statut →</NuxtLink>
          </p>
        </div>
      </section>
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
