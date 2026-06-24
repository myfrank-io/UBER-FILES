// Catalogue de modèles de véhicules couvrant l'essentiel de la flotte VTC française.
// `make` / `modelFamily` sont les identifiants attendus par le CDN d'images
// (imagin.studio) pour rendre une photo cohérente du modèle. `label` est le libellé
// affiché au chauffeur et au client. Le catalogue est partagé client + serveur :
// la recherche dans l'espace chauffeur se fait côté client sur cette liste.

export interface VehicleCatalogEntry {
  make: string // marque normalisée pour le CDN (ex: "mercedes-benz")
  modelFamily: string // famille de modèle pour le CDN (ex: "v-class")
  label: string // libellé affiché (ex: "Mercedes Classe V")
  vehicleClass: 'Berline' | 'Premium' | 'Van' | 'SUV'
  seats: number
}

export const VEHICLE_CATALOG: VehicleCatalogEntry[] = [
  // ── Mercedes-Benz ──
  { make: 'mercedes-benz', modelFamily: 'c-class', label: 'Mercedes Classe C', vehicleClass: 'Berline', seats: 4 },
  { make: 'mercedes-benz', modelFamily: 'e-class', label: 'Mercedes Classe E', vehicleClass: 'Berline', seats: 4 },
  { make: 'mercedes-benz', modelFamily: 's-class', label: 'Mercedes Classe S', vehicleClass: 'Premium', seats: 4 },
  { make: 'mercedes-benz', modelFamily: 'v-class', label: 'Mercedes Classe V', vehicleClass: 'Van', seats: 7 },
  { make: 'mercedes-benz', modelFamily: 'vito', label: 'Mercedes Vito', vehicleClass: 'Van', seats: 8 },
  { make: 'mercedes-benz', modelFamily: 'gle', label: 'Mercedes GLE', vehicleClass: 'SUV', seats: 5 },
  { make: 'mercedes-benz', modelFamily: 'eqs', label: 'Mercedes EQS', vehicleClass: 'Premium', seats: 4 },
  { make: 'mercedes-benz', modelFamily: 'eqe', label: 'Mercedes EQE', vehicleClass: 'Berline', seats: 4 },
  { make: 'mercedes-benz', modelFamily: 'eqv', label: 'Mercedes EQV', vehicleClass: 'Van', seats: 7 },

  // ── BMW ──
  { make: 'bmw', modelFamily: '3-series', label: 'BMW Série 3', vehicleClass: 'Berline', seats: 4 },
  { make: 'bmw', modelFamily: '5-series', label: 'BMW Série 5', vehicleClass: 'Berline', seats: 4 },
  { make: 'bmw', modelFamily: '7-series', label: 'BMW Série 7', vehicleClass: 'Premium', seats: 4 },
  { make: 'bmw', modelFamily: 'i5', label: 'BMW i5', vehicleClass: 'Berline', seats: 4 },
  { make: 'bmw', modelFamily: 'i7', label: 'BMW i7', vehicleClass: 'Premium', seats: 4 },
  { make: 'bmw', modelFamily: 'x5', label: 'BMW X5', vehicleClass: 'SUV', seats: 5 },
  { make: 'bmw', modelFamily: 'x7', label: 'BMW X7', vehicleClass: 'SUV', seats: 6 },

  // ── Audi ──
  { make: 'audi', modelFamily: 'a4', label: 'Audi A4', vehicleClass: 'Berline', seats: 4 },
  { make: 'audi', modelFamily: 'a6', label: 'Audi A6', vehicleClass: 'Berline', seats: 4 },
  { make: 'audi', modelFamily: 'a8', label: 'Audi A8', vehicleClass: 'Premium', seats: 4 },
  { make: 'audi', modelFamily: 'q7', label: 'Audi Q7', vehicleClass: 'SUV', seats: 6 },
  { make: 'audi', modelFamily: 'e-tron', label: 'Audi e-tron', vehicleClass: 'SUV', seats: 5 },

  // ── Tesla ──
  { make: 'tesla', modelFamily: 'model-3', label: 'Tesla Model 3', vehicleClass: 'Berline', seats: 4 },
  { make: 'tesla', modelFamily: 'model-s', label: 'Tesla Model S', vehicleClass: 'Premium', seats: 4 },
  { make: 'tesla', modelFamily: 'model-x', label: 'Tesla Model X', vehicleClass: 'SUV', seats: 6 },
  { make: 'tesla', modelFamily: 'model-y', label: 'Tesla Model Y', vehicleClass: 'SUV', seats: 5 },

  // ── Volkswagen ──
  { make: 'volkswagen', modelFamily: 'passat', label: 'Volkswagen Passat', vehicleClass: 'Berline', seats: 4 },
  { make: 'volkswagen', modelFamily: 'multivan', label: 'Volkswagen Multivan', vehicleClass: 'Van', seats: 7 },
  { make: 'volkswagen', modelFamily: 'caravelle', label: 'Volkswagen Caravelle', vehicleClass: 'Van', seats: 8 },
  { make: 'volkswagen', modelFamily: 'id-buzz', label: 'Volkswagen ID. Buzz', vehicleClass: 'Van', seats: 7 },

  // ── Peugeot / Citroën / DS ──
  { make: 'peugeot', modelFamily: '508', label: 'Peugeot 508', vehicleClass: 'Berline', seats: 4 },
  { make: 'peugeot', modelFamily: 'traveller', label: 'Peugeot Traveller', vehicleClass: 'Van', seats: 8 },
  { make: 'citroen', modelFamily: 'spacetourer', label: 'Citroën SpaceTourer', vehicleClass: 'Van', seats: 8 },
  { make: 'ds', modelFamily: 'ds-7', label: 'DS 7', vehicleClass: 'SUV', seats: 5 },
  { make: 'ds', modelFamily: 'ds-9', label: 'DS 9', vehicleClass: 'Berline', seats: 4 },

  // ── Renault ──
  { make: 'renault', modelFamily: 'talisman', label: 'Renault Talisman', vehicleClass: 'Berline', seats: 4 },
  { make: 'renault', modelFamily: 'espace', label: 'Renault Espace', vehicleClass: 'SUV', seats: 5 },
  { make: 'renault', modelFamily: 'trafic', label: 'Renault Trafic', vehicleClass: 'Van', seats: 8 },

  // ── Volvo ──
  { make: 'volvo', modelFamily: 's90', label: 'Volvo S90', vehicleClass: 'Berline', seats: 4 },
  { make: 'volvo', modelFamily: 'xc90', label: 'Volvo XC90', vehicleClass: 'SUV', seats: 6 },

  // ── Premium SUV ──
  { make: 'land-rover', modelFamily: 'range-rover', label: 'Land Rover Range Rover', vehicleClass: 'Premium', seats: 5 },
  { make: 'lexus', modelFamily: 'es', label: 'Lexus ES', vehicleClass: 'Berline', seats: 4 },
  { make: 'lexus', modelFamily: 'rx', label: 'Lexus RX', vehicleClass: 'SUV', seats: 5 },
  { make: 'jaguar', modelFamily: 'xf', label: 'Jaguar XF', vehicleClass: 'Berline', seats: 4 },
]

/** Recherche simple (insensible à la casse/accents) sur le libellé du modèle. */
export function searchCatalog(query: string, limit = 8): VehicleCatalogEntry[] {
  const diacritics = new RegExp('[\\u0300-\\u036f]', 'g')
  const norm = (s: string) => s.normalize('NFD').replace(diacritics, '').toLowerCase().trim()
  const q = norm(query)
  if (!q) return VEHICLE_CATALOG.slice(0, limit)
  return VEHICLE_CATALOG.filter((e) => norm(e.label).includes(q) || norm(e.modelFamily).includes(q)).slice(0, limit)
}
