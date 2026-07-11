import { describe, it, expect } from 'vitest'
import {
  placeQueryVariants,
  isLikelyUrl,
  allowedMapsUrl,
  parseMapsPlaceUrl,
} from './place-search'

describe('placeQueryVariants', () => {
  it('ajoute le premier segment quand le nom contient un slogan après un tiret', () => {
    expect(placeQueryVariants('KERKAR Drive - Chauffeur VTC')).toEqual([
      'KERKAR Drive - Chauffeur VTC',
      'KERKAR Drive',
    ])
  })

  it('ajoute la raison sociale en dernier, sans doublon (insensible à la casse)', () => {
    expect(placeQueryVariants('KERKAR Drive - Chauffeur VTC', ['KERKAR DRIVE', 'Kerkar Drive - chauffeur vtc'])).toEqual([
      'KERKAR Drive - Chauffeur VTC',
      'KERKAR Drive',
      // « KERKAR DRIVE » ≠ « KERKAR Drive » ? Non : doublon insensible à la casse, écarté.
    ])
  })

  it('reste sur la saisie brute quand il n’y a rien à découper', () => {
    expect(placeQueryVariants('Karim VTC Lyon')).toEqual(['Karim VTC Lyon'])
  })

  it('ignore les variantes trop courtes et plafonne à 3', () => {
    expect(placeQueryVariants('AB - CD - encore un segment', ['Un', 'Société Alpha', 'Société Beta'])).toHaveLength(3)
  })
})

describe('isLikelyUrl', () => {
  it('reconnaît une URL et rejette un nom d’entreprise', () => {
    expect(isLikelyUrl('https://maps.app.goo.gl/AbC123')).toBe(true)
    expect(isLikelyUrl('KERKAR Drive - Chauffeur VTC')).toBe(false)
  })
})

describe('allowedMapsUrl', () => {
  it('accepte les hôtes de partage Google', () => {
    expect(allowedMapsUrl('https://maps.app.goo.gl/AbC123')).not.toBeNull()
    expect(allowedMapsUrl('https://g.page/kerkar-drive')).not.toBeNull()
    expect(allowedMapsUrl('https://www.google.com/maps/place/KERKAR+Drive')).not.toBeNull()
    expect(allowedMapsUrl('https://maps.google.fr/maps?q=x')).not.toBeNull()
  })

  it('rejette http, les ports et les hôtes hors liste (anti-SSRF)', () => {
    expect(allowedMapsUrl('http://maps.app.goo.gl/AbC123')).toBeNull()
    expect(allowedMapsUrl('https://maps.app.goo.gl:8443/AbC123')).toBeNull()
    expect(allowedMapsUrl('https://evil.com/maps/place/x')).toBeNull()
    expect(allowedMapsUrl('https://google.com.evil.com/maps')).toBeNull()
    expect(allowedMapsUrl('pas une url')).toBeNull()
  })
})

describe('parseMapsPlaceUrl', () => {
  it('extrait le nom et privilégie les coordonnées de la fiche (!3d/!4d)', () => {
    const url =
      'https://www.google.com/maps/place/KERKAR+Drive+-+Chauffeur+VTC/@48.90,2.50,11z/data=!3m1!4b1!4m6!3m5!1s0x47e6:0x8c5!8m2!3d48.9812!4d2.6125!16s'
    expect(parseMapsPlaceUrl(url)).toEqual({
      name: 'KERKAR Drive - Chauffeur VTC',
      lat: 48.9812,
      lng: 2.6125,
    })
  })

  it('retombe sur les coordonnées de la vue (@lat,lng) sans !3d/!4d', () => {
    const hint = parseMapsPlaceUrl('https://www.google.com/maps/place/Karim%20VTC/@45.76,4.83,12z')
    expect(hint).toEqual({ name: 'Karim VTC', lat: 45.76, lng: 4.83 })
  })

  it('renvoie des nulls quand l’URL ne décrit pas une fiche', () => {
    expect(parseMapsPlaceUrl('https://www.google.com/maps/search/vtc')).toEqual({
      name: null,
      lat: null,
      lng: null,
    })
  })
})
