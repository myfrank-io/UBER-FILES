<script setup lang="ts">
import { formatEuros } from '~/lib/invoice'

// Facturation : liste des factures émises, création d'un brouillon, et
// identité légale de l'émetteur (imprimée en pied de chaque facture).
definePageMeta({ layout: 'default', middleware: 'admin' })
useHead({ title: 'Facturation — Admin' })

const toast = useToast()
const { data, refresh, pending } = await useFetch('/api/admin/invoices')

const search = ref('')
const statusFilter = ref<'' | 'DRAFT' | 'SENT' | 'PAID' | 'CANCELLED'>('')

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyée',
  PAID: 'Payée',
  CANCELLED: 'Annulée',
}
const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SENT: 'bg-amber-100 text-amber-800',
  PAID: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

const invoices = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (data.value?.invoices ?? []).filter((invoice) => {
    if (statusFilter.value && invoice.status !== statusFilter.value) return false
    if (!term) return true
    return (
      invoice.number.toLowerCase().includes(term) ||
      invoice.client.name.toLowerCase().includes(term) ||
      (invoice.client.siret ?? '').includes(term)
    )
  })
})

function apiError(e: unknown, fallback = 'Erreur.') {
  return (e as { data?: { statusMessage?: string } })?.data?.statusMessage || fallback
}

// ═══ Création d'un brouillon ═══
const creating = ref(false)
const createBusy = ref(false)
const createError = ref('')
const form = reactive({ driverId: '', clientName: '', number: '' })

watch(creating, (open) => {
  if (!open) return
  createError.value = ''
  form.driverId = ''
  form.clientName = ''
  form.number = data.value?.suggestedNumber ?? ''
})

// Choisir un chauffeur pré-remplit le nom : c'est la facture de son accès.
watch(
  () => form.driverId,
  (id) => {
    const driver = data.value?.drivers.find((d) => d.id === id)
    if (driver) form.clientName = driver.companyName || driver.displayName
  },
)

async function createInvoice() {
  if (!form.clientName.trim()) {
    createError.value = 'Indiquez le nom du client.'
    return
  }
  createBusy.value = true
  createError.value = ''
  const driver = data.value?.drivers.find((d) => d.id === form.driverId)
  try {
    const res = await $fetch<{ invoice: { id: string } }>('/api/admin/invoices', {
      method: 'POST',
      body: {
        number: form.number.trim() || undefined,
        content: {
          driverId: form.driverId || null,
          clientName: form.clientName.trim(),
          clientEmail: driver?.contactEmail || null,
          clientPhone: driver?.phone || null,
          issuedAt: new Date().toISOString(),
          vatRateBps: 0,
          // Une facture s'ouvre sur la prestation la plus courante ; tout se
          // modifie ensuite dans l'éditeur.
          lines: [{ label: 'Accès Ridewiz\n+ paramétrage', quantity: 1, unitPriceCents: 40_000 }],
          installments: [],
        },
      },
    })
    creating.value = false
    await navigateTo(`/admin/factures/${res.invoice.id}`)
  } catch (e) {
    createError.value = apiError(e, 'La facture n’a pas pu être créée.')
  } finally {
    createBusy.value = false
  }
}

// ═══ Identité de l'émetteur ═══
const editingIssuer = ref(false)
const issuerBusy = ref(false)
const issuerError = ref('')
const issuer = reactive({
  name: '',
  legalForm: '',
  email: '',
  phone: '',
  addressLine: '',
  postalCode: '',
  city: '',
  siret: '',
  numberPrefix: '',
})

watch(editingIssuer, (open) => {
  if (!open || !data.value) return
  issuerError.value = ''
  Object.assign(issuer, data.value.issuer)
})

