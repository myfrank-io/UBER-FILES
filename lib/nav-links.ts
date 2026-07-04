// Liens de navigation « un tap » vers une adresse, pour les alertes chauffeur
// (Telegram + email). Coordonnées GPS quand on les a (plus fiable), sinon
// l'adresse en texte. Renvoie null si on n'a ni l'un ni l'autre.

interface NavTarget {
  address?: string | null
  lat?: number | null
  lng?: number | null
}

export function googleMapsNavUrl({ address, lat, lng }: NavTarget): string | null {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  }
  if (address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
  }
  return null
}

export function wazeNavUrl({ address, lat, lng }: NavTarget): string | null {
  if (lat != null && lng != null) {
    return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
  }
  if (address) {
    return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`
  }
  return null
}
