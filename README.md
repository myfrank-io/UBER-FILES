# Plateforme de réservation VTC en clientèle privée

Plateforme **multi-tenant** permettant à chaque chauffeur VTC de développer sa clientèle
privée via une **page publique de réservation à son nom** (marque blanche). Le client
demande une course → reçoit un devis **validé par le chauffeur** → paie d'avance → le
créneau est **bloqué dans le calendrier** du chauffeur.

## Stack technique

- **Nuxt 3** (full-stack, serveur Nitro) + **Vue 3** + **TypeScript strict**
- **PostgreSQL** + **Prisma** (multi-tenant row-level par `driverId`)
- **Tailwind CSS** + **@nuxtjs/i18n** (FR / EN, mobile-first)
- **SumUp** (chauffeur merchant of record — connexion OAuth ou clé API, encaissement direct)
- **Stripe** Connect Express + destination charges (alternative historique, encaissement centralisé)
- **Google Maps Platform** (Places + Routes) — proxifié côté serveur, repli haversine + Base Adresse Nationale (data.gouv.fr) sans clé
- **Resend** (emails transactionnels — canal de notification principal) · **Telegram Bot**
  (optionnel, coupé par défaut) · **API Sirene INSEE**
- Tests : **Vitest** (logique métier) + **Playwright** (E2E)

## Démarrage rapide

### 1. Prérequis

- Node.js 20+ et npm
- PostgreSQL (via Docker `docker compose up -d`, ou une instance locale)

### 2. Installation

```bash
npm install
cp .env.example .env        # puis renseignez vos valeurs
```

Générez des secrets forts :

```bash
openssl rand -base64 32     # pour NUXT_SESSION_PASSWORD et LINK_TOKEN_SECRET
```

### 3. Base de données

```bash
docker compose up -d        # démarre PostgreSQL (port 5432)
npm run db:migrate          # applique les migrations
npm run db:seed             # crée un admin + un chauffeur de démo
```

### 4. Lancement

```bash
npm run dev                 # http://localhost:3000
```

### Comptes de démonstration

| Rôle      | Identifiants                       | Accès                    |
|-----------|------------------------------------|--------------------------|
| Admin     | `admin@chams.fr` / `password123`   | `/admin`                 |
| Chauffeur | `karim@example.com` / `password123`| `/dashboard`             |
| Public    | —                                  | `/karim-paris`           |

## Périmètre fonctionnel (V1)

- **Page publique chauffeur** (`/{slug}`) : présentation, formulaire de demande, devis instantané.
- **Deux prestations** : transfert A→B (€/km à taux variable jour/nuit/pointe, option A/R) et
  mise à disposition (tarif horaire dégressif).
- **Devis validé par le chauffeur** (back-office ou Telegram) avant envoi du lien de paiement,
  ou **paiement immédiat à la réservation** si le chauffeur l'active dans ses réglages
  (repli automatique en validation manuelle si conflit d'agenda ou paiement en ligne indisponible).
- **Moyens de paiement paramétrables par le chauffeur** : prépaiement en ligne (Stripe) et/ou
  encaissement sur place le jour de la course (carte, espèces, chèque). Le chauffeur choisit
  librement ceux qu'il accepte dans ses réglages — il n'est pas obligé de passer par Stripe.
- **Paiement** → confirmation → blocage du créneau (course + approche). En ligne : confirmé au
  paiement Stripe ; sur place : confirmé à la réservation, encaissement marqué reçu par le chauffeur.
- **Calendrier interne** + indisponibilités + détection de conflit avant validation.
- **Modification / annulation** client (liens signés) + remboursement selon politique paramétrable.
- **Notifications** : email pour tous — client (devis, confirmation, rappel J-1, annulation)
  et chauffeur (nouvelle demande, course confirmée, annulation). Chaque chauffeur peut en plus
  **lier Telegram** depuis ses réglages pour recevoir ses notifications et valider/refuser ses
  courses en un tap ; l'email reste envoyé dans tous les cas.
- **Back-office chauffeur** : grilles, demandes, courses, calendrier, base clients (export CSV).
- **Back-office admin** : onboarding/suspension chauffeurs, dashboard, facturation des forfaits.

### Hors périmètre V1 (prévu V1.5/V2)

- Synchronisation Google Calendar (le modèle de données la prévoit : `source`, `externalEventId`).
- Statuts jour J (en route / arrivé) + suivi GPS.
- Comptes clients self-service.

## Architecture

```
lib/                    # logique métier PURE et testée (aucune I/O)
  pricing/              # moteur de tarification (transfert + mise à dispo)
  cancellation.ts       # calcul des remboursements
  money.ts              # utilitaires monétaires (tout en centimes entiers)
server/
  api/
    public/             # endpoints sans authentification (réservation client)
    quote/ booking/     # actions client via jetons signés (JWS)
    dashboard/          # back-office chauffeur (auth requise, isolation tenant)
    admin/              # back-office Chams (rôle ADMIN)
    webhooks/           # Stripe (paiement + connect), Telegram
    cron/               # rappels J-1
  utils/                # Prisma, Stripe, Google Maps, email, Telegram, auth, INSEE
pages/                  # UI : page publique, devis, réservation, dashboard, admin
prisma/schema.prisma    # modèle de données multi-tenant
```

## Décisions produit actées

- **Encaissement centralisé** (Stripe destination charges) — aucun statut ACPR requis, KYC par Stripe.
- **Commission = 0 au lancement** mais `application_fee_amount` implémenté et paramétrable (`commissionBps`).
- **Calendrier interne en V1** (sync Google reportée pour éviter la validation OAuth sur le chemin critique).
- **Service daté hors rétractation 14j** (art. L221-28 C. conso) — mentionné dans les CGV à la réservation.

## Commandes utiles

```bash
npm run test           # tests unitaires (Vitest)
npm run test:e2e       # tests E2E (Playwright — nécessite `npx playwright install chromium`)
npm run db:studio      # explorer la base (Prisma Studio)
npm run lint           # ESLint
npm run typecheck      # vérification des types Nuxt
```

### Rappels J-1

Déclenchés via un cron externe appelant l'endpoint protégé :

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://votre-domaine/api/cron/reminders
```

## Configuration des intégrations (production)

| Intégration | Variable(s) | Notes |
|---|---|---|
| SumUp | `SUMUP_CLIENT_ID`, `SUMUP_CLIENT_SECRET`, `SUMUP_REDIRECT_URI`, `SUMUP_TOKEN_ENCRYPTION_KEY`, `SUMUP_OAUTH_ENABLED` | Connexion chauffeur par OAuth (nécessite le scope `payments`, accordé par le support SumUp — mettre `SUMUP_OAUTH_ENABLED=1`) ou par clé API collée dans ses réglages. Webhook : `/api/webhooks/sumup` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` | Webhooks : `/api/webhooks/stripe` (checkout) et `/api/webhooks/stripe-connect` (account.updated) |
| Google Maps | `GOOGLE_MAPS_API_KEY` | Restreindre la clé (Places + Routes). Sans clé : repli haversine + Base Adresse Nationale (data.gouv.fr) |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM` | Vérifier SPF/DKIM du domaine |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME` | Webhook : `/api/webhooks/telegram`. Chaque chauffeur lie son compte depuis ses réglages (opt-in) |
| INSEE | `INSEE_API_KEY` | Vérification SIREN à l'onboarding |

> Sans clés, l'application fonctionne en mode dégradé (emails/Telegram journalisés, itinéraires
> estimés) — idéal pour le développement et les démonstrations.
