// Progression de configuration du compte chauffeur (onboarding guidé).
//
// Logique PURE et testée (aucune I/O) : prend un instantané de l'état du
// chauffeur et renvoie les étapes, leur statut, et le pourcentage d'avancement.
// La présentation (libellés, liens, icônes) vit dans le composant
// DashboardOnboarding.vue — ici on ne décide que du « fait / pas fait ».
import type { PaymentMethod } from './payment-methods'

export type OnboardingStepKey =
  | 'profil'
  | 'vehicule'
  | 'contact'
  | 'tarifs'
  | 'paiement'
  | 'encaissement'
  | 'telegram'

export interface OnboardingInput {
  hasPhoto: boolean
  // Présentation renseignée : accroche (tagline).
  hasIntro: boolean
  vehicleCount: number
  hasPhone: boolean
  // Au moins une grille tarifaire (transfert ou mise à disposition).
  hasRates: boolean
  paymentMethods: PaymentMethod[]
  // Un prestataire d'encaissement en ligne est opérationnel (SumUp ou Stripe).
  onlinePayoutReady: boolean
  telegramLinked: boolean
}

export interface OnboardingStep {
  key: OnboardingStepKey
  done: boolean
  // Étape facultative : n'entre pas dans le calcul du 100 %.
  optional: boolean
}

export interface OnboardingResult {
  steps: OnboardingStep[]
  requiredDone: number
  requiredTotal: number
  // 0–100, calculé sur les seules étapes obligatoires.
  percent: number
  // true quand toutes les étapes obligatoires sont faites.
  complete: boolean
}

export function computeOnboarding(input: OnboardingInput): OnboardingResult {
  // Le prépaiement en ligne exige un encaisseur connecté (SumUp/Stripe). Si le
  // chauffeur n'encaisse que sur place, l'étape est satisfaite dès qu'il a choisi
  // au moins un mode sur place — mais pas tant qu'aucun moyen n'est sélectionné.
  const requiresOnline = input.paymentMethods.includes('STRIPE_PREPAYMENT')
  const hasOnSiteOnly = input.paymentMethods.length > 0 && !requiresOnline
  const encaissementDone = requiresOnline ? input.onlinePayoutReady : hasOnSiteOnly

  const steps: OnboardingStep[] = [
    { key: 'profil', done: input.hasPhoto && input.hasIntro, optional: false },
    { key: 'vehicule', done: input.vehicleCount > 0, optional: false },
    { key: 'contact', done: input.hasPhone, optional: false },
    { key: 'tarifs', done: input.hasRates, optional: false },
    { key: 'paiement', done: input.paymentMethods.length > 0, optional: false },
    { key: 'encaissement', done: encaissementDone, optional: false },
    { key: 'telegram', done: input.telegramLinked, optional: true },
  ]

  const required = steps.filter((s) => !s.optional)
  const requiredDone = required.filter((s) => s.done).length
  const requiredTotal = required.length
  const percent = requiredTotal === 0 ? 100 : Math.round((requiredDone / requiredTotal) * 100)

  return { steps, requiredDone, requiredTotal, percent, complete: requiredDone === requiredTotal }
}
