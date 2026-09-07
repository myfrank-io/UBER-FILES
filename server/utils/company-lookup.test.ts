import { describe, expect, it } from 'vitest'
import { mapCompanySearch, searchCompanies } from './company-lookup'

// Extrait de réponse de recherche-entreprises.api.gouv.fr, réduit aux champs
// que le mapping utilise. Sert de contrat : si l'annuaire change de format,
// ce test tombe avant la production.
const payload = {
  results: [
    {
      siren: '902378819',
      nom_complet: 'FMG PRESTIGE PARIS',
      nom_raison_sociale: 'FMG PRESTIGE PARIS',
      etat_administratif: 'A',
      libelle_activite_principale: 'Transport de voyageurs par taxis',
      dirigeants: [{ nom: 'FONSAT', prenoms: 'Miguel', type_dirigeant: 'personne physique' }],
      siege: {
        siret: '90237881900012',
        adresse: '26 RUE GEORGES BIZET 91160 LONGJUMEAU',
        numero_voie: '26',
        type_voie: 'RUE',
        libelle_voie: 'GEORGES BIZET',
        code_postal: '91160',
        libelle_commune: 'LONGJUMEAU',
        etat_administratif: 'A',
      },
      matching_etablissements: [
        {
          siret: '90237881900012',
          numero_voie: '26',
          type_voie: 'RUE',
          libelle_voie: 'GEORGES BIZET',
          code_postal: '91160',
          libelle_commune: 'LONGJUMEAU',
          etat_administratif: 'A',
        },
      ],
    },
  ],
}

describe('mapCompanySearch', () => {
  it('remplit les champs du bloc client d’une facture', () => {
    const [match] = mapCompanySearch(payload, '90237881900012')
    expect(match).toMatchObject({
      siren: '902378819',
      siret: '90237881900012',
      name: 'FMG PRESTIGE PARIS',
      contactName: 'FONSAT Miguel',
      address: '26 RUE GEORGES BIZET, 91160 LONGJUMEAU',
      postalCode: '91160',
      city: 'LONGJUMEAU',
      active: true,
    })
  })

  it('retient l’établissement recherché plutôt que le siège', () => {
    const twoPlaces = {
      results: [
        {
          ...payload.results[0],
          matching_etablissements: [
            {
              siret: '90237881900038',
              numero_voie: '7',
              type_voie: 'RUE',
              libelle_voie: 'DU CANAL',
              code_postal: '45200',
              libelle_commune: 'MONTARGIS',
              etat_administratif: 'A',
            },
            payload.results[0]!.matching_etablissements[0],
          ],
        },
      ],
    }
    expect(mapCompanySearch(twoPlaces, '90237881900012')?.[0]?.siret).toBe('90237881900012')
    // Sans SIRET demandé, on prend le premier établissement retourné.
    expect(mapCompanySearch(twoPlaces)?.[0]?.siret).toBe('90237881900038')
  })

  it('se rabat sur l’adresse brute quand la voie n’est pas découpée', () => {
    const flat = {
      results: [
        {
          siren: '902378819',
          nom_complet: 'FMG PRESTIGE PARIS',
          siege: { siret: '90237881900012', adresse: '26 RUE GEORGES BIZET 91160 LONGJUMEAU' },
        },
      ],
    }
    expect(mapCompanySearch(flat)[0]?.address).toBe('26 RUE GEORGES BIZET 91160 LONGJUMEAU')
  })

  it('signale un établissement fermé', () => {
    const closed = {
      results: [
        {
          siren: '902378819',
          nom_complet: 'FMG PRESTIGE PARIS',
          siege: { siret: '90237881900012', etat_administratif: 'F' },
        },
      ],
    }
    expect(mapCompanySearch(closed)[0]?.active).toBe(false)
  })

  it('ignore une entreprise sans SIREN ou sans nom', () => {
    expect(mapCompanySearch({ results: [{ nom_complet: 'SANS SIREN' }, { siren: '902378819' }] })).toEqual([])
  })

  it('ne casse pas sur une réponse inattendue', () => {
    expect(mapCompanySearch(null)).toEqual([])
    expect(mapCompanySearch({})).toEqual([])
    expect(mapCompanySearch({ results: 'nope' })).toEqual([])
  })

  it('gère un dirigeant personne morale (sans nom de personne)', () => {
    const corporate = {
      results: [
        {
          siren: '902378819',
          nom_complet: 'FMG PRESTIGE PARIS',
          dirigeants: [{ denomination: 'HOLDING X', type_dirigeant: 'personne morale' }],
          siege: { siret: '90237881900012' },
        },
      ],
    }
    expect(mapCompanySearch(corporate)[0]?.contactName).toBeNull()
  })
})

describe('searchCompanies', () => {
  it('refuse une recherche trop courte sans appeler l’annuaire', async () => {
    const result = await searchCompanies('ab')
    expect(result.results).toEqual([])
    expect(result.error).toContain('3 caractères')
  })

  it('rejette un SIRET dont la clé de contrôle est fausse, sans appel réseau', async () => {
    const result = await searchCompanies('90237881900013')
    expect(result.error).toContain('SIRET est invalide')
  })

  it('rejette un SIREN invalide', async () => {
    const result = await searchCompanies('902378810')
    expect(result.error).toContain('SIREN est invalide')
  })
})
