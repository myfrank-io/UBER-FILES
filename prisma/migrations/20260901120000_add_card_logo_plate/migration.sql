-- Pastille claire derrière le logo de la carte de visite : un logo sombre sur
-- fond transparent est illisible sur les thèmes sombres. Additif, avec valeur
-- par défaut : aucune carte existante n'est affectée.

-- AlterTable
ALTER TABLE "CardProfile" ADD COLUMN     "logoPlate" BOOLEAN NOT NULL DEFAULT false;
