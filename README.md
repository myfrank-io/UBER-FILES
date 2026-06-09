# UBER FILES

Squelette d'une web app moderne construite avec **Nuxt 3**, **TypeScript** et **Tailwind CSS**.

## 🚀 Stack technique

- **[Nuxt 3](https://nuxt.com/)** — Framework Vue 3 (avec `<script setup>`)
- **TypeScript** — Typage statique de bout en bout
- **[Tailwind CSS](https://tailwindcss.com/)** — via le module `@nuxtjs/tailwindcss`
- **npm** — Gestionnaire de paquets

## 📁 Structure du projet

```
UBER-FILES/
├── assets/
│   └── css/
│       └── main.css        # Directives Tailwind (@tailwind base/components/utilities)
├── components/
│   └── AppHeader.vue       # En-tête de navigation
├── composables/
│   └── useAppInfo.ts       # Composable d'exemple
├── layouts/
│   └── default.vue         # Layout par défaut (header + footer)
├── pages/
│   ├── index.vue           # Page d'accueil (hero)
│   └── about.vue           # Page « À propos »
├── app.vue                 # Point d'entrée
├── nuxt.config.ts          # Configuration Nuxt
├── tailwind.config.ts      # Configuration Tailwind
└── tsconfig.json           # Configuration TypeScript
```

## 🛠️ Installation et démarrage

### 1. Installer les dépendances

```bash
npm install
```

### 2. Lancer le serveur de développement

```bash
npm run dev
```

L'application est alors accessible sur **[http://localhost:3000](http://localhost:3000)**.

### 3. Construire pour la production

```bash
npm run build
```

Pour prévisualiser le build de production :

```bash
npm run preview
```

## 📄 Pages

- **/** — Page d'accueil avec une section hero (titre, sous-titre, bouton d'action).
- **/about** — Présentation du projet et de la stack technique.

La navigation entre les pages se fait via le header du layout par défaut.
