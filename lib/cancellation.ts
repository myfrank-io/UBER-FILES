// Calcul du remboursement à l'annulation selon la politique du chauffeur.
// Annulation gratuite jusqu'à `freeUntilHours` avant la course ; passé ce délai,
// `retainedPercent` % du montant sont retenus.

export interface CancellationPolicyInput {
  freeUntilHours: number
  retainedPercent: number
}

export interface CancellationOutcome {
  refundCents: number
  retainedCents: number
  isFree: boolean
}

export function computeRefund(
  amountCents: number,
  scheduledAt: Date,
  policy: CancellationPolicyInput,
  now: Date = new Date(),
): CancellationOutcome {
  const hoursBefore = (scheduledAt.getTime() - now.getTime()) / 3_600_000
  if (hoursBefore >= policy.freeUntilHours) {
    return { refundCents: amountCents, retainedCents: 0, isFree: true }
  }
  const retainedCents = Math.round((amountCents * policy.retainedPercent) / 100)
  return { refundCents: amountCents - retainedCents, retainedCents, isFree: false }
}
