<script setup lang="ts">
// Landing Ridewiz — 100 % orientée acquisition de chauffeurs VTC.
// Applique la charte graphique « Signature » : Nuit/Ardoise/Cuivre/Or/Crème,
// DM Serif Display (titres), DM Sans (interface), Space Grotesk (labels).
// Les styles sont scopés à cette page : le reste de l'app garde son habillage.
const appBase = useRuntimeConfig().public.appBaseUrl

useHead({
  title: 'Ridewiz — Votre clientèle, sans intermédiaire',
  meta: [
    {
      name: 'description',
      content:
        'Ridewiz donne aux chauffeurs VTC leur propre page de réservation : devis automatiques à vos tarifs, paiement direct, zéro commission sur vos courses.',
    },
    // Aperçu de partage (WhatsApp, iMessage, réseaux sociaux)
    { property: 'og:title', content: 'Ridewiz — Votre clientèle, sans intermédiaire' },
    {
      property: 'og:description',
      content:
        'Votre page de réservation à votre nom : devis automatiques à vos tarifs, paiement direct, zéro commission sur vos courses.',
    },
    { property: 'og:image', content: `${appBase}/og-default.jpg` },
    { property: 'og:url', content: appBase },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'Ridewiz' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: 'Ridewiz — Votre clientèle, sans intermédiaire' },
    {
      name: 'twitter:description',
      content:
        'Votre page de réservation à votre nom : devis automatiques, paiement direct, zéro commission.',
    },
    { name: 'twitter:image', content: `${appBase}/og-default.jpg` },
  ],
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Space+Grotesk:wght@500;600&display=swap',
    },
  ],
})

// Parcours chauffeur : de l'inscription aux courses encaissées.
const steps = [
  {
    title: 'Créez votre page',
    text: 'Inscription en 5 minutes : votre nom, votre véhicule, vos tarifs au km et à l’heure. Votre page est à votre adresse : ridewiz.fr/votre-nom.',
  },
  {
    title: 'Partagez votre lien',
    text: 'Carte de visite, WhatsApp, QR code sur l’appuie-tête : vos clients réservent directement chez vous, plus besoin de passer par les applis.',
  },
  {
    title: 'Validez vos devis',
    text: 'Le client fait sa demande, le prix est calculé selon vos grilles. Vous validez, ajustez ou refusez en un clic — ou laissez faire en automatique.',
  },
  {
    title: 'Encaissez, roulez',
    text: 'Paiement en ligne ou sur place, créneau bloqué dans votre agenda, rappels envoyés. Vous n’avez plus qu’à conduire.',
  },
]

const features = [
  {
    icon: 'route',
    title: 'Vos tarifs, vos règles',
    text: 'Grilles au km et à l’heure, tarifs de nuit, majorations, montant minimum : le devis se calcule tout seul, exactement comme vous l’auriez fait.',
  },
  {
    icon: 'card',
    title: 'L’argent va chez vous',
    text: 'Vos clients paient directement sur votre compte SumUp — en ligne à l’avance ou sur place (carte, espèces, chèque). Aucun intermédiaire sur vos encaissements.',
  },
  {
    icon: 'calendar',
    title: 'Agenda intelligent',
    text: 'Chaque course bloque son créneau, temps d’approche compris. Les conflits sont détectés avant que vous n’acceptiez. Waze se lance d’un clic.',
  },
  {
    icon: 'client',
    title: 'Votre fichier clients',
    text: 'Chaque réservation enrichit votre base : coordonnées, historique, total dépensé. Elle vous appartient — exportable à tout moment.',
  },
  {
    icon: 'bell',
    title: 'Relances automatiques',
    text: 'Devis envoyé, client relançable en un clic, rappel automatique la veille de la course. Moins de no-show, moins de temps au téléphone.',
  },
  {
    icon: 'gains',
    title: 'Vos gains, en clair',
    text: 'Encaissé, à encaisser, par semaine, mois ou année. Export CSV pour votre comptable. Vous savez toujours où vous en êtes.',
  },
]

