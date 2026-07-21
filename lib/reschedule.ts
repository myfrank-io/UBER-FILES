// Décision « le report d'horaire d'une course nécessite-t-il l'accord du
// chauffeur ? ». Logique PURE (aucune I/O), partagée par l'endpoint client.
//
// Règle : un report demandé alors que la course est proche (moins de
// `freeUntilHours` avant le départ) doit être validé par le chauffeur. On
// regarde À LA FOIS l'horaire actuel et le nouvel horaire — déplacer une course
// lointaine vers un créneau imminent doit aussi passer par validation.

export function leadTimeHours(scheduledAt: Date, now: Date): number {
  return (scheduledAt.getTime() - now.getTime()) / 3_600_000
}

export function requiresDriverApproval(
  currentScheduledAt: Date,
  newScheduledAt: Date,
  now: Date,
  freeUntilHours: number,
): boolean {
  const soonest = Math.min(
    leadTimeHours(currentScheduledAt, now),
    leadTimeHours(newScheduledAt, now),
  )
  return soonest < freeUntilHours
}
