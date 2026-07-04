import { describe, expect, it } from 'vitest'
import { googleMapsNavUrl, wazeNavUrl } from './nav-links'

describe('nav-links', () => {
  it('privilégie les coordonnées GPS quand elles existent', () => {
    const target = { address: '11 rue du Muguet, Brest', lat: 48.39, lng: -4.486 }
    expect(googleMapsNavUrl(target)).toBe('https://www.google.com/maps/dir/?api=1&destination=48.39,-4.486')
    expect(wazeNavUrl(target)).toBe('https://waze.com/ul?ll=48.39,-4.486&navigate=yes')
  })

  it("retombe sur l'adresse encodée sans coordonnées", () => {
    const target = { address: '11 rue du Muguet, Brest' }
    expect(googleMapsNavUrl(target)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=11%20rue%20du%20Muguet%2C%20Brest',
    )
    expect(wazeNavUrl(target)).toBe('https://waze.com/ul?q=11%20rue%20du%20Muguet%2C%20Brest&navigate=yes')
  })

  it('renvoie null sans adresse ni coordonnées', () => {
    expect(googleMapsNavUrl({})).toBeNull()
    expect(wazeNavUrl({ address: null, lat: null, lng: null })).toBeNull()
  })
})
