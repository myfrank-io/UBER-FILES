import { test, expect } from '@playwright/test'

// Parcours d'authentification : login chauffeur, erreur de mot de passe, redirection.
// Prérequis : base seedée avec un compte email=demo@example.com / password=password

const EMAIL = process.env.E2E_DRIVER_EMAIL || 'demo@example.com'
const PASSWORD = process.env.E2E_DRIVER_PASSWORD || 'password'

test.describe('Login chauffeur', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/login')
  })

  test('affiche le formulaire de connexion', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /connexion/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/mot de passe/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /se connecter/i })).toBeVisible()
  })

  test('affiche une erreur pour un mot de passe incorrect', async ({ page }) => {
    await page.getByLabel(/email/i).fill(EMAIL)
    await page.getByLabel(/mot de passe/i).fill('wrong-password')
    await page.getByRole('button', { name: /se connecter/i }).click()

    await expect(page.getByText(/incorrect|invalide|erreur/i)).toBeVisible({ timeout: 5000 })
    // Reste sur la page login
    await expect(page).toHaveURL(/login/)
  })

  test('affiche un lien "Mot de passe oublié"', async ({ page }) => {
    await expect(page.getByRole('link', { name: /mot de passe oublié/i })).toBeVisible()
  })

  test('redirige vers le dashboard après un login réussi', async ({ page }) => {
    await page.getByLabel(/email/i).fill(EMAIL)
    await page.getByLabel(/mot de passe/i).fill(PASSWORD)
    await page.getByRole('button', { name: /se connecter/i }).click()

    await expect(page).toHaveURL(/\/dashboard(?!\/login)/, { timeout: 10_000 })
  })
})

test.describe('Protection des routes dashboard', () => {
  test('redirige vers /dashboard/login si non connecté', async ({ page }) => {
    await page.goto('/dashboard/reservations')
    await expect(page).toHaveURL(/login/, { timeout: 8000 })
  })
})
