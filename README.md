# Plateforme de réservation VTC en clientèle privée

Plateforme **multi-tenant** permettant à chaque chauffeur VTC de développer sa clientèle
privée via une **page publique de réservation à son nom** (marque blanche). Le client
demande une course → reçoit un devis **validé par le chauffeur** → paie d'avance → le
créneau est **bloqué dans le calendrier** du chauffeur.

## Stack technique

- **Nuxt 3** (full-stack, serveur Nitro) + **Vue 3** + **TypeScript strict**
- **PostgreSQL** + **Prisma** (multi-tenant row-level par `driverId`)
- **Tailwind CSS** + **@nuxtjs/i18n** (FR / EN, mobile-first)
- **Stripe** Connect Express + destination charges (encaissement centralisé, reversement chauffeur)
- **Google Maps Platform** (Places + Routes) — proxifié côté serveur, repli haversine/Nominatim sans clé
- **Resend** (emails transactionnels) · **Telegram Bot** (notifs + validation devis) · **API Sirene INSEE**
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
- **Devis validé par le chauffeur** (back-office ou Telegram) avant envoi du lien de paiement.
- **Paiement Stripe** intégral en amont → confirmation → blocage du créneau (course + approche).
- **Calendrier interne** + indisponibilités + détection de conflit avant validation.
- **Modification / annulation** client (liens signés) + remboursement selon politique paramétrable.
- **Notifications** : email client (devis, confirmation, rappel J-1, annulation) + Telegram chauffeur.
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
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` | Webhooks : `/api/webhooks/stripe` (checkout) et `/api/webhooks/stripe-connect` (account.updated) |
| Google Maps | `GOOGLE_MAPS_API_KEY` | Restreindre la clé (Places + Routes). Sans clé : repli haversine/Nominatim |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM` | Vérifier SPF/DKIM du domaine |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Webhook : `/api/webhooks/telegram` |
| INSEE | `INSEE_API_KEY` | Vérification SIREN à l'onboarding |

> Sans clés, l'application fonctionne en mode dégradé (emails/Telegram journalisés, itinéraires
> estimés) — idéal pour le développement et les démonstrations.
