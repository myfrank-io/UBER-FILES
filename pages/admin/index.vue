<script setup lang="ts">
// Back-office admin (Chams) : pilotage des chauffeurs, activité, facturation.
definePageMeta({ layout: 'default', middleware: 'admin' })
useHead({ title: 'Administration — Chams' })
const { formatMoney, formatDateTime } = useFormat()

const { data, refresh } = await useFetch('/api/admin/overview')
const { clear, fetch: refreshSession } = useUserSession()

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

// Accès direct à l'espace d'un chauffeur depuis la liste : l'admin ouvre une
// session « en tant que » lui. Son identité reste dans la session, le bandeau
// du back-office chauffeur permet de revenir ici.
const enteringId = ref<string | null>(null)
const enterError = ref('')

async function enterSpace(id: string) {
  if (enteringId.value) return
  enteringId.value = id
  enterError.value = ''
  try {
    await $fetch(`/api/admin/drivers/${id}/impersonate`, { method: 'POST' })
    // Recharger l'état de session client (désormais DRIVER) AVANT de naviguer,
    // sinon le middleware `dashboard` lit l'ancien rôle ADMIN et renvoie au login.
    await refreshSession()
    await navigateTo('/dashboard')
  } catch (e) {
    enterError.value =
      (e as { data?: { statusMessage?: string } })?.data?.statusMessage
      || 'Impossible d’ouvrir cet espace.'
    enteringId.value = null
  }
}

// Lien de configuration guidée depuis la liste. Le bouton ne fait QUE
// générer (ou réutiliser) le lien du chauffeur et l'afficher dans une
// fenêtre avec un bouton « Copier » : rien n'est envoyé au chauffeur. La copie
// se fait au clic sur « Copier » (Safari refuse le presse-papiers après un
// appel réseau : la copie doit rester dans le geste de l'utilisateur).
interface SetupLinkModal {
  id: string
  name: string
  phone: string | null
  url: string
}
const linkingId = ref<string | null>(null)
const setupModal = ref<SetupLinkModal | null>(null)
const setupCopied = ref(false)
const setupInput = ref<HTMLInputElement | null>(null)

