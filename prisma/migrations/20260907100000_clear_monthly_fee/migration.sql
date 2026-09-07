-- L'accès à Ridewiz se paie une seule fois à l'inscription : aucune mensualité.
-- Les comptes créés jusqu'ici portaient 4900 (49 €/mois), une valeur jamais
-- affichée ni facturée mais qui contredisait le modèle. Remise à 0, la valeur
-- par défaut du schéma. Non destructif : la colonne et les abonnements restent.

UPDATE "Subscription" SET "monthlyFeeCents" = 0 WHERE "monthlyFeeCents" <> 0;
