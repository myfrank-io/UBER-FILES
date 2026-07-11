import { describe, it, expect } from 'vitest'
import { googleReviewUrl, driverReviewUrl, reviewFunnelPath } from './review-link'

describe('googleReviewUrl', () => {
  it('construit le lien de dépôt d’avis à partir du placeId', () => {
    expect(googleReviewUrl('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe(
      'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    )
  })

  it('échappe les caractères spéciaux du placeId', () => {
    expect(googleReviewUrl('a b&c')).toBe(
      'https://search.google.com/local/writereview?placeid=a%20b%26c',
    )
  })
})

describe('driverReviewUrl', () => {
  it('retourne null quand rien n’est configuré', () => {
    expect(driverReviewUrl({})).toBeNull()
    expect(driverReviewUrl({ reviewUrl: null, googlePlaceId: null })).toBeNull()
    expect(driverReviewUrl({ reviewUrl: '', googlePlaceId: '' })).toBeNull()
  })

  it('dérive le lien Google de la fiche connectée', () => {
    expect(driverReviewUrl({ googlePlaceId: 'ChIJxxx' })).toBe(
      'https://search.google.com/local/writereview?placeid=ChIJxxx',
    )
  })

  it('retourne le lien manuel tel quel', () => {
    expect(driverReviewUrl({ reviewUrl: 'https://fr.trustpilot.com/review/exemple.fr' })).toBe(
      'https://fr.trustpilot.com/review/exemple.fr',
    )
  })

  it('fait primer le lien manuel si les deux modes coexistent', () => {
    expect(
      driverReviewUrl({ reviewUrl: 'https://exemple.fr/avis', googlePlaceId: 'ChIJxxx' }),
    ).toBe('https://exemple.fr/avis')
  })
})

describe('reviewFunnelPath', () => {
  it('pointe vers la page de notation du chauffeur', () => {
    expect(reviewFunnelPath('karim-paris')).toBe('/avis/karim-paris')
  })

  it('échappe un slug inattendu', () => {
    expect(reviewFunnelPath('a/b c')).toBe('/avis/a%2Fb%20c')
  })
})
