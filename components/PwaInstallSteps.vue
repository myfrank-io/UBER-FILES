<template>
  <!-- Mode d'emploi iOS : Safari n'expose aucune API d'installation, il faut
       passer par le menu Partager. Partagé entre l'invitation de l'accueil
       (DashboardInstallPrompt) et la carte de Réglages (DashboardInstallCard). -->
  <ol class="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
    <li>
      Touchez les <strong>trois petits points ⋯</strong> en bas à droite de l'écran (Safari).
      Sur un iPhone plus ancien, le bouton Partager est déjà visible dans la barre du bas.
    </li>
    <li>
      Dans le menu, touchez <strong>Partager</strong>
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
      (le carré avec une flèche vers le haut).
    </li>
    <li>Choisissez <strong>« Sur l'écran d'accueil »</strong>, puis <strong>Ajouter</strong>.</li>
    <li>
      L'icône Ridewiz apparaît sur votre écran d'accueil. À la première ouverture,
      connectez-vous une fois : l'application garde ensuite votre session.
    </li>
  </ol>
</template>
