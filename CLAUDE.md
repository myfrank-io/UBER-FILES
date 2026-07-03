# Instructions pour Claude Code

## Déploiement

- La prod est déployée automatiquement par Vercel à chaque merge dans `main`
  (`npm run vercel-build` : migrations Prisma + build Nuxt). Merger une PR
  dans `main` = mise en prod.
- Méthode de merge : merge commit (comme l'historique existant).

## Vérifications avant push

- `npm test` (Vitest) doit être vert.
- `npx nuxt build` doit passer.
- `npx nuxt typecheck` : 46 erreurs préexistantes connues sur `main` — ne pas
  en introduire de nouvelles.

## Base de données

- Les previews Vercel et la prod partagent la même base : une migration
  appliquée en preview est déjà enregistrée dans `_prisma_migrations`.
  Ne jamais renommer un dossier de migration déjà déployé.
