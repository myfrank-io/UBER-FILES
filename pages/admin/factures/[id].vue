<script setup lang="ts">
import {
  DUE_LABEL_SUGGESTIONS,
  INVOICE_PRESETS,
  defaultInstallments,
  formatEuros,
  formatShare,
  invoiceTotals,
  paymentTermsSentence,
  shareBasisPoints,
  splitAmountsEvenly,
} from '~/lib/invoice'
import type { CompanyMatch } from '~/server/utils/company-lookup'

// Éditeur d'une facture : client, lignes, échéancier, mentions — avec l'aperçu
// du PDF réel à droite (c'est l'endpoint de téléchargement qui est affiché, il
// ne peut donc pas diverger du document envoyé).
definePageMeta({ layout: 'default', middleware: 'admin' })

const route = useRoute()
const id = route.params.id as string
const toast = useToast()

const { data, refresh } = await useFetch(`/api/admin/invoices/${id}`)
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Facture introuvable.' })
useHead({ title: () => `Facture n°${data.value?.invoice.number ?? '…'} — Admin` })

type Invoice = NonNullable<typeof data.value>['invoice']

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

function apiError(e: unknown, fallback = 'Erreur.') {
  return (e as { data?: { statusMessage?: string } })?.data?.statusMessage || fallback
}

// ═══ Formulaire ═══
// Les prix se saisissent en euros et se stockent en centimes : la conversion
// est faite ici, une seule fois, à l'entrée et à la sortie.
interface LineForm {
  label: string
  quantity: number
  priceEuros: number
}
interface InstallmentForm {
  amountEuros: number
  dueLabel: string
}

const form = reactive({
  number: '',
  status: 'DRAFT' as Invoice['status'],
  driverId: '',
  clientName: '',
  clientContactName: '',
  clientEmail: '',
  clientPhone: '',
  clientAddress: '',
  clientSiret: '',
  issuedAt: '',
  dueDate: '',
  notes: '',
  paymentTerms: '',
})
const lines = ref<LineForm[]>([])
const installments = ref<InstallmentForm[]>([])
/** Modalités retouchées à la main : on cesse alors de les régénérer. */
const termsEdited = ref(false)
/** Échéancier réglé à la main : on cesse alors de le re-répartir tout seul. */
const installmentsEdited = ref(false)
const scheduleWarning = ref(false)

