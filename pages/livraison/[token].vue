<script setup lang="ts">
// Adresse de livraison des cartes NFC, remplie par le CHAUFFEUR lui-même.
//
// Ouverte depuis le lien que l'admin envoie par WhatsApp — même jeton que le
// PDF de proposition. Aucune session : le jeton est la seule protection, et il
// ne donne accès qu'à cette adresse. Le chauffeur est ici un client de Ridewiz,
// on le vouvoie comme partout ailleurs dans l'interface produit.
import { EMPTY_SHIPPING, type NfcShipping } from '~/lib/nfc-card'

const route = useRoute()
const token = route.params.token as string
const { formatDateTime } = useFormat()

interface DeliveryPayload {
  driverName: string
  qtyReview: number
  qtyBusiness: number
  shipping: NfcShipping
  complete: boolean
  filledAt: string | null
}

const { data, error } = await useFetch<DeliveryPayload>(`/api/public/livraison/${token}`)

// Page de formulaire privée : jamais indexée.
useHead({
  title: 'Adresse de livraison — Ridewiz',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const form = reactive<NfcShipping>({ ...EMPTY_SHIPPING, ...(data.value?.shipping ?? {}) })

const saving = ref(false)
const saved = ref(false)
const errorMsg = ref('')

// Récapitulatif de la commande : les quantités à 0 ne sont pas annoncées.
const orderSummary = computed(() => {
  const parts = [
    (data.value?.qtyReview ?? 0) > 0 ? `${data.value!.qtyReview} cartes avis Google` : '',
    (data.value?.qtyBusiness ?? 0) > 0 ? `${data.value!.qtyBusiness} cartes de visite` : '',
  ].filter(Boolean)
  return parts.join(' et ')
})

// Validation côté client, uniquement pour éviter un aller-retour inutile : le
// serveur revalide tout de son côté (schéma partagé lib/nfc-card).
const missing = computed(() => {
  const labels: Record<keyof NfcShipping, string> = {
    firstName: 'le prénom',
    lastName: 'le nom',
    address: 'l’adresse',
    postalCode: 'le code postal',
    city: 'la ville',
    phone: 'le téléphone',
  }
  return (Object.keys(labels) as (keyof NfcShipping)[]).filter((k) => !form[k].trim()).map((k) => labels[k])
})

const postalCodeInvalid = computed(() => Boolean(form.postalCode.trim()) && !/^\d{5}$/.test(form.postalCode.trim()))

async function submit() {
  errorMsg.value = ''
  if (missing.value.length) {
    errorMsg.value = `Il manque ${missing.value.join(', ')}.`
    return
  }
  if (postalCodeInvalid.value) {
    errorMsg.value = 'Le code postal doit contenir 5 chiffres.'
    return
  }
  saving.value = true
  try {
    await $fetch(`/api/public/livraison/${token}`, { method: 'POST', body: { ...form } })
    saved.value = true
  } catch (e) {
    errorMsg.value =
      (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Envoi impossible. Réessayez dans un instant.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 px-5 pb-12 pt-8">
    <div class="mx-auto max-w-lg">
      <p class="text-center font-serif text-lg font-medium tracking-tight text-night">Ridewiz</p>

      <div v-if="error" class="card mt-6 text-center">
        <p class="text-3xl">🔒</p>
        <p class="mt-2 font-semibold text-slate-700">Ce lien n'est plus valable.</p>
        <p class="mt-2 text-sm text-slate-500">Demandez-en un nouveau à votre contact Ridewiz.</p>
      </div>

      <!-- Confirmation : l'adresse est enregistrée, il n'y a plus rien à faire. -->
      <div v-else-if="saved" class="card mt-6 text-center" data-testid="delivery-saved">
        <p class="text-3xl">📦</p>
        <h1 class="mt-2 font-serif text-xl font-medium tracking-tight text-slate-900">C'est noté, merci !</h1>
        <p class="mt-2 text-sm text-slate-600">
          Vos cartes seront expédiées à cette adresse dès qu'elles sortiront de production.
        </p>
        <div class="mt-4 rounded-xl bg-slate-50 p-4 text-left text-sm text-slate-700">
          <p class="font-semibold">{{ form.firstName }} {{ form.lastName }}</p>
          <p>{{ form.address }}</p>
          <p>{{ form.postalCode }} {{ form.city }}</p>
          <p class="mt-1 text-slate-500">{{ form.phone }}</p>
        </div>
        <button type="button" class="btn-ghost mt-4 text-sm" @click="saved = false">Corriger l'adresse</button>
      </div>

      <div v-else-if="data" class="card mt-6">
        <h1 class="font-serif text-xl font-medium tracking-tight text-slate-900">Où livrer vos cartes ?</h1>
        <p class="mt-2 text-sm text-slate-600">
          <template v-if="orderSummary">Vos {{ orderSummary }} sont bientôt prêtes.</template>
          <template v-else>Vos cartes sont bientôt prêtes.</template>
          Indiquez l'adresse à laquelle nous devons les envoyer.
        </p>
        <p v-if="data.filledAt" class="mt-2 text-xs text-slate-400">
          Adresse déjà envoyée le {{ formatDateTime(data.filledAt) }} — vous pouvez la corriger ici.
        </p>

        <form class="mt-5 space-y-4" @submit.prevent="submit">
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="ship-first">Prénom</label>
              <input id="ship-first" v-model="form.firstName" class="field" maxlength="60" autocomplete="given-name" />
            </div>
            <div>
              <label class="label" for="ship-last">Nom</label>
              <input id="ship-last" v-model="form.lastName" class="field" maxlength="60" autocomplete="family-name" />
            </div>
          </div>

          <div>
            <label class="label" for="ship-address">Adresse</label>
            <input
              id="ship-address"
              v-model="form.address"
              class="field"
              maxlength="160"
              autocomplete="street-address"
              placeholder="12 rue des Lilas, bât. B"
            />
            <p class="mt-1 text-xs text-slate-400">Numéro, rue, et le complément s'il en faut un (bâtiment, étage, code).</p>
          </div>

          <div class="grid gap-4 sm:grid-cols-[140px_1fr]">
            <div>
              <label class="label" for="ship-postal">Code postal</label>
              <input
                id="ship-postal"
                v-model="form.postalCode"
                class="field"
                inputmode="numeric"
                maxlength="5"
                autocomplete="postal-code"
                placeholder="75011"
              />
            </div>
            <div>
              <label class="label" for="ship-city">Ville</label>
              <input id="ship-city" v-model="form.city" class="field" maxlength="80" autocomplete="address-level2" />
            </div>
          </div>

          <div>
            <label class="label" for="ship-phone">Téléphone</label>
            <input
              id="ship-phone"
              v-model="form.phone"
              class="field"
              type="tel"
              maxlength="30"
              autocomplete="tel"
              placeholder="06 12 34 56 78"
            />
            <p class="mt-1 text-xs text-slate-400">Le transporteur s'en sert pour vous prévenir de la livraison.</p>
          </div>

          <p v-if="errorMsg" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ errorMsg }}</p>

          <button type="submit" class="btn-primary w-full" :disabled="saving" data-testid="delivery-submit">
            {{ saving ? 'Envoi…' : 'Valider mon adresse' }}
          </button>
        </form>
      </div>

      <p class="mt-6 text-center text-xs text-slate-400">
        Ces informations servent uniquement à l'expédition de vos cartes.
      </p>
    </div>
  </div>
</template>
