<script setup lang="ts">
// Étape « Vous » : nom affiché, accroche, photo. La photo s'enregistre dès
// l'import (comme sur la page Profil) ; nom et accroche au « Continuer ».
import { setupApiError } from '~/lib/setup-view'

const { state, result, next, refresh } = useSetupFlow()
const step = computed(() => result.value?.steps.find((s) => s.key === 'identite'))

const form = reactive({ displayName: '', tagline: '' })
let seeded = false
// Pré-rempli UNE fois à l'ouverture de l'écran : les rechargements d'état
// (ex. après l'import de la photo) ne doivent pas écraser ce qui est saisi.
watch(
  () => state.value?.driver,
  (d) => {
    if (!d || seeded) return
    seeded = true
    form.displayName = d.displayName ?? ''
    form.tagline = d.tagline ?? ''
  },
  { immediate: true },
)

const TAGLINE_IDEAS = [
  'Chauffeur VTC à Paris, ponctuel et discret',
  'Vos trajets en toute sérénité, 7j/7',
  'Transferts aéroports et gares, berline confort',
  'Chauffeur privé — Paris & Île-de-France',
]

const busy = ref(false)
const errorMsg = ref('')

// ─── Photo ───────────────────────────────────────────────────────────────────
const photoInput = ref<HTMLInputElement | null>(null)
const photoBusy = ref(false)
const photoPreview = ref<string | null>(null)
const photoUrl = computed(() => photoPreview.value ?? state.value?.driver.photoUrl ?? null)

async function onPhotoSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  errorMsg.value = ''
  if (!file.type.startsWith('image/')) {
    errorMsg.value = 'Veuillez choisir une image (JPG, PNG, WEBP…).'
    input.value = ''
    return
  }
  if (file.size > MAX_PHOTO_SOURCE_BYTES) {
    errorMsg.value = 'Image trop volumineuse (15 Mo maximum).'
    input.value = ''
    return
  }
  photoBusy.value = true
  try {
    const dataUrl = await resizeImageToDataUrl(file, 512)
    await $fetch('/api/dashboard/profile', { method: 'PATCH', body: { photoUrl: dataUrl } })
    photoPreview.value = dataUrl
    await refresh()
  } catch (err) {
    errorMsg.value = setupApiError(err, (err as Error).message || 'Import de la photo impossible.')
  } finally {
    photoBusy.value = false
    input.value = ''
  }
}

const canContinue = computed(() => form.displayName.trim().length >= 2 && form.tagline.trim().length > 0)

async function save() {
  if (!canContinue.value) {
    errorMsg.value = 'Indiquez votre nom et une phrase de présentation.'
    return
  }
  busy.value = true
  errorMsg.value = ''
  try {
    await $fetch('/api/dashboard/profile', {
      method: 'PATCH',
      body: { displayName: form.displayName.trim(), tagline: form.tagline.trim() },
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
    icon="👤"
    title="Parlons de vous"
    subtitle="C'est ce que vos clients verront en premier sur votre page."
    :done="step?.done"
  >
    <!-- Photo -->
    <div class="flex items-center gap-4">
      <img
        v-if="photoUrl"
        :src="photoUrl"
        alt="Votre photo"
        class="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-brand-100"
      />
      <div v-else class="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-slate-100 text-3xl text-slate-400" aria-hidden="true">👤</div>
      <div class="min-w-0">
        <input ref="photoInput" type="file" accept="image/*" class="sr-only" @change="onPhotoSelected" />
        <button type="button" class="btn-ghost !min-h-[40px] px-4 py-2 text-sm" :disabled="photoBusy" @click="photoInput?.click()">
          {{ photoBusy ? 'Enregistrement…' : photoUrl ? 'Changer ma photo' : '📷 Ajouter ma photo' }}
        </button>
        <p class="mt-1.5 text-xs text-slate-500">
          Un portrait souriant, de face, en tenue de travail. Enregistrée automatiquement.
        </p>
        <p v-if="!photoUrl" class="mt-1 text-xs font-medium text-amber-700">Recommandé : les clients réservent plus volontiers avec une photo.</p>
      </div>
    </div>

    <div>
      <label class="label" for="setup-name">Nom affiché</label>
      <input id="setup-name" v-model="form.displayName" class="field" maxlength="120" placeholder="Ex : Karim · Chauffeur privé" autocomplete="name" />
      <p class="mt-1 text-xs text-slate-500">Votre prénom, votre nom ou celui de votre société.</p>
    </div>

    <div>
      <label class="label" for="setup-tagline">Votre phrase de présentation</label>
      <input id="setup-tagline" v-model="form.tagline" class="field" maxlength="200" placeholder="Une ligne qui donne envie de réserver" />
      <div class="mt-2 flex flex-wrap gap-1.5">
        <button
          v-for="idea in TAGLINE_IDEAS"
          :key="idea"
          type="button"
          class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-brand-300 hover:bg-brand-50"
          @click="form.tagline = idea"
        >{{ idea }}</button>
      </div>
    </div>

    <template #help>
      <p>Le <strong>nom affiché</strong> apparaît en titre de votre page et sur vos devis. L'<strong>accroche</strong> est la ligne juste en dessous : dites en quelques mots ce que vous proposez et où.</p>
      <p>Vous pourrez tout modifier plus tard dans votre espace, onglet <em>Profil</em>.</p>
    </template>

    <template #actions>
      <SetupActions :busy="busy" :disabled="!canContinue" :error="errorMsg" @next="save" />
    </template>
  </SetupStepShell>
</template>
