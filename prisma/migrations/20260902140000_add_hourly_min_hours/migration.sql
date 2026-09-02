-- Durée minimale d'une mise à disposition, choisie par le chauffeur.
-- NULL = pas de minimum (comportement existant : 1 h).
ALTER TABLE "Driver" ADD COLUMN "hourlyMinHours" INTEGER;
