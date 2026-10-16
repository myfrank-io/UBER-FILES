import { afterEach, describe, expect, it, vi } from 'vitest'
import { autocompletePlaces, computeRoute, geocodeAddress } from './google-maps'

// Régression de la panne d'octobre 2026 : la clé Google avait cessé de
// fonctionner et l'autocomplétion renvoyait un tableau vide. Sans suggestion, le
// client ne pouvait sélectionner aucune adresse, donc aucune coordonnée, donc
// AUCUNE réservation — pendant une semaine, sans la moindre erreur en prod.
//
// Ce qui est vérifié ici : une panne Google se dégrade toujours vers la Base
// Adresse Nationale (gratuite, sans clé), jamais vers le vide.

const BAN_RESPONSE = {
  features: [
    {
      geometry: { coordinates: [2.3522, 48.8566] as [number, number] },
      properties: { label: '10 Rue de Rivoli 75001 Paris', id: '75101_8249_00010' },
    },
  ],
}

/** Route les appels selon l'hôte, pour n'avoir à décrire que ce qui compte. */
function stubFetch(routes: { google?: () => unknown; ban?: () => unknown }) {
  const calls: string[] = []
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = String(input)
    calls.push(url)
    const handler = url.includes('data.gouv.fr') ? routes.ban : routes.google
    if (!handler) throw new Error(`appel inattendu : ${url}`)
    const result = handler()
    if (result instanceof Error) throw result
    return result as Response
  })
  return calls
}

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as Response

const fail = (status: number, body = 'API key expired'): Response =>
  ({ ok: false, status, json: async () => ({}), text: async () => body }) as Response

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('autocomplétion d’adresse', () => {
  it('sans clé : passe directement par la BAN', async () => {
    const calls = stubFetch({ ban: () => ok(BAN_RESPONSE) })
    const out = await autocompletePlaces('10 rue de Rivoli Paris', undefined)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ lat: 48.8566, lng: 2.3522 })
    expect(calls.every((u) => u.includes('data.gouv.fr'))).toBe(true)
  })

  it('clé REFUSÉE par Google : se rabat sur la BAN au lieu de ne rien renvoyer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const calls = stubFetch({ google: () => fail(403), ban: () => ok(BAN_RESPONSE) })
    const out = await autocompletePlaces('10 rue de Rivoli Paris', 'cle-morte')
    // Le point de la régression : une suggestion, pas un tableau vide.
    expect(out).toHaveLength(1)
    expect(out[0]!.description).toContain('Rivoli')
    expect(calls.some((u) => u.includes('data.gouv.fr'))).toBe(true)
  })

  it('panne réseau vers Google : se rabat aussi sur la BAN', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubFetch({ google: () => new Error('ECONNRESET'), ban: () => ok(BAN_RESPONSE) })
    expect(await autocompletePlaces('10 rue de Rivoli Paris', 'cle')).toHaveLength(1)
  })

  it('journalise la panne : un repli silencieux est invisible en production', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubFetch({ google: () => fail(403, 'API key expired'), ban: () => ok(BAN_RESPONSE) })
    await autocompletePlaces('10 rue de Rivoli Paris', 'cle-morte')
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]![0])).toContain('[maps]')
    expect(String(warn.mock.calls[0]![0])).toContain('API key expired')
  })

  it('Google répond : la BAN n’est pas appelée', async () => {
    const calls = stubFetch({
      google: () =>
        ok({ suggestions: [{ placePrediction: { placeId: 'ChIJxxx', text: { text: '10 Rue de Rivoli, Paris' } } }] }),
    })
    const out = await autocompletePlaces('10 rue de Rivoli Paris', 'cle-valide')
    expect(out).toEqual([{ description: '10 Rue de Rivoli, Paris', placeId: 'ChIJxxx' }])
    expect(calls.some((u) => u.includes('data.gouv.fr'))).toBe(false)
  })

  it('moins de 3 caractères : aucun appel', async () => {
    const calls = stubFetch({})
    expect(await autocompletePlaces('ru', 'cle')).toEqual([])
    expect(calls).toHaveLength(0)
  })
})

describe('géocodage d’une adresse libre', () => {
  it('clé refusée : l’API legacy répond 200 avec REQUEST_DENIED — repli BAN quand même', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const calls = stubFetch({
      // Le piège : HTTP 200, la panne n'est que dans le corps.
      google: () => ok({ status: 'REQUEST_DENIED', error_message: 'The provided API key is expired.' }),
      ban: () => ok(BAN_RESPONSE),
    })
    const out = await geocodeAddress('10 rue de Rivoli, 75001 Paris', 'cle-morte')
    expect(out).toMatchObject({ lat: 48.8566, lng: 2.3522 })
    expect(calls.some((u) => u.includes('data.gouv.fr'))).toBe(true)
  })

  it('quota dépassé : repli BAN', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubFetch({ google: () => ok({ status: 'OVER_QUERY_LIMIT' }), ban: () => ok(BAN_RESPONSE) })
    expect(await geocodeAddress('10 rue de Rivoli', 'cle')).not.toBeNull()
  })

  it('ZERO_RESULTS : adresse réellement inexistante, pas de repli inutile', async () => {
    const calls = stubFetch({ google: () => ok({ status: 'ZERO_RESULTS', results: [] }) })
    expect(await geocodeAddress('azertyuiop qsdfghjklm', 'cle-valide')).toBeNull()
    expect(calls.some((u) => u.includes('data.gouv.fr'))).toBe(false)
  })

  it('Google répond : ses coordonnées priment', async () => {
    stubFetch({
      google: () =>
        ok({
          status: 'OK',
          results: [{ geometry: { location: { lat: 48.86, lng: 2.35 } }, formatted_address: '10 Rue de Rivoli, Paris' }],
        }),
    })
    expect(await geocodeAddress('10 rue de Rivoli', 'cle-valide')).toEqual({
      lat: 48.86,
      lng: 2.35,
      formatted: '10 Rue de Rivoli, Paris',
    })
  })
})

describe('itinéraire', () => {
  it('Google en échec : repli haversine, le devis sort quand même', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubFetch({ google: () => fail(403) })
    const route = await computeRoute({ lat: 48.8566, lng: 2.3522 }, { lat: 48.7262, lng: 2.3652 }, 'cle-morte')
    expect(route.estimated).toBe(true)
    expect(route.distanceMeters).toBeGreaterThan(0)
  })

  it('panne réseau : repli haversine plutôt qu’une exception', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubFetch({ google: () => new Error('ECONNRESET') })
    const route = await computeRoute({ lat: 48.8566, lng: 2.3522 }, { lat: 48.7262, lng: 2.3652 }, 'cle')
    expect(route.estimated).toBe(true)
  })

  it('Google répond : distance réelle, pas estimée', async () => {
    stubFetch({ google: () => ok({ routes: [{ distanceMeters: 18500, duration: '1800s' }] }) })
    const route = await computeRoute({ lat: 48.8566, lng: 2.3522 }, { lat: 48.7262, lng: 2.3652 }, 'cle-valide')
    expect(route).toEqual({ distanceMeters: 18500, durationSeconds: 1800, estimated: false })
  })
})
