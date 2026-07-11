// Seed de démonstration : un admin Chams + un chauffeur complet avec grilles, dispos
// et un client. Mot de passe de démo : "password123" (à ne jamais utiliser en prod).
import { PrismaClient } from '@prisma/client'
import { scryptSync, randomBytes } from 'node:crypto'

const prisma = new PrismaClient()

/** Hash de mot de passe scrypt (format "salt:hash"), cohérent avec server/utils/password.ts. */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  // Les comptes de DÉMONSTRATION (mot de passe "password123") ne sont créés QUE
  // hors production, ou explicitement via SEED_DEMO=1. En prod, un `db:seed` ne
  // crée jamais de compte à mot de passe faible.
  const seedDemo = process.env.SEED_DEMO === '1' || process.env.NODE_ENV !== 'production'

  // Admin Uber Files (arrive directement sur l'admin center après connexion).
  // Le mot de passe N'EST PLUS EN DUR : il provient de ADMIN_SEED_PASSWORD.
  // À la (re)création uniquement — un seed ne réécrase jamais un mot de passe
  // existant, pour ne pas annuler un changement fait depuis l'app.
  const adminEmail = 'uber.files75@gmail.com'
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (!existingAdmin) {
    // Sans variable fournie, on génère un mot de passe aléatoire fort et on le
    // journalise une seule fois (à changer ensuite) plutôt qu'un défaut connu.
    const seedPassword = process.env.ADMIN_SEED_PASSWORD || randomBytes(15).toString('base64url')
    await prisma.user.create({
      data: { email: adminEmail, passwordHash: hashPassword(seedPassword), role: 'ADMIN', emailVerified: true },
    })
    if (!process.env.ADMIN_SEED_PASSWORD) {
      console.warn(`⚠️  Admin ${adminEmail} créé avec un mot de passe ALÉATOIRE : ${seedPassword}\n   → connectez-vous et changez-le immédiatement.`)
    }
  } else {
    // Compte déjà présent : on garantit le rôle/vérif sans toucher au mot de passe.
    await prisma.user.update({
      where: { email: adminEmail },
      data: { role: 'ADMIN', emailVerified: true },
    })
  }

  // ─── Données de démonstration (hors production uniquement) ────────────────
  if (!seedDemo) {
    console.log('✅ Seed terminé (admin uniquement — démo désactivée en production).')
    return
  }

  const demoPasswordHash = hashPassword('password123')

  // Admin de démo Chams
  await prisma.user.upsert({
    where: { email: 'admin@chams.fr' },
    update: {},
    create: { email: 'admin@chams.fr', passwordHash: demoPasswordHash, role: 'ADMIN', emailVerified: true },
  })

  // Chauffeur de démo
  const driver = await prisma.driver.upsert({
    where: { slug: 'karim-paris' },
    update: {},
    create: {
      slug: 'karim-paris',
      status: 'ACTIVE',
      displayName: 'Karim — Chauffeur VTC Paris',
      tagline: 'Transferts aéroport & mise à disposition, 7j/7',
      bio: 'Chauffeur VTC depuis 8 ans, véhicule premium, eau et chargeurs à bord.',
      vehicleMake: 'Mercedes',
      vehicleModel: 'Classe E',
      vehicleClass: 'Berline premium',
      vehicleSeats: 4,
      services: 'Transferts aéroport (CDG, Orly, Beauvais), gares, mise à disposition.',
      serviceArea: 'Paris et Île-de-France',
      phone: '+33600000000',
      contactEmail: 'karim@example.com',
      siren: '900123456',
      sirenVerified: true,
      companyName: 'KARIM TRANSPORT',
      currency: 'eur',
      minimumFareCents: 2500,
      minLeadTimeMinutes: 120,
      quoteExpiryHours: 24,
      approachBufferMinutes: 30,
      commissionBps: 0,
      timezone: 'Europe/Paris',
      locale: 'fr',
      // Démo : accepte le prépaiement en ligne ET l'encaissement sur place (carte/espèces).
      paymentMethods: ['STRIPE_PREPAYMENT', 'ONSITE_CARD', 'ONSITE_CASH'],
      // Démo : chauffeur sur Stripe simulé pour que `canAcceptBookings` soit vrai
      // sans vrai compte de paiement en local. En prod, le défaut est SumUp.
      paymentProvider: 'STRIPE',
      stripeAccountId: 'acct_test_karim_demo',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeOnboarded: true,
    },
  })

  // Compte de connexion du chauffeur
  await prisma.user.upsert({
    where: { email: 'karim@example.com' },
    update: {},
    create: {
      email: 'karim@example.com',
      passwordHash: demoPasswordHash,
      role: 'DRIVER',
      driverId: driver.id,
      emailVerified: true,
    },
  })

  // Véhicules de démo (flotte multi-véhicules)
  await prisma.vehicle.deleteMany({ where: { driverId: driver.id } })
  await prisma.vehicle.createMany({
    data: [
      {
        driverId: driver.id,
        make: 'mercedes-benz',
        modelFamily: 'e-class',
        modelLabel: 'Mercedes Classe E',
        vehicleClass: 'Berline',
        seats: 4,
        color: 'Noir',
        isPrimary: true,
        position: 0,
      },
      {
        driverId: driver.id,
        make: 'mercedes-benz',
        modelFamily: 'v-class',
        modelLabel: 'Mercedes Classe V',
        vehicleClass: 'Van',
        seats: 7,
        color: 'Noir',
        isPrimary: false,
        position: 1,
      },
    ],
  })

  // Grilles transfert (jour / nuit / heures de pointe)
  await prisma.transferRateBand.deleteMany({ where: { driverId: driver.id } })
  await prisma.transferRateBand.createMany({
    data: [
      {
        driverId: driver.id,
        name: 'Jour',
        pricePerKmCents: 210,
        daysOfWeek: [],
        startMinute: 6 * 60,
        endMinute: 22 * 60,
        priority: 1,
        isDefault: true,
      },
      {
        driverId: driver.id,
        name: 'Nuit',
        pricePerKmCents: 300,
        daysOfWeek: [],
        startMinute: 22 * 60,
        endMinute: 22 * 60 + 8 * 60, // → 06h
        priority: 2,
        isDefault: false,
      },
      {
        driverId: driver.id,
        name: 'Heures de pointe',
        pricePerKmCents: 270,
        daysOfWeek: [1, 2, 3, 4, 5],
        startMinute: 7 * 60,
        endMinute: 10 * 60,
        priority: 5,
        isDefault: false,
      },
    ],
  })

  // Mise à disposition : les 8 premières heures à 60 €/h, puis 50 €/h
  await prisma.driver.update({
    where: { id: driver.id },
    data: {
      hourlyRateCents: 6000,
      hourlyOvertimeAfterHours: 8,
      hourlyOvertimeRateCents: 5000,
    },
  })

  // Politique d'annulation
  await prisma.cancellationPolicy.upsert({
    where: { driverId: driver.id },
    update: {},
    create: { driverId: driver.id, freeUntilHours: 24, retainedPercent: 50 },
  })

  // Forfait mensuel
  await prisma.subscription.upsert({
    where: { driverId: driver.id },
    update: {},
    create: { driverId: driver.id, planName: 'Standard', monthlyFeeCents: 4900, status: 'ACTIVE' },
  })

  // Un client existant
  await prisma.customer.upsert({
    where: { driverId_email: { driverId: driver.id, email: 'client@example.com' } },
    update: {},
    create: {
      driverId: driver.id,
      name: 'Sophie Martin',
      phone: '+33611111111',
      email: 'client@example.com',
    },
  })

  console.log('✅ Seed terminé (avec données de démonstration).')
  console.log('   Démo admin    : admin@chams.fr / password123')
  console.log('   Démo chauffeur: karim@example.com / password123')
  console.log('   Page publique : /karim-paris')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
