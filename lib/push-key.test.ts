import { describe, expect, it } from 'vitest'
import { vapidKeyToBytes } from './push-key'

describe('vapidKeyToBytes', () => {
  it('décode le base64url, avec ou sans padding', () => {
    expect(Array.from(vapidKeyToBytes('AQID'))).toEqual([1, 2, 3])
    expect(Array.from(vapidKeyToBytes('_-8'))).toEqual([255, 239])
    expect(Array.from(vapidKeyToBytes(' AQ '))).toEqual([1])
  })

  it('rend 65 octets pour une clé P-256 non compressée', () => {
    const key = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    const bytes = vapidKeyToBytes(key)
    expect(bytes.length).toBe(65)
    expect(bytes[0]).toBe(0x04)
  })
})
