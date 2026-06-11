import { describe, expect, it } from 'vitest'
import { signClientToken, verifyClientToken } from './tokens'

const SECRET = 'test-secret-at-least-32-characters-long'

describe('signClientToken + verifyClientToken', () => {
  it('signe et vérifie un token quote valide', async () => {
    const token = await signClientToken({ purpose: 'quote', ref: 'quote-123' }, SECRET)
    const payload = await verifyClientToken(token, SECRET)
    expect(payload).toEqual({ purpose: 'quote', ref: 'quote-123' })
  })

  it('signe et vérifie un token manage valide', async () => {
    const token = await signClientToken({ purpose: 'manage', ref: 'booking-abc' }, SECRET, '1d')
    const payload = await verifyClientToken(token, SECRET)
    expect(payload).toEqual({ purpose: 'manage', ref: 'booking-abc' })
  })

  it('renvoie null pour un token falsifié', async () => {
    const token = await signClientToken({ purpose: 'quote', ref: 'id-1' }, SECRET)
    const tampered = token.slice(0, -5) + 'XXXXX'
    expect(await verifyClientToken(tampered, SECRET)).toBeNull()
  })

  it('renvoie null pour un token signé avec un autre secret', async () => {
    const token = await signClientToken({ purpose: 'quote', ref: 'id-1' }, 'other-secret-xxxxxxxxxxxxxxxxxxxxx')
    expect(await verifyClientToken(token, SECRET)).toBeNull()
  })

  it('renvoie null pour un token expiré', async () => {
    const token = await signClientToken({ purpose: 'quote', ref: 'id-1' }, SECRET, '1s')
    await new Promise((r) => setTimeout(r, 1100))
    expect(await verifyClientToken(token, SECRET)).toBeNull()
  })

  it('renvoie null pour un token vide', async () => {
    expect(await verifyClientToken('', SECRET)).toBeNull()
  })

  it('renvoie null pour une chaîne aléatoire non JWT', async () => {
    expect(await verifyClientToken('not.a.jwt', SECRET)).toBeNull()
  })
})
