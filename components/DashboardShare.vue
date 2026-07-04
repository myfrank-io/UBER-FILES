<script setup lang="ts">
// Bouton flottant « Partager ma page » (espace chauffeur). Permet, en un clic,
// d'enregistrer un client (ex : présent dans la voiture) et de lui envoyer le
// lien de la page publique de réservation par SMS, WhatsApp ou email.
type Channel = 'SMS' | 'WHATSAPP' | 'EMAIL'

const open = ref(false)
const busy = ref(false)
const done = ref(false)
const errorMsg = ref('')

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

function reset() {
  form.name = ''
  form.phone = ''
  form.email = ''
  form.channel = 'WHATSAPP'
  done.value = false
  errorMsg.value = ''
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

async function submit() {
  if (!canSubmit.value || busy.value) return
  busy.value = true
  errorMsg.value = ''

  // WhatsApp s'ouvre dans un nouvel onglet : on l'ouvre MAINTENANT (dans le geste
  // de clic) — sinon le navigateur bloque la popup car elle surviendrait après
  // l'appel réseau (perte de l'« activation utilisateur »). On le redirige ensuite.
  let waWindow: Window | null = null
  if (form.channel === 'WHATSAPP') {
    waWindow = window.open('', '_blank')
  }

  try {
    const res = await $fetch<{ message: string; publicUrl: string; sent: boolean }>(
      '/api/dashboard/share-page',
      {
        method: 'POST',
        body: {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          channel: form.channel,
        },
      },
    )

    if (form.channel === 'EMAIL') {
      done.value = true
    } else if (form.channel === 'WHATSAPP') {
      const digits = normalizePhone(form.phone)
      const url = `https://wa.me/${digits}?text=${encodeURIComponent(res.message)}`
      if (waWindow) waWindow.location.href = url
      else window.location.href = url // repli si l'onglet n'a pas pu s'ouvrir
      done.value = true
    } else {
      // SMS : lien natif tel/sms avec corps pré-rempli.
      const tel = form.phone.replace(/[^+\d]/g, '')
      window.location.href = `sms:${tel}?body=${encodeURIComponent(res.message)}`
      done.value = true
    }
  } catch (e) {
    if (waWindow) waWindow.close()
    errorMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <!-- Bouton flottant (au-dessus de la barre de navigation mobile).
         z-20 : sous les panneaux et modales (z-40/z-50) pour ne jamais intercepter
         leurs taps ; le padding bas du layout dégage le contenu en fin de scroll. -->
    <button
      class="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-2xl text-white shadow-lg transition hover:scale-105 hover:bg-brand-700 sm:bottom-6 sm:right-6"
      title="Partager ma page de réservation"
      aria-label="Partager ma page de réservation"
      @click="open = true"
    >
      🔗
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
            Le lien de réservation a été envoyé à <strong>{{ form.name }}</strong>, qui est
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
              Enregistrez votre client et envoyez-lui le lien pour réserver ses prochaines courses.
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

        <div>
          <label class="label" for="share-email">
            Email <span class="font-normal text-slate-400">{{ needsEmail ? '(requis)' : '(optionnel)' }}</span>
          </label>
          <input
            id="share-email"
            v-model="form.email"
            class="field"
            type="email"
            placeholder="client@email.com"
            :required="needsEmail"
          />
          <p v-if="needsEmail && !form.email.trim()" class="mt-1 text-xs text-amber-600">
            L’email est obligatoire pour l’envoi par email.
          </p>
        </div>

        <p v-if="errorMsg" class="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{{ errorMsg }}</p>

        <button type="submit" class="btn-primary w-full" :disabled="!canSubmit || busy">
          {{ busy ? 'Envoi…' : form.channel === 'EMAIL' ? 'Envoyer l’email' : `Envoyer par ${form.channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'}` }}
        </button>
      </form>
    </AppModal>
  </div>
</template>
