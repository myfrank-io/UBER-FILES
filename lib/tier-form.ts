// Saisie des grilles dégressives au km (côté dashboard) : conversion des
// lignes de formulaire (chaînes brutes des inputs) vers les paliers envoyés à
// l'API. La validation métier fait foi côté serveur (server/utils/rate-tiers.ts) ;
// ici on ne fait qu'empêcher d'envoyer une grille incomplète ou incohérente.

import type { TransferRateTierInput } from './pricing'

/** Ligne de saisie d'un palier. `uptoKm` reste vide sur la dernière (« Au-delà »). */
export interface TierRowForm {
  uptoKm: string
  priceEuros: string
}

/**
 * Parse et valide une grille saisie : au moins 2 lignes, prix > 0 partout,
 * seuils entiers strictement croissants, dernière ligne illimitée.
 * Renvoie null tant que la grille n'est pas complète et cohérente.
 */
export function parseTierRows(rows: TierRowForm[]): TransferRateTierInput[] | null {
  if (rows.length < 2) return null
  const out: TransferRateTierInput[] = []
  let prevUpto = 0
  for (const [i, row] of rows.entries()) {
    const isLast = i === rows.length - 1
    const price = parseFloat(String(row.priceEuros))
    if (!Number.isFinite(price) || price <= 0) return null
    let uptoKm: number | null = null
    if (!isLast) {
      const upto = Math.round(parseFloat(String(row.uptoKm)))
      if (!Number.isFinite(upto) || upto <= prevUpto) return null
      uptoKm = upto
      prevUpto = upto
    }
    out.push({ uptoKm, pricePerKmCents: Math.round(price * 100) })
  }
  return out
}
