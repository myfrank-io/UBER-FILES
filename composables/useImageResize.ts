// Compression d'images côté client avant envoi au serveur (photo de profil,
// photos de véhicules…). Le fichier est lu, redimensionné sur canvas puis
// ré-encodé en JPEG data URL — les photos de smartphone (plusieurs Mo) passent
// ainsi sous la barre acceptée par l'API.
export const MAX_PHOTO_SOURCE_BYTES = 15 * 1024 * 1024 // 15 Mo en entrée

export function resizeImageToDataUrl(file: File, maxDimension = 512): Promise<string> {
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
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
