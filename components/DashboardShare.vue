<script setup lang="ts">
// Bouton flottant « Partager ma page » (espace chauffeur). Permet, en un clic,
// d'enregistrer un client (ex : présent dans la voiture) et de lui envoyer un
// message de remerciement + demande d'avis + lien de réservation par SMS,
// WhatsApp ou email. Le message est personnalisable (aperçu + modèle, persisté
// dans Driver.shareMessageTemplate).
import { buildShareMessage, defaultShareTemplate } from '~/lib/share-message'
import { driverReviewUrl, reviewFunnelPath } from '~/lib/review-link'

type Channel = 'SMS' | 'WHATSAPP' | 'EMAIL'

// Fournis par le layout dashboard (déjà chargés via /api/dashboard/me) : ils
// permettent de construire le message CÔTÉ CLIENT et donc d'ouvrir WhatsApp/SMS
// dans le geste de clic, sans dépendre d'un aller-retour réseau (fiabilité Android).
const props = defineProps<{ publicUrl: string; driverName: string }>()

// Profil complet (même cache que le layout) : slug → lien de la page d'avis,
// dépôt d'avis configuré ou non, modèle de message enregistré.
const { data: me, refresh: refreshMe } = useMe()
const meData = computed(
  () =>
    me.value as {
      slug?: string
      reviewUrl?: string | null
      googlePlace?: { placeId: string } | null
      shareMessageTemplate?: string | null
    } | null,
)
const appBaseUrl = useRuntimeConfig().public.appBaseUrl

// Lien « déposer un avis » : la page de notation Ridewiz (5★ → dépôt public,
// 1-4★ → retour privé), jamais le lien externe directement.
const reviewUrl = computed(() =>
  meData.value?.slug ? `${appBaseUrl}${reviewFunnelPath(meData.value.slug)}` : '',
)
// Un dépôt d'avis externe est configuré (fiche Google ou lien manuel) : le
// modèle par défaut inclut alors le paragraphe « laissez un avis ».
const hasReviewLink = computed(() =>
  Boolean(
    driverReviewUrl({
      reviewUrl: meData.value?.reviewUrl,
      googlePlaceId: meData.value?.googlePlace?.placeId,
    }),
  ),
)

// État partagé (useShareModal) : la modale peut aussi être ouverte depuis le
// CTA central de l'accueil, pas seulement depuis le bouton flottant ci-dessous.
const open = useShareModal()
const busy = ref(false)
const done = ref(false)
const errorMsg = ref('')
const { success: toastSuccess, error: toastError } = useToast()

const form = reactive({ name: '', phone: '', email: '', channel: 'WHATSAPP' as Channel })

const channels: { value: Channel; label: string; icon: string }[] = [
  { value: 'WHATSAPP', label: 'WhatsApp', icon: '💬' },
  { value: 'SMS', label: 'SMS', icon: '📱' },
  { value: 'EMAIL', label: 'Email', icon: '✉️' },
]

const needsEmail = computed(() => form.channel === 'EMAIL')
const canSubmit = computed(
  () => form.name.trim() && form.phone.trim() && (!needsEmail.value || form.email.trim()),
)

// ── Aperçu + modèle du message ──────────────────────────────────────────────
// `templateDraft` reste null tant que le chauffeur n'a pas touché le modèle :
// l'éditeur suit alors le modèle enregistré (ou le défaut) même si le profil
// se charge après l'ouverture de la modale.
const previewOpen = ref(false)
const templateDraft = ref<string | null>(null)
const savingTemplate = ref(false)

const effectiveDefault = computed(() => defaultShareTemplate(hasReviewLink.value))
const savedTemplate = computed(() => meData.value?.shareMessageTemplate ?? null)
const baseTemplate = computed(() => savedTemplate.value ?? effectiveDefault.value)
const editedTemplate = computed({
  get: () => templateDraft.value ?? baseTemplate.value,
  set: (v: string) => {
    templateDraft.value = v
  },
})
// Modifications non enregistrées / modèle qui s'écarte du défaut (affichage des actions).
const templateDirty = computed(() => editedTemplate.value.trim() !== baseTemplate.value.trim())
const isCustomTemplate = computed(
  () => savedTemplate.value != null || editedTemplate.value.trim() !== effectiveDefault.value.trim(),
)

function buildMessage(): string {
  return buildShareMessage({
    customerName: form.name.trim(),
    driverName: props.driverName,
    publicUrl: props.publicUrl,
    reviewUrl: reviewUrl.value,
    hasReviewLink: hasReviewLink.value,
    template: editedTemplate.value,
  })
}

