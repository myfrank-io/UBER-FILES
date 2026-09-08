<template>
  <!-- Mode d'emploi iOS : Safari n'expose aucune API d'installation, il faut
       passer par le menu Partager. Sur les versions récentes d'iOS, ce menu
       n'est plus dans la barre du bas : il est derrière le bouton « ••• ».
       Partagé entre l'invitation de l'accueil (DashboardInstallPrompt) et la
       carte de Réglages (DashboardInstallCard). -->
  <ol class="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
    <li>
      En bas à droite de Safari, touchez le bouton
      <strong class="mx-0.5 rounded-full border border-slate-300 px-2 py-0.5 tracking-widest text-slate-700">•••</strong>
      (trois points).
    </li>
    <li>
      Dans le menu qui s'ouvre, choisissez <strong>Partager</strong>
      <svg
        class="inline h-4 w-4 align-text-bottom text-slate-700"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M9 8H6v12h12V8h-3" />
        <path d="M12 15V3M8.5 6.5 12 3l3.5 3.5" />
      </svg>
      — si votre barre du bas affiche déjà cette icône, touchez-la directement.
    </li>
    <li>Faites défiler la liste, puis choisissez <strong>« Sur l'écran d'accueil »</strong>.</li>
    <li>Touchez <strong>Ajouter</strong>, en haut à droite.</li>
    <li>
      L'icône Ridewiz apparaît sur votre écran d'accueil. À la première ouverture,
      connectez-vous une fois : l'application garde ensuite votre session.
    </li>
  </ol>
</template>
