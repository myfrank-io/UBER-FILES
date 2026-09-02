<script setup lang="ts">
// Étape « Contact » : téléphone (affiché aux clients, requis) et email de
// contact (notifications), pré-rempli avec l'email du compte.
import { setupApiError } from '~/lib/setup-view'

const { state, result, next } = useSetupFlow()
const step = computed(() => result.value?.steps.find((s) => s.key === 'contact'))

const form = reactive({ phone: '', contactEmail: '' })
let seeded = false
watch(
  () => state.value?.driver,
  (d) => {
    if (!d || seeded) return
    seeded = true
    form.phone = d.phone ?? ''
    form.contactEmail = d.contactEmail ?? d.accountEmail ?? ''
  },
  { immediate: true },
)

const busy = ref(false)
const errorMsg = ref('')
const phoneValid = computed(() => form.phone.replace(/\D/g, '').length >= 9)

async function save() {
  if (!phoneValid.value) {
    errorMsg.value = 'Indiquez un numéro de téléphone valide.'
    return
  }
  busy.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/dashboard/profile', {
      method: 'PATCH',
      body: {
        phone: form.phone.trim(),
        contactEmail: form.contactEmail.trim() || null,
      },
    })
    await next()
  } catch (e) {
    errorMsg.value = setupApiError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SetupStepShell
    icon="📞"
    title="Comment vous joindre ?"
    subtitle="Votre numéro est affiché sur votre page : vos clients peuvent vous appeler ou vous écrire sur WhatsApp."
    :done="step?.done"
  >
    <div>
      <label class="label" for="setup-phone">Téléphone</label>
      <input id="setup-phone" v-model="form.phone" type="tel" class="field" maxlength="30" placeholder="06 12 34 56 78" autocomplete="tel" inputmode="tel" />
    </div>
    <div>
      <label class="label" for="setup-email">Email de contact</label>
      <input id="setup-email" v-model="form.contactEmail" type="email" class="field" placeholder="vous@exemple.fr" autocomplete="email" />
      <p class="mt-1 text-xs text-slate-500">Vous y recevrez vos demandes de réservation et vos confirmations.</p>
    </div>

    <template #actions>
      <SetupActions :busy="busy" :disabled="!phoneValid" :error="errorMsg" @next="save" />
    </template>
  </SetupStepShell>
</template>
