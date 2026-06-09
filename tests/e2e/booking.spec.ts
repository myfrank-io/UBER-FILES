import { test, expect } from '@playwright/test'

// Parcours critique côté client : la page publique du chauffeur s'affiche, on peut
// choisir une prestation de mise à disposition et obtenir une estimation de prix.
test.describe('Page de réservation publique', () => {
  test('affiche le chauffeur et estime une mise à disposition', async ({ page }) => {
    await page.goto('/karim-paris')

    // Présentation du chauffeur
    await expect(page.getByRole('heading', { name: /Karim/ })).toBeVisible()
    await expect(page.getByText('Réservez votre course')).toBeVisible()

    // Bascule sur la mise à disposition
    await page.getByRole('button', { name: /Mise à disposition/ }).click()
    await page.getByLabel(/Durée souhaitée/).fill('4')

    // Estimation
    await page.getByRole('button', { name: 'Estimer le prix' }).click()
    await expect(page.getByText('Estimation')).toBeVisible({ timeout: 10_000 })
    // 4h × 55 € = 220 € (grille de démo)
    await expect(page.getByText(/220,00/)).toBeVisible()
  })

  test('renvoie une 404 pour un chauffeur inconnu', async ({ page }) => {
    const res = await page.goto('/chauffeur-inexistant')
    expect(res?.status()).toBe(404)
  })
})
