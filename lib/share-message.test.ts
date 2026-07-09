import { describe, it, expect } from 'vitest'
import { buildShareMessage } from './share-message'

describe('buildShareMessage', () => {
  it('personnalise le message avec le nom du client et du chauffeur', () => {
    const msg = buildShareMessage({
      customerName: 'Marie',
      driverName: 'Karim VTC',
      publicUrl: 'https://ridewiz.fr/karim-paris',
    })
    expect(msg).toContain('Bonjour Marie,')
    expect(msg).toContain('chauffeur privé Karim VTC')
    expect(msg).toContain('https://ridewiz.fr/karim-paris')
    expect(msg).toContain('réservez votre prochaine course')
    expect(msg).toContain('dès maintenant sur :')
  })

  it('reste correct sans nom de client', () => {
    const msg = buildShareMessage({
      customerName: '   ',
      driverName: 'Karim VTC',
      publicUrl: 'https://ridewiz.fr/karim-paris',
    })
    expect(msg.startsWith('Bonjour, ')).toBe(true)
    expect(msg).not.toContain('Bonjour ,')
  })

  it('met le lien sur une nouvelle ligne (aperçu propre sur WhatsApp)', () => {
    const msg = buildShareMessage({
      customerName: 'Léa',
      driverName: 'Sofia',
      publicUrl: 'https://ridewiz.fr/sofia',
    })
    expect(msg).toContain('\nhttps://ridewiz.fr/sofia')
  })
})
