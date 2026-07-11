<script setup lang="ts">
// Layout du back-office chauffeur : navigation latérale (desktop) / barre basse (mobile).
const { user, session, clear, fetch: refreshSession } = useUserSession()

// Usurpation admin : quand un admin visite l'espace d'un chauffeur, la session
// mémorise son identité. On affiche alors un bandeau pour revenir à l'admin.
const impersonator = computed(
  () => (session.value as { impersonator?: { email: string } } | null)?.impersonator ?? null,
)
async function stopImpersonation() {
  await $fetch('/api/admin/stop-impersonation', { method: 'POST' })
  // Recharger l'état de session client (redevenu ADMIN) AVANT de naviguer,
  // sinon le middleware `admin` lit l'ancien rôle DRIVER et renvoie au login.
  await refreshSession()
  await navigateTo('/admin')
}

// État de validation du profil (bannière d'attente / suspension).
// Pas de `key` explicite : les pages qui appellent aussi /api/dashboard/me
// partagent alors la même clé auto-générée → une seule requête au lieu de deux.
const { data: me } = await useFetch('/api/dashboard/me')
const status = computed(() => (me.value as { status?: string } | null)?.status ?? null)
const publicSlug = computed(() => (me.value as { slug?: string } | null)?.slug ?? '')

// Page publique + nom d'affichage : passés au bouton « Partager ma page » pour
// construire le message côté client (ouverture WhatsApp/SMS dans le geste de clic).
const appBaseUrl = useRuntimeConfig().public.appBaseUrl
const publicUrl = computed(() => `${appBaseUrl}/${publicSlug.value}`)
const driverName = computed(() => (me.value as { displayName?: string } | null)?.displayName ?? '')

// Bannière de confirmation d'email (tant que l'adresse n'est pas vérifiée).
const emailVerified = computed(() => (me.value as { emailVerified?: boolean } | null)?.emailVerified ?? true)
const { success: toastSuccess, error: toastError } = useToast()
const resendingVerification = ref(false)
const verificationSent = ref(false)

async function resendVerification() {
  resendingVerification.value = true
  try {
    await $fetch('/api/auth/resend-verification', { method: 'POST' })
    verificationSent.value = true
    toastSuccess('Email de confirmation envoyé. Vérifiez votre boîte de réception.')
  } catch (e) {
    toastError((e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Erreur, réessayez.')
  } finally {
    resendingVerification.value = false
  }
}

// Navigation resserrée à 4 onglets : « Courses » regroupe l'ex-Calendrier,
// l'ex-Réservations et les Clients (vues internes) ; « Gains » a été supprimé.
const nav = [
  { to: '/dashboard', label: 'Accueil', icon: '🏠' },
  { to: '/dashboard/courses', label: 'Courses', icon: '🚗' },
  { to: '/dashboard/profil', label: 'Profil', icon: '👤' },
  { to: '/dashboard/parametres', label: 'Réglages', icon: '⚙️' },
]

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/dashboard/login')
}
</script>

<template>
  <!-- pb mobile : dégage la barre basse (56px + safe-area) ET le bouton flottant
       « Partager » qui la surplombe, pour qu'aucun contenu ne reste masqué en fin de scroll. -->
  <div class="min-h-screen bg-slate-50 pb-[calc(9.5rem+env(safe-area-inset-bottom))] sm:flex sm:pb-0">
    <!-- Sidebar desktop -->
    <aside class="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-5 sm:block">
      <div class="flex items-center gap-2.5">
        <svg width="24" height="24" viewBox="0 -2 32 32" fill="none" aria-hidden="true">
          <circle cx="7" cy="24" r="3.1" fill="#B5793F" />
          <circle cx="25" cy="3.5" r="3.1" stroke="#B5793F" stroke-width="2.2" />
          <path d="M9.5 23.5h7.5a5 5 0 0 0 0-10h-4a5 5 0 0 1 0-10H20.8" stroke="#B5793F" stroke-width="2.2" stroke-linecap="round" />
        </svg>
        <p class="font-serif text-xl font-medium tracking-tight text-slate-950">Ridewiz</p>
      </div>
      <p class="mt-1 truncate text-xs text-slate-400">{{ (user as { email?: string })?.email }}</p>
      <nav class="mt-6 space-y-1">
        <NuxtLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          active-class="bg-brand-50 text-brand-700"
        >
          <span>{{ item.icon }}</span>{{ item.label }}
        </NuxtLink>
      </nav>
      <button class="mt-6 text-sm text-slate-400 hover:text-slate-700" @click="logout">
        Déconnexion
      </button>
    </aside>

    <!-- Contenu -->
    <main class="flex-1 px-5 py-6 sm:px-8 sm:py-8">
      <!-- Bandeau d'usurpation : l'admin visite l'espace d'un chauffeur -->
      <div
        v-if="impersonator"
        class="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-3 text-sm text-indigo-900"
      >
        <p>
          👁️ Vous consultez cet espace en tant qu'administrateur
          (<strong>{{ impersonator.email }}</strong>). Vos modifications s'appliquent au chauffeur.
        </p>
        <button
          class="rounded-lg border border-indigo-300 bg-white px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100"
          @click="stopImpersonation"
        >
          ← Revenir à l'administration
        </button>
      </div>

      <!-- Bannière : adresse email à confirmer -->
      <div
        v-if="!emailVerified"
        class="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900"
      >
        <p>
          ✉️ <strong>Confirmez votre adresse email.</strong>
          <span v-if="!verificationSent">
            Un lien de confirmation vous a été envoyé à votre inscription — pensez à vérifier vos spams.
          </span>
          <span v-else>Nouvel email envoyé : cliquez sur le lien reçu pour confirmer.</span>
        </p>
        <button
          class="rounded-lg border border-blue-300 bg-white px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          :disabled="resendingVerification"
          @click="resendVerification"
        >
          {{ resendingVerification ? 'Envoi…' : 'Renvoyer le lien' }}
        </button>
      </div>

      <!-- Bannière de statut : profil en attente de validation ou suspendu -->
      <div
        v-if="status === 'PENDING'"
        class="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"
      >
        <p class="font-semibold">⏳ Profil en cours de validation</p>
        <p class="mt-1 text-amber-800">
          Votre profil a bien été reçu et est soumis à vérification par notre équipe.
          Vous pouvez dès maintenant le compléter et le personnaliser. Dès qu’il sera
          approuvé, votre page publique
          <code v-if="publicSlug" class="rounded bg-white/70 px-1">/{{ publicSlug }}</code>
          sera mise en ligne.
        </p>
      </div>
      <div
        v-else-if="status === 'SUSPENDED'"
        class="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800"
      >
        <p class="font-semibold">⛔ Profil suspendu</p>
        <p class="mt-1">
          Votre page publique n’est plus accessible. Contactez l’administration pour
          réactiver votre compte.
        </p>
      </div>

      <slot />
    </main>

    <AppToast />

    <!-- Bouton flottant « Partager ma page » (hors profil suspendu : page publique hors-ligne) -->
    <DashboardShare v-if="status !== 'SUSPENDED'" :public-url="publicUrl" :driver-name="driverName" />

    <!-- Barre de navigation mobile : grandes zones tactiles + safe area iOS -->
    <nav class="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
      <NuxtLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-500"
        active-class="!text-brand-700"
      >
        <span class="text-lg leading-none">{{ item.icon }}</span>{{ item.label }}
      </NuxtLink>
    </nav>
  </div>
</template>
