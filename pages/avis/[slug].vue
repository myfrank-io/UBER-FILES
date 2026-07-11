<script setup lang="ts">
// Page de notation (funnel d'avis) : étape intermédiaire entre les messages
// automatiques (« Laisser un avis ») et le dépôt public. Le client note sa
// course : 5★ → redirection immédiate vers le lien d'avis public du chauffeur
// (fiche Google, Trustpilot…) ; 1-4★ → formulaire de retour privé, transmis au
// chauffeur par email/Telegram et jamais publié.
const route = useRoute()
const slug = route.params.slug as string
const { t } = useI18n()

interface DriverPublic {
  slug: string
  displayName: string
  photoUrl: string | null
  reviewUrl: string | null // lien d'avis EXTERNE (cible de la redirection 5★)
}

const { data: driver, error } = await useFetch<DriverPublic>(`/api/public/${slug}`)
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Chauffeur introuvable', fatal: true })
}

// Page de tunnel : pas d'intérêt SEO, on la garde hors index.
useHead(() => ({
  title: driver.value
    ? t('review.metaTitle', { name: driver.value.displayName })
    : t('common.appName'),
  meta: [{ name: 'robots', content: 'noindex' }],
}))

// Référence de course optionnelle (posée par le lien du reçu : /avis/x?ref=ABC).
const refParam = route.query.ref
const bookingRef =
  typeof refParam === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(refParam) ? refParam : ''

const rating = ref(0) // 1-4 : formulaire privé ; 5 : redirection
const hovered = ref(0)
const comment = ref('')
const customerName = ref('')
const sending = ref(false)
const sent = ref(false)
const redirecting = ref(false)
const errorMsg = ref('')

function pick(n: number) {
  if (sent.value || redirecting.value) return
  rating.value = n
  if (n < 5) return
  // Client satisfait : direction le dépôt d'avis public, sans détour.
  const url = driver.value?.reviewUrl
  if (url) {
    redirecting.value = true
    window.location.href = url
  } else {
    // Pas de lien externe configuré : on remercie, simplement.
    sent.value = true
  }
}

async function submit() {
  if (comment.value.trim().length < 3) return
  sending.value = true
  errorMsg.value = ''
  try {
    await $fetch(`/api/public/${slug}/review-feedback`, {
      method: 'POST',
      body: {
        rating: rating.value,
        comment: comment.value.trim(),
        ...(customerName.value.trim() ? { name: customerName.value.trim() } : {}),
        ...(bookingRef ? { bookingRef } : {}),
      },
    })
    sent.value = true
  } catch (e) {
    errorMsg.value =
      (e as { data?: { statusMessage?: string } })?.data?.statusMessage
      ?? t('common.genericError')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div v-if="driver" class="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-10">
    <div class="rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
      <img
        v-if="driver.photoUrl"
        :src="driver.photoUrl"
        :alt="driver.displayName"
        class="mx-auto h-24 w-24 rounded-full border-2 border-amber-200 object-cover"
      />
      <h1 class="mt-4 font-serif text-2xl font-medium tracking-tight text-slate-900">
        {{ $t('review.title', { name: driver.displayName }) }}
      </h1>

      <!-- Merci (retour envoyé, ou 5★ sans lien externe configuré) -->
      <template v-if="sent">
        <p class="mt-4 text-lg">{{ rating === 5 ? '🌟' : '🙏' }}</p>
        <p class="mt-1 font-semibold text-slate-900">
          {{ rating === 5 ? $t('review.sentFiveTitle') : $t('review.sentTitle') }}
        </p>
        <p class="mt-1 text-sm text-slate-600">
          {{ rating === 5 ? $t('review.sentFiveBody') : $t('review.sentBody', { name: driver.displayName }) }}
        </p>
      </template>

      <!-- Redirection 5★ en cours vers la page d'avis publique -->
      <p v-else-if="redirecting" class="mt-4 text-sm text-slate-600">
        {{ $t('review.redirecting') }}
      </p>

      <template v-else>
        <p class="mt-1 text-sm text-slate-600">{{ $t('review.subtitle') }}</p>

        <!-- Les 5 étoiles -->
        <div class="mt-5 flex justify-center gap-1" @mouseleave="hovered = 0">
          <button
            v-for="n in 5"
            :key="n"
            type="button"
            class="px-1 text-4xl transition-transform hover:scale-110"
            :class="n <= (hovered || rating) ? 'text-amber-400' : 'text-slate-200'"
            :aria-label="$t('review.starAria', { n })"
            @mouseenter="hovered = n"
            @click="pick(n)"
          >
            ★
          </button>
        </div>

        <!-- Note < 5 : retour privé au chauffeur -->
        <form v-if="rating >= 1 && rating <= 4" class="mt-5 space-y-3 text-left" @submit.prevent="submit">
          <div>
            <label class="label" for="review-comment">{{ $t('review.formTitle') }}</label>
            <textarea
              id="review-comment"
              v-model="comment"
              class="field min-h-28"
              maxlength="2000"
              :placeholder="$t('review.commentPlaceholder')"
            />
          </div>
          <div>
            <label class="label" for="review-name">{{ $t('review.nameLabel') }}</label>
            <input id="review-name" v-model="customerName" type="text" class="field" maxlength="120" />
          </div>
          <p class="text-xs text-slate-500">
            {{ $t('review.formHint', { name: driver.displayName }) }}
          </p>
          <p v-if="errorMsg" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ errorMsg }}</p>
          <button type="submit" class="btn-primary w-full" :disabled="sending || comment.trim().length < 3">
            {{ sending ? $t('review.sending') : $t('review.submit') }}
          </button>
        </form>
      </template>
    </div>

    <p class="mt-5 text-center text-xs text-slate-400">Ridewiz</p>
  </div>
</template>
