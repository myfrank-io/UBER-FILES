// Vérification du SIREN chauffeur via l'API Sirene de l'INSEE.
// Sans clé configurée, on renvoie un état "non vérifié" sans bloquer l'onboarding.

export interface SirenCheck {
  verified: boolean
  companyName?: string
  active?: boolean
  reason?: string
}

export async function verifySiren(siren: string, apiKey: string | undefined): Promise<SirenCheck> {
  const clean = siren.replace(/\s/g, '')
  if (!/^\d{9}$/.test(clean)) {
    return { verified: false, reason: 'Le SIREN doit comporter 9 chiffres.' }
  }
  if (!apiKey) {
    return { verified: false, reason: 'API Sirene non configurée (vérification manuelle requise).' }
  }
  try {
    const res = await fetch(`https://api.insee.fr/entreprises/sirene/V3.11/siren/${clean}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    })
    if (res.status === 404) return { verified: false, reason: 'SIREN introuvable.' }
    if (!res.ok) return { verified: false, reason: 'Service INSEE indisponible.' }
    const data = (await res.json()) as {
      uniteLegale?: {
        periodesUniteLegale?: { etatAdministratifUniteLegale?: string; denominationUniteLegale?: string | null }[]
        prenom1UniteLegale?: string | null
        nomUniteLegale?: string | null
      }
    }
    const period = data.uniteLegale?.periodesUniteLegale?.[0]
    const active = period?.etatAdministratifUniteLegale === 'A'
    const personName = [data.uniteLegale?.prenom1UniteLegale, data.uniteLegale?.nomUniteLegale]
      .filter(Boolean)
      .join(' ')
    const companyName = period?.denominationUniteLegale ?? (personName || undefined)
    return { verified: active, companyName, active, reason: active ? undefined : 'Entreprise cessée.' }
  } catch {
    return { verified: false, reason: 'Erreur lors de la vérification INSEE.' }
  }
}