async function saveIssuer() {
  issuerBusy.value = true
  issuerError.value = ''
  try {
    await $fetch('/api/admin/invoice-issuer', {
      method: 'PUT',
      // Auto-entrepreneur en franchise en base : aucun numéro de TVA à porter.
      body: { ...issuer, vatNumber: null },
    })
    editingIssuer.value = false
    await refresh()
    toast.success('Identité de facturation enregistrée.')
  } catch (e) {
    issuerError.value = apiError(e, 'Enregistrement impossible.')
  } finally {
    issuerBusy.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <NuxtLink to="/admin" class="text-sm text-slate-500 hover:text-slate-900">← Administration</NuxtLink>
        <h1 class="title-serif mt-1 text-3xl">Facturation</h1>
      </div>
      <button class="btn-primary" data-testid="new-invoice" @click="creating = true">Nouvelle facture</button>
    </div>

    <!-- ═══ Chiffres ═══ -->
    <div v-if="data" class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard title="Factures" :value="data.stats.total" />
      <StatCard title="Brouillons" :value="data.stats.draft" />
      <StatCard title="En attente" :value="formatEuros(data.stats.pendingCents)" />
      <StatCard title="Encaissé" :value="formatEuros(data.stats.paidCents)" />
    </div>

    <!-- ═══ Émetteur ═══ -->
    <div v-if="data" class="card mt-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="font-semibold text-slate-900">Identité de facturation</h2>
          <p v-if="data.issuer.name" class="mt-1 text-sm text-slate-500">
            {{ data.issuer.name }}<span v-if="data.issuer.legalForm"> — {{ data.issuer.legalForm }}</span>
            <span v-if="data.issuer.city"> · {{ data.issuer.city }}</span>
            <span v-if="data.issuer.siret"> · Siret {{ data.issuer.siret }}</span>
          </p>
          <p v-else class="mt-1 text-sm text-slate-500">Vos coordonnées, imprimées en pied de chaque facture.</p>
        </div>
        <button class="btn-ghost !min-h-0 !py-2 text-sm" @click="editingIssuer = true">Modifier</button>
      </div>
      <p
        v-if="data.issuer.missing.length"
        class="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800"
        data-testid="issuer-missing"
      >
        Renseignez {{ data.issuer.missing.join(', ') }} : sans ces mentions, la facture ne peut pas être éditée.
      </p>
    </div>

    <!-- ═══ Filtres ═══ -->
    <div class="mt-6 flex flex-wrap gap-3">
      <input v-model="search" class="field sm:max-w-xs" placeholder="Numéro, client, SIRET…" />
      <select v-model="statusFilter" class="field sm:max-w-[180px]">
        <option value="">Tous les statuts</option>
        <option value="DRAFT">Brouillons</option>
        <option value="SENT">Envoyées</option>
        <option value="PAID">Payées</option>
        <option value="CANCELLED">Annulées</option>
      </select>
    </div>

    <!-- ═══ Liste ═══ -->
    <p v-if="pending" class="mt-6 text-sm text-slate-500">Chargement…</p>
    <p v-else-if="invoices.length === 0" class="card mt-6 text-sm text-slate-500">
      Aucune facture{{ search || statusFilter ? ' pour ce filtre' : ' pour l’instant' }}.
    </p>

    <div v-else class="mt-6 space-y-3">
      <NuxtLink
        v-for="invoice in invoices"
        :key="invoice.id"
        :to="`/admin/factures/${invoice.id}`"
        class="card flex flex-wrap items-center gap-x-4 gap-y-2 !p-4 transition hover:border-brand-300"
        data-testid="invoice-row"
      >
        <span class="font-semibold text-slate-900">n°{{ invoice.number }}</span>
        <span class="min-w-0 flex-1 truncate text-slate-700">{{ invoice.client.name }}</span>
        <span class="text-sm text-slate-500">{{ invoice.issuedAtLabel }}</span>
        <span class="font-serif text-lg text-slate-900">{{ formatEuros(invoice.totalCents) }}</span>
        <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="STATUS_CLASSES[invoice.status]">
          {{ STATUS_LABELS[invoice.status] }}
        </span>
      </NuxtLink>
    </div>

    <!-- ═══ Modale : nouvelle facture ═══ -->
    <AppModal v-if="creating" @close="creating = false">
      <h2 class="title-serif text-xl">Nouvelle facture</h2>
      <p class="mt-1 text-sm text-slate-500">
        Le client et les lignes se complètent juste après, dans l’éditeur.
      </p>

      <label class="label mt-5">Chauffeur (facultatif)</label>
      <select v-model="form.driverId" class="field">
        <option value="">— Client hors Ridewiz —</option>
        <option v-for="driver in data?.drivers ?? []" :key="driver.id" :value="driver.id">
          {{ driver.companyName || driver.displayName }}
        </option>
      </select>

      <label class="label mt-4">Nom du client</label>
      <input v-model="form.clientName" class="field" placeholder="SASU FMG Prestige Paris" data-testid="client-name" />

      <label class="label mt-4">Numéro de facture</label>
      <input v-model="form.number" class="field" placeholder="2606-17" />
      <p class="mt-1 text-xs text-slate-500">Proposé à la suite de votre dernière facture.</p>

      <p v-if="createError" class="mt-3 text-sm text-red-600">{{ createError }}</p>

      <div class="mt-6 flex justify-end gap-2">
        <button class="btn-ghost" @click="creating = false">Annuler</button>
        <button class="btn-primary" :disabled="createBusy" @click="createInvoice">
          {{ createBusy ? 'Création…' : 'Créer le brouillon' }}
        </button>
      </div>
    </AppModal>

    <!-- ═══ Modale : identité de facturation ═══ -->
    <AppModal v-if="editingIssuer" @close="editingIssuer = false">
      <h2 class="title-serif text-xl">Identité de facturation</h2>
      <p class="mt-1 text-sm text-slate-500">Ce bloc s’imprime en pied de chaque facture.</p>

      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label">Nom</label>
          <input v-model="issuer.name" class="field" placeholder="Paul Bertel" data-testid="issuer-name" />
        </div>
        <div>
          <label class="label">Forme juridique</label>
          <input v-model="issuer.legalForm" class="field" placeholder="EI" />
        </div>
        <div class="sm:col-span-2">
          <label class="label">Adresse</label>
          <input v-model="issuer.addressLine" class="field" placeholder="68 rue des stations" />
        </div>
        <div>
          <label class="label">Code postal</label>
          <input v-model="issuer.postalCode" class="field" placeholder="59800" />
        </div>
        <div>
          <label class="label">Ville</label>
          <input v-model="issuer.city" class="field" placeholder="Lille" />
        </div>
        <div>
          <label class="label">SIRET</label>
          <input v-model="issuer.siret" class="field" placeholder="92065972900015" data-testid="issuer-siret" />
        </div>
        <div>
          <label class="label">Email</label>
          <input v-model="issuer.email" class="field" type="email" placeholder="vous@exemple.fr" />
        </div>
        <div>
          <label class="label">Téléphone</label>
          <input v-model="issuer.phone" class="field" placeholder="+33 …" />
        </div>
      </div>

      <p v-if="issuerError" class="mt-3 text-sm text-red-600">{{ issuerError }}</p>

      <div class="mt-6 flex justify-end gap-2">
        <button class="btn-ghost" @click="editingIssuer = false">Annuler</button>
        <button class="btn-primary" :disabled="issuerBusy" @click="saveIssuer">
          {{ issuerBusy ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </AppModal>
  </div>
</template>
