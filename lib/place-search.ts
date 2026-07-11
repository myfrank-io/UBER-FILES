// Aides PURES pour la recherche de la fiche Google d'un chauffeur (réglages
// avis). La partie réseau vit dans server/utils/google-maps.ts ; ici :
// préparation des requêtes et décodage des liens de partage Google Maps —
// logique testable sans réseau.

/**
 * Variantes de requête à essayer dans l'ordre. Les fiches Google s'appellent
 * souvent « Nom - Slogan Chauffeur VTC… » : le suffixe générique dilue le
 * matching de l'API au point de rater la fiche (cas réel : « KERKAR Drive -
 * Chauffeur VTC » introuvable, « KERKAR Drive » trouvable). On essaie donc la
 * saisie brute, puis le premier segment (avant tiret/pipe/point médian), puis
 * les libellés fournis en extra (raison sociale du chauffeur).
 */
export function placeQueryVariants(
  raw: string,
  extras: (string | null | undefined)[] = [],
): string[] {
  const out: string[] = []
  const push = (value: string | null | undefined) => {
    const q = value?.trim()
    if (!q || q.length < 3) return
    if (out.some((v) => v.toLowerCase() === q.toLowerCase())) return
    out.push(q)
  }
  push(raw)
  push(raw.split(/\s+[-–—|·]\s+/)[0])
  for (const extra of extras) push(extra)
  return out.slice(0, 3)
}

/** L'entrée ressemble-t-elle à une URL ? (le champ accepte aussi un lien Maps) */
export function isLikelyUrl(input: string): boolean {
  return /^https?:\/\/\S+$/i.test(input.trim())
}

// Hôtes de partage Google Maps acceptés — liste FERMÉE : cette URL est ensuite
// récupérée côté serveur, hors de question de suivre un lien arbitraire (SSRF).
const MAPS_HOSTS =
  /^(maps\.app\.goo\.gl|goo\.gl|g\.page|maps\.google\.[a-z]{2,3}(\.[a-z]{2})?|(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?)$/

/** URL de partage Maps sûre (https, hôte Google connu, pas de port) — sinon null. */
export function allowedMapsUrl(input: string): URL | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.port) return null
  if (!MAPS_HOSTS.test(url.hostname)) return null
  return url
}

export interface MapsPlaceHint {
  name: string | null
  lat: number | null
  lng: number | null
}

/**
 * Extrait le nom de la fiche et ses coordonnées d'une URL Google Maps résolue
 * (après redirections) : « /maps/place/<nom>/@lat,lng,…!3d<lat>!4d<lng>… ».
 * Les coordonnées !3d/!4d (position de la fiche) priment sur celles de la vue.
 */
export function parseMapsPlaceUrl(finalUrl: string): MapsPlaceHint {
  const nameMatch = finalUrl.match(/\/maps\/place\/([^/@?]+)/)
  let name: string | null = null
  if (nameMatch?.[1]) {
    const plusDecoded = nameMatch[1].replace(/\+/g, ' ')
    try {
      name = decodeURIComponent(plusDecoded).trim() || null
    } catch {
      name = plusDecoded.trim() || null
    }
  }
  const pin = finalUrl.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  const view = finalUrl.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  const coords = pin ?? view
  return {
    name,
    lat: coords ? parseFloat(coords[1]!) : null,
    lng: coords ? parseFloat(coords[2]!) : null,
  }
}
