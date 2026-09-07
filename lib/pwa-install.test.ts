import { describe, expect, it } from 'vitest'
import { detectInstallPlatform, installSnoozeUntil, isInstallSnoozed } from './pwa-install'

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

describe('detectInstallPlatform', () => {
  it('reconnaît iPhone et iPad', () => {
    expect(detectInstallPlatform(IPHONE)).toBe('ios')
    expect(detectInstallPlatform(IPHONE.replace('iPhone', 'iPad'))).toBe('ios')
  })

  it('reconnaît un iPad en mode bureau (UA Mac + écran tactile)', () => {
    expect(detectInstallPlatform(IPAD_DESKTOP_MODE, 5)).toBe('ios')
    // Un vrai Mac n'a pas d'écran tactile : bureau.
    expect(detectInstallPlatform(IPAD_DESKTOP_MODE, 0)).toBe('desktop')
  })

  it('reconnaît Android et renvoie « desktop » pour le reste', () => {
    expect(detectInstallPlatform(ANDROID_CHROME)).toBe('android')
    expect(detectInstallPlatform(WINDOWS_CHROME)).toBe('desktop')
    expect(detectInstallPlatform('')).toBe('desktop')
  })
})

describe("report de l'invitation", () => {
  const now = Date.UTC(2026, 8, 7, 12, 0, 0)

  it('reporte de 30 jours par défaut', () => {
    const stored = installSnoozeUntil(now)
    expect(Number(stored) - now).toBe(30 * 24 * 60 * 60 * 1000)
    expect(isInstallSnoozed(stored, now)).toBe(true)
    expect(isInstallSnoozed(stored, Number(stored))).toBe(false)
  })

  it('ignore une valeur absente ou illisible', () => {
    expect(isInstallSnoozed(null, now)).toBe(false)
    expect(isInstallSnoozed(undefined, now)).toBe(false)
    expect(isInstallSnoozed('', now)).toBe(false)
    expect(isInstallSnoozed('demain', now)).toBe(false)
  })

  it("expire une fois l'échéance passée", () => {
    expect(isInstallSnoozed(String(now - 1), now)).toBe(false)
  })
})
