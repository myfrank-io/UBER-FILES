<script setup lang="ts">
// Calendrier : courses confirmées + saisie d'indisponibilités.
definePageMeta({ layout: 'dashboard', middleware: 'dashboard' })
useHead({ title: 'Calendrier' })
const { formatDateTime } = useFormat()

const { data: events, refresh } = await useFetch('/api/dashboard/calendar')

const form = reactive({ title: '', startAt: '', endAt: '' })
const errorMsg = ref('')
const saving = ref(false)

async function addUnavailability() {
  errorMsg.value = ''
  if (!form.startAt || !form.endAt) {
    errorMsg.value = 'Renseignez les dates de début et de fin.'
    return
  }
  saving.value = true
  try {
    await $fetch('/api/dashboard/availability', {
      method: 'POST',
      body: {
        title: form.title || undefined,
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      },
    })
    form.title = ''
    form.startAt = ''
    form.endAt = ''
    await refresh()
  } catch (e) {
    errorMsg.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur.'
  } finally {
    saving.value = false
  }
}

async function removeEvent(id: string) {
  await $fetch(`/api/dashboard/availability/${id}`, { method: 'DELETE' })
  await refresh()
}

const labels: Record<string, string> = {
  BOOKING: 'Course',
  UNAVAILABILITY: 'Indisponible',
  WORKING_BLOCK: 'Travail',
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold text-slate-900">Calendrier</h1>

    <!-- Ajout d'indisponibilité -->
    <div class="card mt-5">
      <h2 class="font-semibold text-slate-900">Ajouter une indisponibilité</h2>
      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        <input v-model="form.title" type="text" class="field" placeholder="Motif (optionnel)" />
        <input v-model="form.startAt" type="datetime-local" class="field" />
        <input v-model="form.endAt" type="datetime-local" class="field" />
      </div>
      <p v-if="errorMsg" class="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{{ errorMsg }}</p>
      <button class="btn-primary mt-3" :disabled="saving" @click="addUnavailability">
        {{ saving ? '…' : 'Ajouter' }}
      </button>
    </div>

    <!-- Liste -->
    <div class="mt-6 space-y-3">
      <p v-if="events && !events.length" class="text-sm text-slate-500">Aucun événement à venir.</p>
      <div
        v-for="e in events"
        :key="e.id"
        class="card flex items-center justify-between !py-4"
        :class="e.type === 'BOOKING' ? 'border-l-4 border-l-brand-600' : 'border-l-4 border-l-amber-400'"
      >
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">{{ labels[e.type] }}</p>
          <p class="font-medium text-slate-900">{{ e.title }}</p>
          <p class="text-sm text-slate-500">{{ formatDateTime(e.startAt) }} → {{ formatDateTime(e.endAt) }}</p>
        </div>
        <button
          v-if="e.type === 'UNAVAILABILITY'"
          class="text-sm text-red-500 hover:text-red-700"
          @click="removeEvent(e.id)"
        >
          Supprimer
        </button>
      </div>
    </div>
  </div>
</template>
