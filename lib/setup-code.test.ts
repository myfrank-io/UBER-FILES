import { describe, it, expect } from 'vitest'
import {
  SETUP_CODE_MAX_ATTEMPTS,
  checkCode,
  codeFromRandomBytes,
  isCodeShape,
  maskEmail,
  normalizeCode,
  resendWaitSeconds,
} from './setup-code'

describe('codeFromRandomBytes', () => {
  it('produit toujours 6 chiffres, zéros de tête compris', () => {
    expect(codeFromRandomBytes(new Uint8Array([0, 0, 0, 0]))).toBe('000000')
    expect(codeFromRandomBytes(new Uint8Array([0, 0, 0, 7]))).toBe('000007')
    expect(codeFromRandomBytes(new Uint8Array([255, 255, 255, 255]))).toMatch(/^\d{6}$/)
  })
  it('refuse moins de 4 octets', () => {
    expect(() => codeFromRandomBytes(new Uint8Array([1, 2]))).toThrow()
  })
})

describe('normalizeCode / isCodeShape', () => {
  it('tolère espaces et tirets', () => {
    expect(normalizeCode('12 34-56')).toBe('123456')
    expect(normalizeCode('1234567')).toBe('123456')
    expect(isCodeShape('123456')).toBe(true)
    expect(isCodeShape('12345')).toBe(false)
    expect(isCodeShape('12345a')).toBe(false)
  })
})

describe('maskEmail', () => {
  it('garde deux caractères et le domaine', () => {
    expect(maskEmail('nadia.b@gmail.com')).toBe('na•••@gmail.com')
    expect(maskEmail('k@exemple.fr')).toBe('k•••@exemple.fr')
    expect(maskEmail('pas-un-email')).toBe('•••')
  })
})

describe('resendWaitSeconds', () => {
  const now = new Date('2026-09-02T10:00:30Z')
  it('0 sans envoi précédent ou après le délai', () => {
    expect(resendWaitSeconds(null, now)).toBe(0)
    expect(resendWaitSeconds(new Date('2026-09-02T09:59:00Z'), now)).toBe(0)
  })
  it('compte les secondes restantes', () => {
    expect(resendWaitSeconds(new Date('2026-09-02T10:00:20Z'), now)).toBe(20)
    expect(resendWaitSeconds(new Date('2026-09-02T10:00:30Z'), now)).toBe(30)
  })
})

describe('checkCode', () => {
  const now = new Date('2026-09-02T10:00:00Z')
  const future = new Date('2026-09-02T10:05:00Z')
  it('ok / mismatch', () => {
    expect(checkCode({ hasCode: true, expiresAt: future, attempts: 0, matches: true }, now)).toBe('ok')
    expect(checkCode({ hasCode: true, expiresAt: future, attempts: 0, matches: false }, now)).toBe('mismatch')
  })
  it('aucun code / expiré / verrouillé, même si le code correspond', () => {
    expect(checkCode({ hasCode: false, expiresAt: future, attempts: 0, matches: true }, now)).toBe('none')
    expect(checkCode({ hasCode: true, expiresAt: new Date('2026-09-02T09:00:00Z'), attempts: 0, matches: true }, now)).toBe('expired')
    expect(checkCode({ hasCode: true, expiresAt: future, attempts: SETUP_CODE_MAX_ATTEMPTS, matches: true }, now)).toBe('locked')
  })
})