/** Date d'un champ <input type="date"> (AAAA-MM-JJ) depuis une date ISO. */
function toDateInput(value: string | Date | null): string {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function seed(invoice: Invoice) {
  form.number = invoice.number
  form.status = invoice.status
  form.driverId = invoice.driver?.id ?? ''
  form.clientName = invoice.client.name
  form.clientContactName = invoice.client.contactName ?? ''
  form.clientEmail = invoice.client.email ?? ''
  form.clientPhone = invoice.client.phone ?? ''
  form.clientAddress = invoice.client.address ?? ''
  form.clientSiret = invoice.client.siret ?? ''
  form.issuedAt = toDateInput(invoice.issuedAt)
  form.dueDate = toDateInput(invoice.dueDate)
  form.notes = invoice.notes ?? ''
  form.paymentTerms = invoice.paymentTerms ?? ''
  lines.value = invoice.lines.map((line) => ({
    label: line.label,
    quantity: line.quantity,
    priceEuros: line.unitPriceCents / 100,
  }))
  installments.value = invoice.installments.map((part) => ({
    amountEuros: part.amountCents / 100,
    dueLabel: part.dueLabel,
  }))
  installmentsEdited.value = invoice.installments.length > 0
  termsEdited.value = Boolean(invoice.paymentTerms)
}
seed(data.value.invoice)

// ═══ Totaux, calculés avec la même logique que le serveur ═══
const contentLines = computed(() =>
  lines.value.map((line) => ({
    label: line.label,
    quantity: Number(line.quantity) || 0,
    unitPriceCents: Math.round((Number(line.priceEuros) || 0) * 100),
  })),
)
const totals = computed(() => invoiceTotals(contentLines.value, 0))

/** Les échéances telles qu'elles partiront au serveur : des montants. */
const contentInstallments = computed(() =>
  installments.value.map((part) => ({
    amountCents: Math.round((Number(part.amountEuros) || 0) * 100),
    dueLabel: part.dueLabel,
  })),
)
const scheduledCents = computed(() => contentInstallments.value.reduce((sum, p) => sum + p.amountCents, 0))
/** Le total des échéances doit couvrir la facture au centime près. */
const scheduleValid = computed(
  () => installments.value.length === 0 || scheduledCents.value === totals.value.totalCents,
)

/** Régénère la phrase des modalités depuis l'échéancier courant. */
function regenerateTerms() {
  form.paymentTerms = paymentTermsSentence(contentInstallments.value)
  termsEdited.value = false
}
// Tant que la phrase n'a pas été retouchée, elle suit l'échéancier.
watch(
  contentInstallments,
  () => {
    if (!termsEdited.value) form.paymentTerms = paymentTermsSentence(contentInstallments.value)
  },
  { deep: true, immediate: true },
)

// Le total change (une ligne ajoutée, un prix corrigé) : tant que l'échéancier
// n'a pas été réglé à la main, il se re-répartit en montants ronds plutôt que
// de rester sur des montants qui ne couvrent plus la facture.
watch(
  () => totals.value.totalCents,
  (total) => {
    if (installments.value.length > 0 && !installmentsEdited.value) {
      setInstallmentCount(installments.value.length, false)
    } else if (installments.value.length > 0 && scheduledCents.value !== total) {
      scheduleWarning.value = true
    }
  },
)

/** Règle un règlement « en N fois » : des montants ronds, pas des pourcentages. */
function setInstallmentCount(count: number, manual = true) {
  installments.value = defaultInstallments(totals.value.totalCents, count).map((part) => ({
    amountEuros: part.amountCents / 100,
    dueLabel: part.dueLabel,
  }))
  if (manual) installmentsEdited.value = false
  scheduleWarning.value = false
  termsEdited.value = false
}

/** Redistribue le total sur le nombre d'échéances en cours. */
function redistribute() {
  const amounts = splitAmountsEvenly(totals.value.totalCents, installments.value.length)
  installments.value = installments.value.map((part, index) => ({
    ...part,
    amountEuros: (amounts[index] ?? 0) / 100,
  }))
  installmentsEdited.value = false
  scheduleWarning.value = false
}

// ═══ Lignes ═══
function addPreset(key: string) {
  const preset = INVOICE_PRESETS.find((p) => p.key === key)
  if (!preset) return
  lines.value.push({ label: preset.label, quantity: 1, priceEuros: preset.unitPriceCents / 100 })
}
function addBlankLine() {
  lines.value.push({ label: '', quantity: 1, priceEuros: 0 })
}
function removeLine(index: number) {
  lines.value.splice(index, 1)
}

// ═══ Recherche d'entreprise ═══
const companyQuery = ref('')
const companyBusy = ref(false)
const companyError = ref('')
const companyResults = ref<CompanyMatch[]>([])

async function searchCompany() {
  const q = companyQuery.value.trim()
  if (!q) return
  companyBusy.value = true
  companyError.value = ''
  companyResults.value = []
  try {
    const res = await $fetch<{ results: CompanyMatch[]; error: string | null }>('/api/admin/company-search', {
      query: { q },
    })
    companyResults.value = res.results
    companyError.value = res.error ?? ''
  } catch (e) {
    companyError.value = apiError(e, 'La recherche a échoué.')
  } finally {
    companyBusy.value = false
  }
}

function applyCompany(match: CompanyMatch) {
  form.clientName = match.name
  if (match.contactName) form.clientContactName = match.contactName
  if (match.address) form.clientAddress = match.address
  if (match.siret) form.clientSiret = match.siret
  companyResults.value = []
  companyQuery.value = ''
  toast.success('Informations reprises de l’annuaire des entreprises.')
}

// ═══ Enregistrement ═══
const saving = ref(false)
const saveError = ref('')
/** Incrémenté après chaque enregistrement pour recharger l'aperçu PDF. */
const previewKey = ref(0)
// Aucun fragment #view / #toolbar : les lecteurs PDF intégrés les honorent de
// façon inégale, et un fragment mal interprété affiche une page vide. On laisse
// le lecteur du navigateur faire, avec ses propres commandes.
const pdfUrl = computed(() => `/api/admin/invoices/${id}/pdf?v=${previewKey.value}`)
const issuerMissing = computed(() => data.value?.issuer.missing ?? [])

async function save() {
  if (!scheduleValid.value) {
    saveError.value = `Les échéances totalisent ${formatEuros(scheduledCents.value)} au lieu de ${formatEuros(totals.value.totalCents)}.`
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    const res = await $fetch<{ invoice: Invoice }>(`/api/admin/invoices/${id}`, {
      method: 'PUT',
      body: {
        number: form.number.trim(),
        content: {
          driverId: form.driverId || null,
          clientName: form.clientName.trim(),
          clientContactName: form.clientContactName,
          clientEmail: form.clientEmail,
          clientPhone: form.clientPhone,
          clientAddress: form.clientAddress,
          clientSiret: form.clientSiret,
          issuedAt: form.issuedAt || new Date().toISOString(),
          dueDate: form.dueDate || null,
          lines: contentLines.value,
          installments: contentInstallments.value,
          paymentTerms: form.paymentTerms,
          notes: form.notes,
        },
      },
    })
    seed(res.invoice)
    previewKey.value++
    await refresh()
    toast.success('Facture enregistrée.')
  } catch (e) {
    saveError.value = apiError(e, 'Enregistrement impossible.')
  } finally {
    saving.value = false
  }
}

// ═══ Statut, envoi, suppression ═══
const statusBusy = ref(false)
async function setStatus(status: Invoice['status']) {
  statusBusy.value = true
  try {
    const res = await $fetch<{ invoice: Invoice }>(`/api/admin/invoices/${id}/status`, {
      method: 'PATCH',
      body: { status },
    })
    form.status = res.invoice.status
    await refresh()
    toast.success(`Facture marquée « ${STATUS_LABELS[status]} ».`)
  } catch (e) {
    toast.error(apiError(e))
  } finally {
    statusBusy.value = false
  }
}

const sending = ref(false)
const sendOpen = ref(false)
const sendTo = ref('')
const sendError = ref('')

watch(sendOpen, (open) => {
  if (!open) return
  sendError.value = ''
  sendTo.value = form.clientEmail
})

async function sendInvoice() {
  sending.value = true
  sendError.value = ''
  try {
    const res = await $fetch<{ sent: boolean; to: string; invoice: Invoice }>(`/api/admin/invoices/${id}/send`, {
      method: 'POST',
      body: sendTo.value.trim() ? { to: sendTo.value.trim() } : {},
    })
    seed(res.invoice)
    sendOpen.value = false
    await refresh()
    toast.success(res.sent ? `Facture envoyée à ${res.to}.` : `Envoi simulé (email non configuré) vers ${res.to}.`)
  } catch (e) {
    sendError.value = apiError(e, 'L’envoi a échoué.')
  } finally {
    sending.value = false
  }
}

const deleting = ref(false)
async function removeInvoice() {
  deleting.value = true
  try {
    await $fetch(`/api/admin/invoices/${id}`, { method: 'DELETE' })
    await navigateTo('/admin/factures')
  } catch (e) {
    toast.error(apiError(e))
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 py-8">
    <!-- ═══ En-tête ═══ -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <NuxtLink to="/admin/factures" class="text-sm text-slate-500 hover:text-slate-900">← Facturation</NuxtLink>
        <h1 class="title-serif mt-1 text-3xl">
          Facture n°{{ form.number }}
          <span
            class="ml-2 rounded-full px-2.5 py-1 align-middle text-xs font-semibold"
            :class="STATUS_CLASSES[form.status]"
            data-testid="status-badge"
            >{{ STATUS_LABELS[form.status] }}</span
          >
        </h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-primary !min-h-0 !py-2.5" :disabled="saving" data-testid="save" @click="save">
          {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
        <a class="btn-ghost !min-h-0 !py-2.5 text-sm" :href="pdfUrl" target="_blank" rel="noopener">PDF ↗</a>
        <button class="btn-ghost !min-h-0 !py-2.5 text-sm" @click="sendOpen = true">Envoyer</button>
      </div>
    </div>

    <p
      v-if="issuerMissing.length"
      class="card mt-4 !border-amber-200 !bg-amber-50 !p-4 text-sm text-amber-900"
      data-testid="issuer-warning"
    >
      Renseignez {{ issuerMissing.join(', ') }} de l’émetteur dans
      <NuxtLink to="/admin/factures" class="font-semibold underline">Facturation</NuxtLink> : le PDF ne peut pas être
      édité sans ces mentions obligatoires.
    </p>

    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
      <!-- ═══ Colonne de saisie ═══ -->
      <div class="space-y-6">
        <!-- Client -->
        <section class="card">
          <h2 class="font-semibold text-slate-900">Client</h2>

          <label class="label mt-4">Rechercher l’entreprise</label>
          <div class="flex gap-2">
            <input
              v-model="companyQuery"
              class="field"
              placeholder="SIRET, SIREN ou raison sociale"
              data-testid="company-query"
              @keyup.enter="searchCompany"
            />
            <button class="btn-ghost !min-h-0 shrink-0 !py-3 text-sm" :disabled="companyBusy" @click="searchCompany">
              {{ companyBusy ? '…' : 'Chercher' }}
            </button>
          </div>
          <p class="mt-1 text-xs text-slate-500">Annuaire des entreprises (données publiques du répertoire Sirene).</p>
          <p v-if="companyError" class="mt-2 text-sm text-amber-800">{{ companyError }}</p>

          <ul v-if="companyResults.length" class="mt-3 space-y-2">
            <li v-for="match in companyResults" :key="match.siret ?? match.siren">
              <button
                class="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand-400 hover:bg-slate-50"
                data-testid="company-result"
                @click="applyCompany(match)"
              >
                <span class="block font-semibold text-slate-900">{{ match.name }}</span>
                <span class="block text-sm text-slate-500">{{ match.address ?? 'Adresse non publiée' }}</span>
                <span class="block text-xs text-slate-400">
                  Siret {{ match.siret ?? '—' }}
                  <template v-if="match.contactName"> · {{ match.contactName }}</template>
                  <template v-if="!match.active"> · établissement fermé</template>
                </span>
              </button>
            </li>
          </ul>

          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="label">Raison sociale</label>
              <input v-model="form.clientName" class="field" data-testid="client-name" />
            </div>
            <div>
              <label class="label">Contact (facultatif)</label>
              <input v-model="form.clientContactName" class="field" placeholder="Fonsat Miguel" />
            </div>
            <div>
              <label class="label">SIRET</label>
              <input v-model="form.clientSiret" class="field" data-testid="client-siret" />
            </div>
            <div class="sm:col-span-2">
              <label class="label">Adresse</label>
              <input v-model="form.clientAddress" class="field" />
            </div>
            <div>
              <label class="label">Téléphone</label>
              <input v-model="form.clientPhone" class="field" />
            </div>
            <div>
              <label class="label">Email</label>
              <input v-model="form.clientEmail" class="field" type="email" />
            </div>
          </div>
        </section>

        <!-- Lignes -->
        <section class="card">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-semibold text-slate-900">Prestations</h2>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="preset in INVOICE_PRESETS"
                :key="preset.key"
                class="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-brand-400 hover:bg-slate-50"
                :data-testid="`preset-${preset.key}`"
                @click="addPreset(preset.key)"
              >
                + {{ preset.chip }} ({{ formatEuros(preset.unitPriceCents) }})
              </button>
            </div>
          </div>

          <div v-for="(line, index) in lines" :key="index" class="mt-4 rounded-xl border border-slate-200 p-3">
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1">
                <label class="label">Désignation</label>
                <textarea
                  v-model="line.label"
                  class="field min-h-[76px] resize-y"
                  rows="3"
                  placeholder="Accès Ridewiz&#10;+ paramétrage"
                  :data-testid="`line-label-${index}`"
                />
                <p class="mt-1 text-xs text-slate-500">Un retour à la ligne = une ligne sur la facture.</p>
              </div>
              <button
                class="mt-7 shrink-0 rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                :data-testid="`remove-line-${index}`"
                @click="removeLine(index)"
              >
                Retirer
              </button>
            </div>
            <div class="mt-3 flex flex-wrap items-end gap-3">
              <div class="w-24">
                <label class="label">Quantité</label>
                <input v-model.number="line.quantity" class="field" type="number" min="1" step="1" />
              </div>
              <div class="w-36">
                <label class="label">Prix unitaire</label>
                <input
                  v-model.number="line.priceEuros"
                  class="field"
                  type="number"
                  min="0"
                  step="0.01"
                  :data-testid="`line-price-${index}`"
                />
              </div>
              <p class="ml-auto font-serif text-lg text-slate-900">
                {{ formatEuros(Math.round((Number(line.quantity) || 0) * (Number(line.priceEuros) || 0) * 100)) }}
              </p>
            </div>
          </div>

          <button class="btn-ghost !min-h-0 mt-4 !py-2 text-sm" data-testid="add-line" @click="addBlankLine">
            + Ligne libre
          </button>

          <div class="mt-5 border-t border-slate-200 pt-4 text-right">
            <p class="text-sm text-slate-500">
              Sous-total <span class="ml-3 font-semibold text-slate-900">{{ formatEuros(totals.subtotalCents) }}</span>
            </p>
            <p v-if="totals.vatCents > 0" class="mt-1 text-sm text-slate-500">
              TVA <span class="ml-3 font-semibold text-slate-900">{{ formatEuros(totals.vatCents) }}</span>
            </p>
            <p class="mt-2 font-serif text-2xl text-slate-900" data-testid="total">
              Total {{ formatEuros(totals.totalCents) }}
            </p>
          </div>
        </section>

        <!-- Règlement -->
        <section class="card">
          <h2 class="font-semibold text-slate-900">Conditions de règlement</h2>
          <p class="mt-1 text-sm text-slate-500">En combien de fois le client règle.</p>

          <div class="mt-4 flex flex-wrap gap-2">
            <button
              v-for="count in [1, 2, 3, 4]"
              :key="count"
              class="rounded-full border px-4 py-2 text-sm font-semibold transition"
              :class="
                installments.length === count
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              "
              :data-testid="`split-${count}`"
              @click="setInstallmentCount(count)"
            >
              {{ count === 1 ? 'Comptant' : `En ${count} fois` }}
            </button>
            <button
              class="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-500 transition hover:bg-slate-50"
              @click="installments = []; scheduleWarning = false"
            >
              Aucune mention
            </button>
          </div>

          <div v-for="(part, index) in installments" :key="index" class="mt-3 flex flex-wrap items-end gap-3">
            <div class="w-36">
              <label class="label">Montant</label>
              <div class="relative">
                <input
                  v-model.number="part.amountEuros"
                  class="field pr-7"
                  type="number"
                  min="0"
                  step="1"
                  :data-testid="`amount-${index}`"
                  @input="installmentsEdited = true"
                />
                <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">€</span>
              </div>
            </div>
            <div class="min-w-[180px] flex-1">
              <label class="label">Échéance</label>
              <input
                v-model="part.dueLabel"
                class="field"
                list="due-labels"
                placeholder="à la commande"
                :data-testid="`due-${index}`"
              />
            </div>
            <p class="w-20 pb-3 text-right text-sm text-slate-400">
              {{ formatShare(shareBasisPoints(contentInstallments[index]?.amountCents ?? 0, totals.totalCents)) }}
            </p>
          </div>
          <datalist id="due-labels">
            <option v-for="suggestion in DUE_LABEL_SUGGESTIONS" :key="suggestion" :value="suggestion" />
          </datalist>

          <div v-if="!scheduleValid" class="mt-3 flex flex-wrap items-center gap-3" data-testid="schedule-error">
            <p class="text-sm text-red-600">
              Les échéances totalisent {{ formatEuros(scheduledCents) }} au lieu de
              {{ formatEuros(totals.totalCents) }}.
            </p>
            <button class="btn-ghost !min-h-0 !py-1.5 text-xs" @click="redistribute">Répartir également</button>
          </div>
          <p v-else-if="scheduleWarning" class="mt-3 text-sm text-slate-500">
            Le total a changé : vérifiez la répartition.
          </p>

          <div class="mt-5">
            <div class="flex items-center justify-between">
              <label class="label !mb-0">Mention imprimée</label>
              <button class="text-xs font-semibold text-brand-700 hover:underline" @click="regenerateTerms">
                Régénérer
              </button>
            </div>
            <textarea
              v-model="form.paymentTerms"
              class="field mt-1.5 min-h-[80px] resize-y"
              rows="3"
              data-testid="payment-terms"
              @input="termsEdited = true"
            />
          </div>
        </section>

        <!-- Détails -->
        <section class="card">
          <h2 class="font-semibold text-slate-900">Détails</h2>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label">Numéro</label>
              <input v-model="form.number" class="field" data-testid="number" />
            </div>
            <div>
              <label class="label">Date d’émission</label>
              <input v-model="form.issuedAt" class="field" type="date" />
            </div>
            <div>
              <label class="label">Échéance (facultatif)</label>
              <input v-model="form.dueDate" class="field" type="date" />
            </div>
            <div>
              <label class="label">TVA</label>
              <p class="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
                Non applicable — article 293 B du CGI
              </p>
              <p class="mt-1 text-xs text-slate-500">Franchise en base : aucune TVA n’est facturée.</p>
            </div>
            <div class="sm:col-span-2">
              <label class="label">Note (facultatif)</label>
              <textarea v-model="form.notes" class="field min-h-[70px] resize-y" rows="2" />
            </div>
          </div>
        </section>

        <!-- Suivi -->
        <section class="card">
          <h2 class="font-semibold text-slate-900">Suivi</h2>
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              v-for="status in (['DRAFT', 'SENT', 'PAID', 'CANCELLED'] as const)"
              :key="status"
              class="rounded-full border px-4 py-2 text-sm font-semibold transition"
              :class="
                form.status === status
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              "
              :disabled="statusBusy"
              :data-testid="`status-${status}`"
              @click="setStatus(status)"
            >
              {{ STATUS_LABELS[status] }}
            </button>
          </div>
          <p v-if="data?.invoice.sentCount" class="mt-3 text-sm text-slate-500">
            Envoyée {{ data.invoice.sentCount }} fois.
          </p>
          <button
            v-if="form.status === 'DRAFT'"
            class="btn-ghost !min-h-0 mt-4 !py-2 text-sm !text-red-600"
            :disabled="deleting"
            @click="removeInvoice"
          >
            Supprimer ce brouillon
          </button>
        </section>

        <p v-if="saveError" class="text-sm text-red-600" data-testid="save-error">{{ saveError }}</p>
      </div>

      <!-- ═══ Aperçu ═══ -->
      <aside class="lg:sticky lg:top-6 lg:self-start">
        <div class="card !p-4">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-slate-900">Aperçu</h2>
            <span class="text-xs text-slate-500">Le PDF envoyé</span>
          </div>
          <p v-if="issuerMissing.length" class="mt-3 text-sm text-slate-500">
            L’aperçu s’affichera une fois votre identité de facturation complétée.
          </p>
          <iframe
            v-else
            :key="previewKey"
            :src="pdfUrl"
            class="mt-3 h-[680px] w-full rounded-xl border border-slate-200 bg-white"
            title="Aperçu de la facture"
            data-testid="pdf-preview"
          />
          <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs text-slate-500">Enregistrez pour rafraîchir l’aperçu.</p>
            <!-- Certains navigateurs (Safari iOS notamment) refusent d'afficher
                 un PDF dans un cadre : le document reste alors à un clic. -->
            <a :href="pdfUrl" target="_blank" rel="noopener" class="text-xs font-semibold text-brand-700 hover:underline">
              Ouvrir le PDF dans un onglet ↗
            </a>
          </div>
        </div>
      </aside>
    </div>

    <!-- ═══ Modale d'envoi ═══ -->
    <AppModal v-if="sendOpen" @close="sendOpen = false">
      <h2 class="title-serif text-xl">Envoyer la facture</h2>
      <p class="mt-1 text-sm text-slate-500">Le PDF part en pièce jointe.</p>
      <label class="label mt-5">Destinataire</label>
      <input v-model="sendTo" class="field" type="email" placeholder="client@exemple.fr" data-testid="send-to" />
      <p v-if="sendError" class="mt-3 text-sm text-red-600">{{ sendError }}</p>
      <div class="mt-6 flex justify-end gap-2">
        <button class="btn-ghost" @click="sendOpen = false">Annuler</button>
        <button class="btn-primary" :disabled="sending || !sendTo.trim()" @click="sendInvoice">
          {{ sending ? 'Envoi…' : 'Envoyer' }}
        </button>
      </div>
    </AppModal>
  </div>
</template>