// Aperçu vivant : le nom saisi remplace {client} (exemple « Marie » sinon).
const previewMessage = computed(() =>
  buildShareMessage({
    customerName: form.name.trim() || 'Marie',
    driverName: props.driverName,
    publicUrl: props.publicUrl,
    reviewUrl: reviewUrl.value,
    hasReviewLink: hasReviewLink.value,
    template: editedTemplate.value,
  }),
)

// Persiste le modèle (null = retour au défaut) puis resynchronise le cache profil.
async function persistTemplate(value: string | null) {
  savingTemplate.value = true
  try {
    await $fetch('/api/dashboard/profile', { method: 'PATCH', body: { shareMessageTemplate: value } })
    await refreshMe()
    templateDraft.value = null
    toastSuccess(value === null ? 'Modèle par défaut restauré.' : 'Modèle enregistré.')
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur, réessayez.')
  } finally {
    savingTemplate.value = false
  }
}

function saveTemplate() {
  const value = editedTemplate.value.trim()
  // Un modèle identique au défaut n'est pas stocké (il suivra les évolutions du défaut).
  return persistTemplate(value === effectiveDefault.value.trim() ? null : value)
}

function resetTemplate() {
  if (savedTemplate.value != null) return persistTemplate(null)
  templateDraft.value = null
}

function reset() {
  form.name = ''
  form.phone = ''
  form.email = ''
  form.channel = 'WHATSAPP'
  done.value = false
  errorMsg.value = ''
  previewOpen.value = false
  // Les retouches non enregistrées du modèle ne survivent pas à la fermeture.
  templateDraft.value = null
}

function close() {
  open.value = false
  // Petit délai pour ne pas voir le formulaire se vider pendant la fermeture.
  setTimeout(reset, 200)
}

// Numéro au format international pour WhatsApp (les numéros FR en 0… → 33…).
function normalizePhone(phone: string): string {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  else if (d.length === 10 && d.startsWith('0')) d = '33' + d.slice(1)
  return d
}

// Enregistre / met à jour le client côté serveur. `keepalive` : la requête
// survit à une navigation (cas du lien sms: qui peut décharger la page).
// `message` : ce qui a été prévisualisé/envoyé — utilisé tel quel pour l'email.
function saveCustomer(channel: Channel, message: string) {
  return $fetch('/api/dashboard/share-page', {
    method: 'POST',
    keepalive: true,
    body: {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      channel,
      message,
    },
  })
}

async function submit() {
  if (!canSubmit.value || busy.value) return
  errorMsg.value = ''
  const message = buildMessage()

  // EMAIL : l'envoi est fait par le serveur → on attend la confirmation.
  if (form.channel === 'EMAIL') {
    busy.value = true
    try {
      await saveCustomer('EMAIL', message)
      done.value = true
    } catch (e) {
      errorMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
    } finally {
      busy.value = false
    }
    return
  }

  // SMS / WhatsApp : on OUVRE l'app immédiatement, dans le geste de clic, avec un
  // message construit côté client. Ne JAMAIS attendre le réseau avant d'ouvrir —
  // c'est ce délai qui fait échouer l'ouverture (onglet blanc / popup bloquée) sur
  // Android. L'enregistrement du client part ensuite en tâche de fond.
  if (form.channel === 'WHATSAPP') {
    const digits = normalizePhone(form.phone)
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    // Nouvel onglet (ne décharge pas l'espace chauffeur) ; repli sur la navigation
    // directe si le navigateur bloque l'ouverture.
    const win = window.open(url, '_blank')
    if (!win) window.location.href = url
  } else {
    // SMS : lien natif avec corps pré-rempli (ouvre l'app Messages sans décharger).
    const tel = form.phone.replace(/[^+\d]/g, '')
    window.location.href = `sms:${tel}?body=${encodeURIComponent(message)}`
  }

  // Enregistrement en tâche de fond : l'ouverture de l'app ne dépend pas du réseau.
  saveCustomer(form.channel, message).catch(() => {
    /* silencieux : le message est déjà parti, l'enregistrement est secondaire */
  })
  done.value = true
}
</script>

