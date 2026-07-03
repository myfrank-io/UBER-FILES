-- Compte admin Uber Files : après connexion, ce compte arrive directement sur
-- l'admin center (la page de login redirige déjà role=ADMIN vers /admin).
-- Idempotent : upsert sur l'email — si le compte existe déjà, on le repasse en
-- ADMIN et on réaligne son hash de mot de passe. Le hash est au format scrypt
-- "salt:hash" attendu par server/utils/password.ts (verifyUserPassword).
INSERT INTO "User" ("id", "email", "passwordHash", "role", "updatedAt")
VALUES (
  'usr_uberfiles75_admin',
  'uber.files75@gmail.com',
  '73898d2d99ba938e08314e1442ec766a:95a910eb8f25466cfd8041e1d2cad9d6f86d8d6b43a4cb9af37ad791dc167693b10a2b2b0d6c72829219c9ae60dbada2aba397c5412566d8b0752287bb8088ba',
  'ADMIN',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE
SET "passwordHash" = EXCLUDED."passwordHash",
    "role" = 'ADMIN',
    "updatedAt" = CURRENT_TIMESTAMP;
