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
  const demoPasswordHash = hashPassword('password123')

  // Admin Chams
  await prisma.user.upsert({
    where: { email: 'admin@chams.fr' },
    update: {},
    create: { email: 'admin@chams.fr', passwordHash: demoPasswordHash, role: 'ADMIN' },
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
      // Stripe simulé pour les tests — permet d'afficher le formulaire et d'utiliser
      // le bouton "Payer (test)" via /api/dev/confirm-booking sans vrai compte Stripe.
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

  // Grille mise à disposition dégressive
  await prisma.hourlyRateTier.deleteMany({ where: { driverId: driver.id } })
  await prisma.hourlyRateTier.createMany({
    data: [
      { driverId: driver.id, minHours: 1, pricePerHourCents: 6000 },
      { driverId: driver.id, minHours: 4, pricePerHourCents: 5500 },
      { driverId: driver.id, minHours: 8, pricePerHourCents: 5000 },
    ],
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

  console.log('✅ Seed terminé.')
  console.log('   Admin   : admin@chams.fr / password123')
  console.log('   Chauffeur: karim@example.com / password123')
  console.log('   Page publique : /karim-paris')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