<template>
  <div>
    <!-- Bouton flottant (au-dessus de la barre de navigation mobile).
         z-20 : sous les panneaux et modales (z-40/z-50) pour ne jamais intercepter
         leurs taps ; le padding bas du layout dégage le contenu en fin de scroll. -->
    <button
      class="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-20 flex min-h-[52px] items-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white shadow-lg transition hover:scale-105 hover:bg-brand-700 sm:bottom-6 sm:right-6"
      title="Partager ma page de réservation"
      aria-label="Partager ma page de réservation"
      @click="open = true"
    >
      <span aria-hidden="true" class="text-lg">🔗</span>
      Partagez votre profil
    </button>

    <AppModal v-if="open" @close="close">
      <!-- Confirmation -->
      <div v-if="done" class="space-y-4 text-center">
        <p class="text-4xl">✅</p>
        <h2 class="text-lg font-semibold text-slate-900">
          {{ form.channel === 'EMAIL' ? 'Email envoyé' : 'C’est parti !' }}
        </h2>
        <p class="text-sm text-slate-500">
          <template v-if="form.channel === 'EMAIL'">
            Le message a été envoyé à <strong>{{ form.name }}</strong>, qui est
            enregistré dans vos clients.
          </template>
          <template v-else>
            {{ form.name }} est enregistré dans vos clients. Terminez l’envoi dans l’application
            qui vient de s’ouvrir.
          </template>
        </p>
        <div class="flex justify-center gap-3">
          <button class="btn-primary" @click="reset">Partager à un autre client</button>
          <button class="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50" @click="close">
            Fermer
          </button>
        </div>
      </div>

      <!-- Formulaire -->
      <form v-else class="space-y-4" @submit.prevent="submit">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-slate-900">Partager ma page de réservation</h2>
            <p class="mt-1 text-sm text-slate-500">
              Enregistrez votre client et envoyez-lui un message de remerciement avec le lien
              pour réserver ses prochaines courses.
            </p>
          </div>
          <button
            type="button"
            class="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fermer"
            @click="close"
          >
            ✕
          </button>
        </div>

        <div>
          <label class="label" for="share-name">Nom du client</label>
          <input id="share-name" v-model="form.name" class="field" placeholder="Ex : Marie" required />
        </div>

        <div>
          <label class="label">Canal d’envoi</label>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="c in channels"
              :key="c.value"
              type="button"
              class="rounded-xl border px-3 py-2 text-sm font-medium transition"
              :class="form.channel === c.value
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
              @click="form.channel = c.value"
            >
              {{ c.icon }} {{ c.label }}
            </button>
          </div>
        </div>

        <div>
          <label class="label" for="share-phone">Téléphone</label>
          <input
            id="share-phone"
            v-model="form.phone"
            class="field"
            type="tel"
            placeholder="Ex : 06 12 34 56 78"
            required
          />
        </div>

        <!-- Email : uniquement pour le canal email (où il est indispensable). -->
        <div v-if="needsEmail">
          <label class="label" for="share-email">Email du client</label>
          <input
            id="share-email"
            v-model="form.email"
            class="field"
            type="email"
            placeholder="client@email.com"
            required
          />
        </div>

        <!-- Aperçu discret du message + personnalisation du modèle -->
        <div>
          <button
            type="button"
            class="flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-slate-600"
            @click="previewOpen = !previewOpen"
          >
            <span aria-hidden="true">👁️</span>
            <span class="underline decoration-dotted underline-offset-2">
              {{ previewOpen ? 'Masquer l’aperçu du message' : 'Prévisualiser le message' }}
            </span>
          </button>

          <div v-if="previewOpen" class="mt-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <p class="mb-1 text-xs font-semibold text-slate-500">Message envoyé au client</p>
              <p class="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-700">{{ previewMessage }}</p>
            </div>
            <div>
              <label class="mb-1 block text-xs font-semibold text-slate-500" for="share-template">
                Adapter le modèle
              </label>
              <textarea id="share-template" v-model="editedTemplate" rows="8" class="field !text-sm" />
              <p class="mt-1 text-[11px] leading-relaxed text-slate-400">
                Variables remplacées à l’envoi : <code>{client}</code>, <code>{chauffeur}</code>,
                <code>{lien_avis}</code> (page de dépôt d’avis), <code>{lien_reservation}</code>
                (page de réservation).
              </p>
            </div>
            <div v-if="templateDirty || isCustomTemplate" class="flex flex-wrap items-center justify-end gap-2">
              <button
                v-if="isCustomTemplate"
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                :disabled="savingTemplate"
                @click="resetTemplate"
              >
                Revenir au modèle par défaut
              </button>
              <button
                v-if="templateDirty"
                type="button"
                class="rounded-lg border border-brand-500 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                :disabled="savingTemplate"
                @click="saveTemplate"
              >
                {{ savingTemplate ? 'Enregistrement…' : 'Enregistrer ce modèle' }}
              </button>
            </div>
          </div>
        </div>

        <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{{ errorMsg }}</p>

        <button type="submit" class="btn-primary w-full" :disabled="!canSubmit || busy">
          {{ busy ? 'Envoi…' : form.channel === 'EMAIL' ? 'Envoyer l’email' : `Envoyer par ${form.channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}` }}
        </button>
      </form>
    </AppModal>
  </div>
</template>