const faq = [
  {
    q: 'Combien Ridewiz prélève sur mes courses ?',
    a: 'Zéro. Aucune commission sur vos courses : le prix que paie votre client est le prix que vous encaissez. Ridewiz fonctionne au forfait mensuel simple, sans engagement.',
  },
  {
    q: 'Comment mes clients paient-ils ?',
    a: 'Comme vous le décidez : paiement par carte en ligne à la réservation (via votre compte SumUp — l’argent arrive directement chez vous), ou sur place le jour de la course en carte, espèces ou chèque.',
  },
  {
    q: 'Dois-je fixer mes prix moi-même ?',
    a: 'Oui, et c’est le principe : vous définissez vos grilles (prix au km, à l’heure, tarifs de nuit, minimum de course). Le devis est ensuite calculé automatiquement pour chaque demande — et vous pouvez toujours l’ajuster avant l’envoi.',
  },
  {
    q: 'Que se passe-t-il après mon inscription ?',
    a: 'Vous personnalisez votre page (photo, véhicule, zone, tarifs) pendant que notre équipe vérifie votre profil. Une fois approuvé, votre page est en ligne et prête à recevoir des réservations.',
  },
  {
    q: 'Mes clients doivent-ils créer un compte ?',
    a: 'Non. Ils ouvrent votre lien, demandent leur course et reçoivent le devis par email. Aucune application à installer, aucun compte à créer : le moins de friction possible pour eux, le plus de réservations pour vous.',
  },
]
</script>

