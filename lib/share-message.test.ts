import { describe, it, expect } from 'vitest'
import { buildShareMessage, defaultShareTemplate, renderShareTemplate } from './share-message'

const base = {
  customerName: 'Marie',
  driverName: 'Karim VTC',
  publicUrl: 'https://ridewiz.fr/karim-paris',
  reviewUrl: 'https://ridewiz.fr/avis/karim-paris',
}

describe('buildShareMessage', () => {
  it('remercie, propose le dépôt d’avis puis invite à réserver (modèle par défaut)', () => {
    const msg = buildShareMessage({ ...base, hasReviewLink: true })
    expect(msg).toContain('Bonjour Marie,')
    expect(msg).toContain('Merci d’avoir voyagé avec Karim VTC')
    expect(msg).toContain('laissant un avis')
    expect(msg).toContain('prochaine course avec Ridewiz')
    // L'avis vient d'abord, l'invitation à réserver termine le message.
    expect(msg.indexOf('https://ridewiz.fr/avis/karim-paris')).toBeLessThan(
      msg.indexOf('Réservez dès maintenant'),
    )
  })

  it('met chaque lien sur sa propre ligne (aperçu propre sur WhatsApp)', () => {
    const msg = buildShareMessage({ ...base, hasReviewLink: true })
    expect(msg).toContain('\nhttps://ridewiz.fr/avis/karim-paris\n')
    expect(msg).toContain('\nhttps://ridewiz.fr/karim-paris')
  })

  it('sans dépôt d’avis configuré : pas de paragraphe avis, l’invitation reste', () => {
    const msg = buildShareMessage({ ...base, hasReviewLink: false })
    expect(msg).not.toContain('avis')
    expect(msg).not.toContain('https://ridewiz.fr/avis/karim-paris')
    expect(msg).toContain('Merci d’avoir voyagé avec Karim VTC')
    expect(msg).toContain('\nhttps://ridewiz.fr/karim-paris')
  })

  it('reste correct sans nom de client', () => {
    const msg = buildShareMessage({ ...base, customerName: '   ', hasReviewLink: true })
    expect(msg.startsWith('Bonjour,')).toBe(true)
    expect(msg).not.toContain('Bonjour ,')
  })

  it('utilise le modèle personnalisé du chauffeur quand il existe', () => {
    const msg = buildShareMessage({
      ...base,
      hasReviewLink: true,
      template: 'Salut {client} ! Ici {chauffeur}. Avis : {lien_avis} — Résa : {lien_reservation}',
    })
    expect(msg).toBe(
      'Salut Marie ! Ici Karim VTC. Avis : https://ridewiz.fr/avis/karim-paris — Résa : https://ridewiz.fr/karim-paris',
    )
  })

  it('modèle vide ou blanc : retombe sur le modèle par défaut', () => {
    const msg = buildShareMessage({ ...base, hasReviewLink: true, template: '   ' })
    expect(msg).toContain('Merci d’avoir voyagé avec Karim VTC')
  })
})

describe('renderShareTemplate', () => {
  it('laisse tel quel un texte sans variables ou avec variables inconnues', () => {
    const out = renderShareTemplate('Coucou {autre} sans variable', {
      customerName: 'Marie',
      driverName: 'Karim',
      reviewUrl: 'https://r',
      publicUrl: 'https://p',
    })
    expect(out).toBe('Coucou {autre} sans variable')
  })

  it('avale l’espace précédant une variable vide', () => {
    const out = renderShareTemplate('Bonjour {client}, bienvenue', {
      customerName: '',
      driverName: 'Karim',
      reviewUrl: 'https://r',
      publicUrl: 'https://p',
    })
    expect(out).toBe('Bonjour, bienvenue')
  })
})

describe('defaultShareTemplate', () => {
  it('contient les variables attendues selon la configuration du lien d’avis', () => {
    expect(defaultShareTemplate(true)).toContain('{lien_avis}')
    expect(defaultShareTemplate(true)).toContain('{lien_reservation}')
    expect(defaultShareTemplate(false)).not.toContain('{lien_avis}')
    expect(defaultShareTemplate(false)).toContain('{lien_reservation}')
  })
})