async function openSetupLink(d: { id: string; displayName: string; phone?: string | null }) {
  if (linkingId.value) return
  linkingId.value = d.id
  enterError.value = ''
  try {
    const res = await $fetch<{ url: string }>(`/api/admin/drivers/${d.id}/setup-link`, { method: 'POST', body: {} })
    setupCopied.value = false
    setupModal.value = { id: d.id, name: d.displayName, phone: d.phone ?? null, url: res.url }
    await refresh()
    await nextTick()
    setupInput.value?.select()
  } catch (e) {
    enterError.value =
      (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Impossible de générer le lien.'
  } finally {
    linkingId.value = null
  }
}

function copySetupUrl() {
  const url = setupModal.value?.url
  if (!url) return
  const done = () => {
    setupCopied.value = true
    setTimeout(() => (setupCopied.value = false), 2500)
  }
  // Repli sans API presse-papiers : sélection + commande de copie classique.
  const legacy = () => {
    const el = setupInput.value
    if (!el) return
    el.focus()
    el.select()
    try {
      if (document.execCommand('copy')) done()
    } catch {
      // Le champ reste sélectionné : Ctrl/Cmd+C fonctionne.
    }
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(legacy)
  } else {
    legacy()
  }
}

const setupWhatsapp = computed(() => {
  const m = setupModal.value
  if (!m?.phone) return null
  const digits = normalizePhone(m.phone)
  if (!digits) return null
  const first = m.name.split(/\s+/)[0]
  const message = `Bonjour ${first}, voici votre lien pour configurer votre espace Ridewiz en quelques minutes : ${m.url}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
})

const SETUP_BADGE: Record<string, { label: string; cls: string }> = {
  ready: { label: 'Lien créé', cls: 'bg-slate-100 text-slate-600' },
  started: { label: 'Config en cours', cls: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Config ✓', cls: 'bg-green-100 text-green-800' },
  expired: { label: 'Lien expiré', cls: 'bg-red-100 text-red-700' },
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
const statusLabels: Record<string, string> = {
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  PENDING: 'En attente',
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
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="font-serif text-2xl font-medium tracking-tight text-slate-900">Administration — Chams</h1>
      <button class="-mr-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700" @click="logout">
        Déconnexion
      </button>
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
    <!-- Mobile : cartes empilées (rien à scroller, actions larges). Desktop : tableau. -->
    <div class="mt-3 space-y-3 sm:hidden">
      <div v-for="d in filteredDrivers" :key="d.id" class="card !p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0">
            <NuxtLink :to="`/admin/drivers/${d.id}`" class="font-medium text-slate-900 hover:text-brand-600">{{ d.displayName }}</NuxtLink>
            <br />
            <NuxtLink :to="`/${d.slug}`" target="_blank" class="text-xs text-brand-600 hover:underline">/{{ d.slug }}</NuxtLink>
          </div>
          <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold" :class="statusColors[d.status]">
            {{ statusLabels[d.status] ?? d.status }}
          </span>
        </div>
        <p class="mt-2 text-xs text-slate-500">
          SumUp : {{ d.sumupConnected ? 'connecté' : 'non connecté' }} · {{ d.bookings }} course(s)
          <span v-if="SETUP_BADGE[d.setupStatus]" class="ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="SETUP_BADGE[d.setupStatus].cls">{{ SETUP_BADGE[d.setupStatus].label }}</span>
        </p>
        <div class="mt-3 flex gap-2 border-t border-slate-100 pt-3">
          <NuxtLink
            :to="`/admin/drivers/${d.id}`"
            class="inline-flex min-h-[44px] flex-1 items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Détail →
          </NuxtLink>
          <!-- Accès direct à son back-office, sans passer par la fiche. Masqué
               tant que le chauffeur n'a pas activé son invitation : il n'y a
               alors aucun compte au nom duquel ouvrir une session. -->
          <button
            v-if="d.hasAccount"
            type="button"
            class="inline-flex min-h-[44px] flex-1 items-center justify-center whitespace-nowrap rounded-xl border border-brand-300 px-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            :disabled="enteringId === d.id"
            title="Accéder à son espace chauffeur"
            @click="enterSpace(d.id)"
          >
            {{ enteringId === d.id ? '…' : 'Espace ↗' }}
          </button>
          <!-- Lien de configuration guidée : généré et copié en un geste. -->
          <button
            v-if="d.hasAccount"
            type="button"
            class="inline-flex min-h-[44px] flex-1 items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 px-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            :disabled="linkingId === d.id"
            title="Lien de configuration guidée (à copier, rien n’est envoyé)"
            @click="openSetupLink(d)"
          >
            {{ linkingId === d.id ? '…' : '🔗 Config' }}
          </button>
          <button
            v-if="d.status !== 'ACTIVE'"
            class="inline-flex min-h-[44px] flex-1 items-center justify-center whitespace-nowrap rounded-xl border border-green-300 px-2.5 text-sm font-semibold text-green-700 hover:bg-green-50"
            @click="setStatus(d.id, 'ACTIVE')"
          >
            Activer
          </button>
          <button
            v-else
            class="inline-flex min-h-[44px] flex-1 items-center justify-center whitespace-nowrap rounded-xl border border-red-200 px-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
            @click="setStatus(d.id, 'SUSPENDED')"
          >
            Suspendre
          </button>
        </div>
      </div>
      <p v-if="enterError" class="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{{ enterError }}</p>
      <p v-if="filteredDrivers.length === 0" class="py-8 text-center text-sm text-slate-400">Aucun chauffeur trouvé.</p>
    </div>

    <div class="mt-3 hidden overflow-x-auto sm:block">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
            <th class="py-2">Chauffeur</th><th>Statut</th><th>SumUp</th><th>Courses</th><th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in filteredDrivers" :key="d.id" class="border-b border-slate-100">
            <td class="py-3">
              <NuxtLink :to="`/admin/drivers/${d.id}`" class="font-medium text-slate-900 hover:text-brand-600">{{ d.displayName }}</NuxtLink>
              <br />
              <NuxtLink :to="`/${d.slug}`" target="_blank" class="text-xs text-brand-600 hover:underline">/{{ d.slug }}</NuxtLink>
            </td>
            <td><span class="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold" :class="statusColors[d.status]">{{ statusLabels[d.status] ?? d.status }}</span></td>
            <td class="whitespace-nowrap text-xs text-slate-600">
              {{ d.sumupConnected ? '✅ Connecté' : '— Non connecté' }}
              <span v-if="SETUP_BADGE[d.setupStatus]" class="ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="SETUP_BADGE[d.setupStatus].cls">{{ SETUP_BADGE[d.setupStatus].label }}</span>
            </td>
            <td>{{ d.bookings }}</td>
            <td class="whitespace-nowrap text-right">
              <button
                v-if="d.hasAccount"
                type="button"
                class="mr-1 inline-flex items-center rounded-lg px-2.5 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                :disabled="enteringId === d.id"
                title="Accéder à son espace chauffeur"
                @click="enterSpace(d.id)"
              >{{ enteringId === d.id ? '…' : 'Espace ↗' }}</button>
              <button
                v-if="d.hasAccount"
                type="button"
                class="mr-1 inline-flex items-center rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                :disabled="linkingId === d.id"
                title="Lien de configuration guidée (à copier, rien n’est envoyé)"
                @click="openSetupLink(d)"
              >{{ linkingId === d.id ? '…' : '🔗 Config' }}</button>
              <NuxtLink :to="`/admin/drivers/${d.id}`" class="mr-1 inline-flex items-center rounded-lg px-2.5 py-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800">Détail →</NuxtLink>
              <button v-if="d.status !== 'ACTIVE'" class="inline-flex items-center rounded-lg px-2.5 py-2 text-xs font-semibold text-green-700 hover:bg-green-50" @click="setStatus(d.id, 'ACTIVE')">Activer</button>
              <button v-else class="inline-flex items-center rounded-lg px-2.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50" @click="setStatus(d.id, 'SUSPENDED')">Suspendre</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="filteredDrivers.length === 0" class="py-8 text-center text-sm text-slate-400">Aucun chauffeur trouvé.</p>
    </div>

    <!-- Lien de configuration guidée : affiché pour copie, jamais envoyé automatiquement. -->
    <AppModal v-if="setupModal" @close="setupModal = null">
      <h2 class="text-lg font-semibold text-slate-900">Lien de configuration — {{ setupModal.name }}</h2>
      <p class="mt-1 text-sm text-slate-600">
        Copiez ce lien et transmettez-le au chauffeur comme vous voulez. <strong>Rien ne lui a été envoyé.</strong>
        Le lien est valable 30 jours ; le rouvrir ici redonne le même lien.
      </p>
      <input
        ref="setupInput"
        class="field mt-4 text-sm"
        :value="setupModal.url"
        readonly
        data-testid="setup-modal-url"
        @focus="($event.target as HTMLInputElement).select()"
      />
      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" class="btn-primary" data-testid="setup-modal-copy" @click="copySetupUrl">
          {{ setupCopied ? '✓ Lien copié' : '📋 Copier le lien' }}
        </button>
        <a
          v-if="setupWhatsapp"
          :href="setupWhatsapp"
          target="_blank"
          rel="noopener"
          class="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-semibold text-white hover:bg-[#1EBE5B]"
        >💬 Ouvrir WhatsApp</a>
        <NuxtLink :to="`/admin/drivers/${setupModal.id}`" class="btn-ghost">Fiche du chauffeur</NuxtLink>
        <button type="button" class="btn-ghost ml-auto" @click="setupModal = null">Fermer</button>
      </div>
    </AppModal>
  </div>
</template>
