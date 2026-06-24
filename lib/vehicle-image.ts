// Construction de l'URL d'image d'un véhicule via le CDN imagin.studio.
// Tous les rendus partagent le MÊME angle et le MÊME type de fond afin de garantir
// une cohérence visuelle (même style de photo) sur toute la page publique.
//
// La clé client (`customer`) est configurable par variable d'environnement
// (IMAGIN_CUSTOMER) : on part d'une clé démo gratuite, et il suffit de la remplacer
// pour passer sur un compte payant, sans changer le code.
//
// Si le CDN ne renvoie pas d'image (modèle inconnu, panne, throttle), l'appelant
// se rabat sur une illustration locale par catégorie (cf. vehicleClassFallback).

export const IMAGIN_DEFAULT_CUSTOMER = 'hrjavascript-mastery'

const IMAGIN_BASE = 'https://cdn.imagin.studio/getimage'
// Angle 3/4 avant — fixe pour tous les véhicules (cohérence du cadrage).
const DEFAULT_ANGLE = '23'

export interface VehicleImageParams {
  make: string
  modelFamily: string
  color?: string | null
  customer?: string | null
  angle?: string
  width?: number
}

/** URL imagin.studio d'un modèle, avec cadrage/fond cohérents. */
export function buildVehicleImageUrl(p: VehicleImageParams): string {
  const params = new URLSearchParams({
    customer: p.customer || IMAGIN_DEFAULT_CUSTOMER,
    make: p.make,
    modelFamily: p.modelFamily,
    angle: p.angle || DEFAULT_ANGLE,
    zoomType: 'fullscreen',
    fileType: 'png',
  })
  if (p.color) params.set('paintDescription', p.color)
  if (p.width) params.set('width', String(p.width))
  return `${IMAGIN_BASE}?${params.toString()}`
}

/** Illustration locale de repli, choisie selon la catégorie du véhicule. */
export function vehicleClassFallback(vehicleClass?: string | null): string {
  const c = (vehicleClass || '').toLowerCase()
  if (c.includes('van') || c.includes('monospace') || c.includes('navette') || c.includes('minibus')) {
    return '/vehicles/van.svg'
  }
  if (c.includes('suv') || c.includes('4x4')) return '/vehicles/suv.svg'
  return '/vehicles/berline.svg'
}
