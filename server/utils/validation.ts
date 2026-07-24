import { z } from 'zod'
import { PAYMENT_METHODS } from '~/lib/payment-methods'
import { AIRPORT_HUB_IDS, AIRPORT_ZONES } from '~/lib/airport'

// Schémas de validation partagés (toutes les entrées API passent par Zod).

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

// Transfert aéroport (onglet dédié) : aéroport, sens et zone choisis par le
// client. Complète un type TRANSFER classique — le prix devient le forfait de la
// zone (ou le prix au km hors Paris) au lieu de la grille kilométrique.
export const airportSelectionSchema = z.object({
  hub: z.enum(AIRPORT_HUB_IDS),
  direction: z.enum(['FROM_AIRPORT', 'TO_AIRPORT']),
  zone: z.enum(AIRPORT_ZONES),
})

export const estimateSchema = z
  .object({
    type: z.enum(['TRANSFER', 'HOURLY']),
    scheduledAt: z.string().datetime({ offset: true }),
    // Transfert
    pickup: latLngSchema.optional(),
    dropoff: latLngSchema.optional(),
    pickupAddress: z.string().min(1).max(300).optional(),
    dropoffAddress: z.string().min(1).max(300).optional(),
    // Terminal/hall de prise en charge (aéroport/gare) choisi par le client —
    // code du catalogue lib/hubs.ts. N° de vol : prep Niveau 3.
    pickupTerminal: z.string().max(40).optional(),
    flightNumber: z.string().max(16).optional(),
    roundTrip: z.boolean().default(false),
    airport: airportSelectionSchema.optional(),
    // Nombre de personnes dans le véhicule (supplément 3e/4e personne). Borné à 8
    // (van) ; le supplément n'est défini que pour la 3e et la 4e.
    passengers: z.number().int().min(1).max(8).optional(),
    // Mise à disposition
    durationHours: z.number().int().min(1).max(24).optional(),
  })
  .refine(
    (d) => d.type !== 'TRANSFER' || (d.pickup && d.dropoff),
    { message: 'Adresses de départ et arrivée requises pour un transfert.', path: ['pickup'] },
  )
  .refine((d) => d.type !== 'HOURLY' || d.durationHours, {
    message: 'Durée requise pour une mise à disposition.',
    path: ['durationHours'],
  })
  .refine((d) => d.type !== 'HOURLY' || (d.pickup && d.pickupAddress), {
    message: 'Adresse de départ requise pour une mise à disposition.',
    path: ['pickup'],
  })
  .refine((d) => !d.airport || d.type === 'TRANSFER', {
    message: 'Un transfert aéroport est un trajet simple (type TRANSFER).',
    path: ['airport'],
  })
  .refine((d) => !d.airport || !d.roundTrip, {
    message: "Pas d'aller-retour sur un transfert aéroport : réservez deux trajets.",
    path: ['roundTrip'],
  })

export const customerSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(6).max(30),
  email: z.string().email().max(160),
})

export const rideRequestSchema = estimateSchema.and(
  z.object({
    customer: customerSchema,
    notes: z.string().max(2000).optional(),
    // Moyen de règlement choisi par le client sur le formulaire (optionnel : les
    // anciens formulaires en cache n'envoient rien). Vérifié ensuite contre les
    // moyens réellement proposés par le chauffeur.
    paymentMethod: z.enum(PAYMENT_METHODS as [string, ...string[]]).optional(),
    cgvAccepted: z.literal(true, {
      errorMap: () => ({ message: 'Vous devez accepter les conditions générales de vente.' }),
    }),
  }),
)

export const autocompleteSchema = z.object({
  input: z.string().min(1).max(200),
})

export type EstimateInput = z.infer<typeof estimateSchema>
export type RideRequestInput = z.infer<typeof rideRequestSchema>
