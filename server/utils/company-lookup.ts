// Recherche d'entreprise pour pré-remplir le bloc client d'une facture.
//
// Source : l'annuaire des entreprises de l'État
// (recherche-entreprises.api.gouv.fr), qui expose les données publiques du
// répertoire Sirene. Aucune clé d'API, donc rien à configurer et rien à
// renouveler — contrairement à l'API Sirene de l'INSEE déjà utilisée pour
// vérifier le SIREN d'un chauffeur (server/utils/insee.ts), qui, elle, exige
// une clé.
//
// Le mapping des réponses est isolé dans `mapCompanySearch`, pure et testée
// sur des extraits réels : le format de l'annuaire peut bouger, on veut le
// constater par un test plutôt qu'en production.
import { isValidSiren, isValidSiret, normalizeSiret } from '~/lib/invoice'

const API_URL = 'https://recherche-entreprises.api.gouv.fr/search'
const TIMEOUT_MS = 6000

/** Une entreprise trouvée, déjà mise en forme pour les champs de la facture. */
export interface CompanyMatch {
  siren: string
  siret: string | null
  /** Raison sociale (ou nom du dirigeant pour une entreprise individuelle). */
  name: string
  /** Dirigeant personne physique, quand l'annuaire en publie un. */
  contactName: string | null
  /** Adresse complète sur une ligne, telle qu'elle s'imprimera sur la facture. */
  address: string | null
  postalCode: string | null
  city: string | null
  /** Établissement fermé ou entreprise cessée : on le signale sans bloquer. */
  active: boolean
  activity: string | null
}

export interface CompanySearchResult {
  results: CompanyMatch[]
  /** Message à afficher tel quel quand la recherche n'a rien pu donner. */
  error: string | null
}

// Formes de l'annuaire, toutes optionnelles : on ne suppose rien.
interface RawEstablishment {
  siret?: string | null
  adresse?: string | null
  code_postal?: string | null
  libelle_commune?: string | null
  numero_voie?: string | null
  type_voie?: string | null
  libelle_voie?: string | null
  etat_administratif?: string | null
}

interface RawLeader {
  nom?: string | null
  prenoms?: string | null
  denomination?: string | null
  type_dirigeant?: string | null
}

interface RawCompany {
  siren?: string | null
  nom_complet?: string | null
  nom_raison_sociale?: string | null
  etat_administratif?: string | null
  libelle_activite_principale?: string | null
  activite_principale?: string | null
  siege?: RawEstablishment | null
  matching_etablissements?: RawEstablishment[] | null
  dirigeants?: RawLeader[] | null
}

interface RawPayload {
  results?: RawCompany[] | null
}

/** Adresse sur une ligne : voie, puis code postal et commune. */
function formatAddress(place: RawEstablishment | null | undefined): string | null {
  if (!place) return null
  const street = [place.numero_voie, place.type_voie, place.libelle_voie]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
  const town = [place.code_postal?.trim(), place.libelle_commune?.trim()].filter(Boolean).join(' ')
  const joined = [street, town].filter(Boolean).join(', ')
  // `adresse` sert de repli : certains établissements n'ont pas la voie découpée.
  return joined || place.adresse?.trim() || null
}

/** Premier dirigeant personne physique, « NOM Prénom ». */
function leaderName(leaders: RawLeader[] | null | undefined): string | null {
  const person = leaders?.find((leader) => leader.nom?.trim())
  if (!person) return null
  return [person.nom?.trim(), person.prenoms?.trim()].filter(Boolean).join(' ') || null
}

/**
 * Traduit une réponse de l'annuaire en résultats affichables. Quand la
 * recherche portait sur un SIRET, on retient l'établissement correspondant
 * plutôt que le siège : c'est celui-là que le client veut voir facturé.
 */
export function mapCompanySearch(payload: unknown, siretQuery?: string | null): CompanyMatch[] {
  const raw = (payload as RawPayload)?.results
  if (!Array.isArray(raw)) return []
  const wanted = siretQuery ? normalizeSiret(siretQuery) : null

  return raw.flatMap((company) => {
    const siren = company.siren?.trim()
    if (!siren) return []

    const matching = company.matching_etablissements ?? []
    const place =
      (wanted ? matching.find((e) => normalizeSiret(e.siret ?? '') === wanted) : undefined) ??
      matching[0] ??
      company.siege ??
      null

    const name = company.nom_complet?.trim() || company.nom_raison_sociale?.trim()
    if (!name) return []

    return [
      {
        siren,
        siret: place?.siret?.trim() || null,
        name,
        contactName: leaderName(company.dirigeants),
        address: formatAddress(place),
        postalCode: place?.code_postal?.trim() || null,
        city: place?.libelle_commune?.trim() || null,
        // « A » = actif dans le répertoire Sirene ; toute autre valeur = cessé.
        active: (place?.etat_administratif ?? company.etat_administratif ?? 'A') === 'A',
        activity: company.libelle_activite_principale?.trim() || company.activite_principale?.trim() || null,
      },
    ]
  })
}

/**
 * Interroge l'annuaire. Ne lève jamais : une recherche indisponible ne doit
 * pas empêcher de saisir la facture à la main.
 */
export async function searchCompanies(query: string): Promise<CompanySearchResult> {
  const trimmed = query.trim()
  if (trimmed.length < 3) {
    return { results: [], error: 'Saisissez au moins 3 caractères, un SIREN ou un SIRET.' }
  }

  // Un numéro mal recopié ne vaut pas un appel réseau : la clé de Luhn le dit.
  const digits = normalizeSiret(trimmed)
  const looksNumeric = /^\d[\d\s]*$/.test(trimmed)
  if (looksNumeric && (digits.length === 9 || digits.length === 14)) {
    const valid = digits.length === 9 ? isValidSiren(digits) : isValidSiret(digits)
    if (!valid) {
      return {
        results: [],
        error: `Ce ${digits.length === 9 ? 'SIREN' : 'SIRET'} est invalide (clé de contrôle). Vérifiez la saisie.`,
      }
    }
  }

  const search = looksNumeric ? digits : trimmed
  try {
    const res = await fetch(`${API_URL}?q=${encodeURIComponent(search)}&per_page=5`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      return { results: [], error: 'L’annuaire des entreprises est indisponible. Saisissez les informations à la main.' }
    }
    const results = mapCompanySearch(await res.json(), looksNumeric && digits.length === 14 ? digits : null)
    if (results.length === 0) {
      return { results: [], error: 'Aucune entreprise trouvée pour cette recherche.' }
    }
    return { results, error: null }
  } catch {
    return { results: [], error: 'L’annuaire des entreprises n’a pas répondu. Saisissez les informations à la main.' }
  }
}
