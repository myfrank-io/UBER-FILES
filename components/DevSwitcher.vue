<script setup lang="ts">
// ⚠️ OUTIL DE DÉVELOPPEMENT UNIQUEMENT — À RETIRER AVANT LA VERSION FINALE.
// Bouton flottant pour basculer en un clic entre : Admin / Espace chauffeur / Pages publiques.
// Se connecte automatiquement au bon compte (premier admin / premier chauffeur en base).
// Visible seulement quand `devTools` est actif (dev local, ou DEV_TOOLS=1 en ligne).

const config = useRuntimeConfig()
const enabled = config.public.devTools

const open = ref(false)
const busy = ref(false)
const { user, fetch: refreshSession } = useUserSession()

const drivers = ref<{ slug: string; displayName: string; status: string }[]>([])

onMounted(async () => {
  if (!enabled) return
  try {
    const res = await $fetch<{ drivers: typeof drivers.value }>('/api/dev/info')
    drivers.value = res.drivers
  } catch {
    /* base vide ou endpoint désactivé : on affiche quand même le menu */
  }
})

const currentRole = computed(() => (user.value as { role?: string } | null)?.role ?? null)

async function goAs(role: 'ADMIN' | 'DRIVER', path: string) {
  busy.value = true
  try {
    await $fetch('/api/dev/login', { method: 'POST', body: { role } })
    await refreshSession()
    open.value = false
    await navigateTo(path)
  } catch (e) {
    alert((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Connexion dev impossible.')
  } finally {
    busy.value = false
  }
}

function goPublic(slug: string) {
  open.value = false
  navigateTo(`/${slug}`)
}
</script>

<template>
  <div v-if="enabled" class="fixed bottom-20 right-4 z-[100] sm:bottom-4">
    <!-- Panneau -->
    <div
      v-if="open"
      class="mb-2 w-64 rounded-2xl border border-amber-300 bg-white p-3 shadow-xl"
    >
      <p class="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-amber-600">
        Mode dev
        <span v-if="currentRole" class="rounded-full bg-slate-100 px-2 py-0.5 font-medium normal-case text-slate-500">
          {{ currentRole === 'ADMIN' ? 'Admin' : 'Chauffeur' }}
        </span>
      </p>

      <div class="space-y-1.5">
        <button
          class="w-full rounded-xl bg-slate-900 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          :disabled="busy"
          @click="goAs('ADMIN', '/admin')"
        >
          🛠️ Espace admin
        </button>
        <button
          class="w-full rounded-xl bg-brand-600 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          :disabled="busy"
          @click="goAs('DRIVER', '/dashboard')"
        >
          🚗 Espace chauffeur
        </button>

        <p class="pt-1 text-xs font-semibold text-slate-400">Pages publiques</p>
        <button
          v-for="d in drivers"
          :key="d.slug"
          class="w-full rounded-xl bg-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-200"
          @click="goPublic(d.slug)"
        >
          🌐 {{ d.displayName }}
          <span class="block text-xs text-slate-400">/{{ d.slug }} · {{ d.status }}</span>
        </button>
        <p v-if="!drivers.length" class="text-xs text-slate-400">Aucun chauffeur en base.</p>
      </div>
    </div>

    <!-- Bouton flottant -->
    <button
      class="ml-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-300 text-xl shadow-lg transition hover:scale-105"
      title="Commutateur de développement"
      @click="open = !open"
    >
      {{ open ? '✕' : '🧪' }}
    </button>
  </div>
</template>
