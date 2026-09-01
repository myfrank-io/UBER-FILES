// Compression d'images côté client avant envoi au serveur (photo de profil,
// photos de véhicules, carte de visite…). Le fichier est lu, redimensionné sur
// canvas puis ré-encodé en data URL — les photos de smartphone (plusieurs Mo)
// passent ainsi sous la barre acceptée par l'API.
export const MAX_PHOTO_SOURCE_BYTES = 15 * 1024 * 1024 // 15 Mo en entrée

export interface ResizeOptions {
  /**
   * Format de sortie. JPEG par défaut (le plus léger) — mais il APLATIT la
   * transparence en noir : un logo à fond transparent doit impérativement
   * sortir en PNG, sinon il arrive cerné d'un rectangle noir.
   */
  mimeType?: 'image/jpeg' | 'image/png'
}

export function resizeImageToDataUrl(
  file: File,
  maxDimension = 512,
  options: ResizeOptions = {},
): Promise<string> {
  const mimeType = options.mimeType ?? 'image/jpeg'
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error("Ce fichier n'est pas une image valide."))
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height))
        const width = Math.round(img.width * scale)
        const height = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Traitement de l’image impossible.'))
        ctx.drawImage(img, 0, 0, width, height)
        // La qualité est ignorée pour le PNG (compression sans perte).
        resolve(canvas.toDataURL(mimeType, 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