<template>
  <div class="rw min-h-screen">
    <!-- ═══════════ Header ═══════════ -->
    <header class="sticky top-0 z-40 border-b border-[#EFE7D8] bg-[#FBF7F0]/90 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <a href="#" class="flex items-center gap-2.5">
          <svg width="30" height="30" viewBox="0 -2 32 32" fill="none" aria-hidden="true">
            <circle cx="7" cy="24" r="3.1" fill="#B5793F" />
            <circle cx="25" cy="3.5" r="3.1" stroke="#B5793F" stroke-width="2.2" />
            <path d="M9.5 23.5h7.5a5 5 0 0 0 0-10h-4a5 5 0 0 1 0-10H20.8" stroke="#B5793F" stroke-width="2.2" stroke-linecap="round" />
          </svg>
          <span class="rw-serif text-2xl text-[#0E1B2C]">Ridewiz</span>
        </a>
        <nav class="hidden items-center gap-7 text-sm font-medium text-[#6C7889] md:flex">
          <a href="#fonctionnement" class="hover:text-[#16283D]">Fonctionnement</a>
          <a href="#avantages" class="hover:text-[#16283D]">Avantages</a>
          <a href="#tarif" class="hover:text-[#16283D]">Tarif</a>
          <a href="#faq" class="hover:text-[#16283D]">Questions</a>
        </nav>
        <div class="flex items-center gap-4">
          <NuxtLink
            to="/dashboard/login"
            class="hidden whitespace-nowrap text-sm font-semibold text-[#16283D] hover:text-[#B5793F] sm:block"
          >
            Se connecter
          </NuxtLink>
          <NuxtLink to="/inscription" class="rw-btn whitespace-nowrap !px-4 !py-2.5 sm:!px-[22px] sm:!py-[13px]">
            Devenir chauffeur
          </NuxtLink>
        </div>
      </div>
    </header>

    <!-- ═══════════ Hero (fond Nuit) ═══════════ -->
    <section class="relative overflow-hidden bg-[#0E1B2C] text-[#F6F1E9]">
      <!-- Cercles or décoratifs (charte) -->
      <div class="pointer-events-none absolute -top-32 right-[-120px] h-[440px] w-[440px] rounded-full border border-[#E0B579]/20" />
      <div class="pointer-events-none absolute -top-16 right-[-40px] h-[300px] w-[300px] rounded-full border border-[#E0B579]/15" />
      <div class="pointer-events-none absolute bottom-[-180px] left-[-140px] h-[380px] w-[380px] rounded-full border border-[#E0B579]/10" />

      <div class="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.15fr,1fr] lg:pb-24">
        <div>
          <p class="rw-label mb-5 text-[#E0B579]">Plateforme pour chauffeurs VTC</p>
          <h1 class="rw-serif text-4xl leading-[1.08] sm:text-5xl lg:text-[56px]">
            Votre clientèle,<br />
            <span class="text-[#E0B579]">sans intermédiaire.</span>
          </h1>
          <p class="mt-6 max-w-xl text-[17px] leading-relaxed text-[#C9D2DC]">
            Ridewiz vous donne une page de réservation à votre nom : vos clients demandent,
            le devis se calcule à vos tarifs, ils paient — et l’argent arrive
            <strong class="font-semibold text-[#F6F1E9]">directement chez vous</strong>.
            Sans commission sur vos courses.
          </p>

          <div class="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <NuxtLink to="/inscription" class="rw-btn !px-7 !py-4 !text-[15px]">
              Créer ma page chauffeur
            </NuxtLink>
            <NuxtLink
              to="/dashboard/login"
              class="inline-flex items-center justify-center rounded-xl border border-[#E0B579]/40 px-7 py-4 text-[15px] font-semibold text-[#E0B579] transition hover:bg-[#E0B579]/10"
            >
              J’ai déjà un compte
            </NuxtLink>
          </div>

          <div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#E0B579]/20 pt-5 text-[13px] text-[#C9D2DC] sm:mt-10 sm:gap-x-8 sm:gap-y-3 sm:pt-6 sm:text-sm">
            <span class="flex items-center gap-2">
              <span class="rw-serif text-base text-[#E0B579] sm:text-lg">0 %</span> de commission
            </span>
            <span class="flex items-center gap-2">
              <span class="rw-serif text-base text-[#E0B579] sm:text-lg">100 %</span> vos clients
            </span>
            <span class="flex items-center gap-2">
              <span class="rw-serif text-base text-[#E0B579] sm:text-lg">5 min</span> pour créer votre page
            </span>
          </div>
        </div>

        <!-- Mockup carte de course (composant charte) -->
        <div class="relative hidden lg:block" aria-hidden="true">
          <div class="rounded-[20px] border border-white/10 bg-[#FBF7F0] p-6 shadow-2xl shadow-black/40">
            <div class="mb-4 flex items-center justify-between">
              <span class="text-base font-bold text-[#16283D]">14:30 · Jeu. 4 juil.</span>
              <span class="inline-flex items-center gap-1.5 rounded-full bg-[#E4F1EA] px-3 py-1.5 text-[11px] font-semibold text-[#2E7D5B]">
                <span class="h-[5px] w-[5px] rounded-full bg-[#2E7D5B]" />Confirmé
              </span>
            </div>
            <div class="flex items-start gap-3">
              <div class="flex flex-col items-center pt-1">
                <span class="h-[9px] w-[9px] rounded-full bg-[#16283D]" />
                <span class="h-7 w-[1.5px] bg-[#D9CFBC]" />
                <span class="h-[9px] w-[9px] rounded-full border-2 border-[#B5793F]" />
              </div>
              <div class="flex-1 text-sm font-medium text-[#16283D]">
                <div>12 rue de Rivoli, Paris</div>
                <div class="mt-3">Aéroport CDG · Terminal 2E</div>
              </div>
            </div>
            <div class="mt-4 flex items-center justify-between border-t border-[#F1EADB] pt-4">
              <div class="flex items-center gap-2">
                <span class="rw-serif inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#0E1B2C] text-[11px] text-[#E0B579]">D</span>
                <span class="text-[13px] font-medium text-[#6C7889]">M. Dubois</span>
              </div>
              <span class="rw-serif text-2xl text-[#0E1B2C]">68 €</span>
            </div>
          </div>
          <!-- Badge paiement flottant (sous la carte, sans masquer son contenu) -->
          <div class="absolute -bottom-12 -left-5 flex items-center gap-2.5 rounded-2xl border border-[#EFE7D8] bg-white px-5 py-3.5 shadow-xl shadow-black/20">
            <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#E3EDF6] text-[#2F6FB0]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><path d="M16 15h2" /></svg>
            </span>
            <div>
              <div class="text-[13px] font-bold text-[#16283D]">Payé en ligne</div>
              <div class="text-[11px] text-[#6C7889]">Encaissé sur votre compte</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════ Bande de réassurance (desktop — redondante avec le hero sur mobile) ═══════════ -->
    <section class="hidden border-b border-[#EFE7D8] bg-[#F6F1E9] md:block">
      <div class="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-5 py-8 text-center sm:px-8 md:grid-cols-4">
        <div><div class="rw-serif text-lg text-[#0E1B2C]">Votre marque</div><div class="mt-1 text-[13px] text-[#6C7889]">Votre nom, votre photo, votre page</div></div>
        <div><div class="rw-serif text-lg text-[#0E1B2C]">Vos prix</div><div class="mt-1 text-[13px] text-[#6C7889]">Grilles km &amp; heure, tarifs de nuit</div></div>
        <div><div class="rw-serif text-lg text-[#0E1B2C]">Vos clients</div><div class="mt-1 text-[13px] text-[#6C7889]">Fichier client à vous, exportable</div></div>
        <div><div class="rw-serif text-lg text-[#0E1B2C]">Votre agenda</div><div class="mt-1 text-[13px] text-[#6C7889]">Créneaux bloqués, zéro doublon</div></div>
      </div>
    </section>

    <!-- ═══════════ Fonctionnement ═══════════ -->
    <section id="fonctionnement" class="mx-auto max-w-6xl scroll-mt-20 px-5 py-12 sm:px-8 sm:py-24">
      <div class="mb-8 flex items-baseline gap-4 sm:mb-12">
        <span class="rw-serif text-xl text-[#B5793F]">01</span>
        <h2 class="rw-label !text-[13px] text-[#16283D]">Comment ça marche</h2>
        <span class="h-px flex-1 bg-[#E4DCCC]" />
      </div>

      <div class="mb-8 max-w-2xl sm:mb-10">
        <p class="rw-serif text-2xl leading-tight text-[#0E1B2C] sm:text-4xl">
          De l’inscription à la course encaissée, <em class="text-[#B5793F]">en quatre temps</em>.
        </p>
      </div>

      <!-- Mobile : lignes compactes · desktop : cartes détaillées -->
      <div class="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
        <div
          v-for="(s, i) in steps"
          :key="s.title"
          class="flex items-center gap-4 rounded-2xl border border-[#EFE7D8] bg-white p-4 sm:block sm:rounded-[20px] sm:p-6"
        >
          <div class="rw-serif shrink-0 text-2xl text-[#E0B579] sm:mb-4 sm:text-3xl">{{ String(i + 1).padStart(2, '0') }}</div>
          <div>
            <h3 class="text-[15px] font-bold text-[#16283D] sm:text-[17px]">{{ s.title }}</h3>
            <p class="mt-2 hidden text-sm leading-relaxed text-[#6C7889] sm:block">{{ s.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════ Avantages ═══════════ -->
    <section id="avantages" class="scroll-mt-20 bg-white">
      <div class="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-24">
        <div class="mb-8 flex items-baseline gap-4 sm:mb-12">
          <span class="rw-serif text-xl text-[#B5793F]">02</span>
          <h2 class="rw-label !text-[13px] text-[#16283D]">Pensé pour les chauffeurs</h2>
          <span class="h-px flex-1 bg-[#E4DCCC]" />
        </div>

        <!-- Mobile : lignes icône + texte · desktop : cartes -->
        <div class="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          <div
            v-for="f in features"
            :key="f.title"
            class="flex items-start gap-4 rounded-2xl border border-[#EFE7D8] bg-[#FBF7F0] p-4 sm:block sm:rounded-[20px] sm:p-6"
          >
            <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#B5793F] ring-1 ring-[#EFE7D8] sm:mb-4 sm:h-11 sm:w-11">
              <!-- Icônes charte : trait 1.6, extrémités arrondies -->
              <svg v-if="f.icon === 'route'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5" /></svg>
              <svg v-else-if="f.icon === 'card'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><path d="M16 15h2" /></svg>
              <svg v-else-if="f.icon === 'calendar'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>
              <svg v-else-if="f.icon === 'client'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
              <svg v-else-if="f.icon === 'bell'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11a7 7 0 0 1 14 0v4.5l1.5 2.5H3.5L5 15.5z" /><path d="M9.5 18a2.5 2.5 0 0 0 5 0" /></svg>
              <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8l7-4 9 4-7 4z" /><path d="M4 8v8l7 4M20 8v8l-9 4" /></svg>
            </span>
            <div>
              <h3 class="text-[15px] font-bold text-[#16283D] sm:text-[16px]">{{ f.title }}</h3>
              <p class="mt-1 text-[13px] leading-snug text-[#6C7889] sm:mt-2 sm:text-sm sm:leading-relaxed">{{ f.text }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════ Tarif ═══════════ -->
    <section id="tarif" class="mx-auto max-w-6xl scroll-mt-20 px-5 py-12 sm:px-8 sm:py-24">
      <div class="mb-8 flex items-baseline gap-4 sm:mb-12">
        <span class="rw-serif text-xl text-[#B5793F]">03</span>
        <h2 class="rw-label !text-[13px] text-[#16283D]">Le tarif</h2>
        <span class="h-px flex-1 bg-[#E4DCCC]" />
      </div>

      <div class="overflow-hidden rounded-[24px] bg-[#0E1B2C] text-[#F6F1E9]">
        <div class="relative grid gap-7 p-6 sm:gap-10 sm:p-12 lg:grid-cols-[1.2fr,1fr] lg:items-center">
          <div class="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-[#E0B579]/20" />
          <div>
            <p class="rw-serif text-2xl leading-tight sm:text-4xl">
              Un forfait simple.<br />
              <span class="text-[#E0B579]">Zéro commission sur vos courses.</span>
            </p>
            <p class="mt-4 max-w-lg text-sm leading-relaxed text-[#C9D2DC] sm:mt-5 sm:text-[15px]">
              Pas de pourcentage prélevé, pas de surprise en fin de mois : le prix payé par
              votre client est le montant que vous encaissez. Ridewiz se rémunère par un
              forfait mensuel unique, sans engagement.
            </p>
            <ul class="mt-7 hidden space-y-3 text-[15px] text-[#C9D2DC] sm:block">
              <li class="flex items-center gap-3">
                <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#2E7D5B] text-[11px] font-bold text-white">✓</span>
                Page de réservation à votre nom, devis automatiques
              </li>
              <li class="flex items-center gap-3">
                <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#2E7D5B] text-[11px] font-bold text-white">✓</span>
                Paiement en ligne (SumUp) et sur place, agenda, fichier clients
              </li>
              <li class="flex items-center gap-3">
                <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#2E7D5B] text-[11px] font-bold text-white">✓</span>
                Emails automatiques : devis, confirmations, rappels J-1
              </li>
            </ul>
          </div>
          <div class="rounded-[20px] border border-[#E0B579]/25 bg-white/[.03] p-6 text-center sm:p-8">
            <p class="rw-label text-[#E0B579]">Vous gardez</p>
            <p class="rw-serif mt-2 text-5xl text-[#F6F1E9] sm:mt-3 sm:text-6xl">100 %</p>
            <p class="mt-2 text-sm text-[#C9D2DC]">du montant de vos courses</p>
            <NuxtLink to="/inscription" class="rw-btn mt-5 w-full !py-4 sm:mt-7">Commencer maintenant</NuxtLink>
            <p class="mt-3 text-xs text-[#96A6B8]">Sans engagement · Profil vérifié sous 48 h</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══════════ FAQ ═══════════ -->
    <section id="faq" class="bg-white">
      <div class="mx-auto max-w-3xl scroll-mt-20 px-5 py-12 sm:px-8 sm:py-24">
        <div class="mb-8 flex items-baseline gap-4 sm:mb-12">
          <span class="rw-serif text-xl text-[#B5793F]">04</span>
          <h2 class="rw-label !text-[13px] text-[#16283D]">Questions fréquentes</h2>
          <span class="h-px flex-1 bg-[#E4DCCC]" />
        </div>

        <div class="space-y-3">
          <!-- Le padding vit sur le <summary> : toute la carte est tappable pour déplier. -->
          <details
            v-for="item in faq"
            :key="item.q"
            class="group rounded-2xl border border-[#EFE7D8] bg-[#FBF7F0] open:bg-white"
          >
            <summary class="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[15px] font-semibold text-[#16283D] [&::-webkit-details-marker]:hidden">
              {{ item.q }}
              <span class="text-xl leading-none text-[#B5793F] transition-transform group-open:rotate-45">+</span>
            </summary>
            <p class="-mt-2 px-6 pb-5 text-sm leading-relaxed text-[#6C7889]">{{ item.a }}</p>
          </details>
        </div>
      </div>
    </section>

    <!-- ═══════════ CTA final (fond Nuit) ═══════════ -->
    <section class="relative overflow-hidden bg-[#0E1B2C] text-center text-[#F6F1E9]">
      <div class="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full border border-[#E0B579]/15" />
      <div class="pointer-events-none absolute -bottom-32 -right-20 h-96 w-96 rounded-full border border-[#E0B579]/15" />
      <div class="relative mx-auto max-w-3xl px-5 py-14 sm:py-28">
        <p class="rw-serif text-2xl italic leading-snug text-[#E0B579] sm:text-4xl">
          «&nbsp;Votre chauffeur, votre signature.&nbsp;»
        </p>
        <p class="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[#C9D2DC]">
          Rejoignez les chauffeurs qui reprennent la main sur leur clientèle.
          Votre page peut être en ligne cette semaine.
        </p>
        <NuxtLink to="/inscription" class="rw-btn mt-8 !px-8 !py-4 !text-[15px]">
          Créer ma page chauffeur
        </NuxtLink>
      </div>
    </section>

    <!-- ═══════════ Footer ═══════════ -->
    <footer class="border-t border-[#E0B579]/15 bg-[#0E1B2C]">
      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-8">
        <div class="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 -2 32 32" fill="none" aria-hidden="true">
            <circle cx="7" cy="24" r="3.1" fill="#E0B579" />
            <circle cx="25" cy="3.5" r="3.1" stroke="#E0B579" stroke-width="2.2" />
            <path d="M9.5 23.5h7.5a5 5 0 0 0 0-10h-4a5 5 0 0 1 0-10H20.8" stroke="#E0B579" stroke-width="2.2" stroke-linecap="round" />
          </svg>
          <span class="rw-serif text-lg text-[#F6F1E9]">Ridewiz</span>
        </div>
        <div class="flex items-center gap-6 text-sm text-[#96A6B8]">
          <NuxtLink to="/inscription" class="inline-flex items-center py-2.5 hover:text-[#E0B579]">Devenir chauffeur</NuxtLink>
          <NuxtLink to="/dashboard/login" class="inline-flex items-center py-2.5 hover:text-[#E0B579]">Espace chauffeur</NuxtLink>
        </div>
        <p class="text-xs text-[#96A6B8]">© 2026 Ridewiz — La réservation en marque blanche</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Charte Ridewiz « Signature » — styles scopés à la landing. */
.rw {
  background: #fbf7f0;
  color: #16283d;
  font-family: 'DM Sans', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.rw-serif {
  font-family: 'DM Serif Display', serif;
  font-weight: 500;
  letter-spacing: -0.02em;
}
.rw-label {
  font-family: 'Space Grotesk', 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.rw-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 13px 22px;
  border-radius: 12px;
  background: #b5793f;
  color: #fff;
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.rw-btn:hover {
  background: #9c6431;
  box-shadow: 0 6px 16px -6px rgba(181, 121, 63, 0.6);
}
</style>
