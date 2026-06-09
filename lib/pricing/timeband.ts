import { formatInTimeZone } from 'date-fns-tz'
import type { TransferRateBandInput } from './types'

export interface LocalMoment {
  /** Jour de la semaine, 0 = dimanche … 6 = samedi (dans le fuseau du chauffeur). */
  dayOfWeek: number
  /** Minute dans la journée locale (0..1439). */
  minuteOfDay: number
}

/** Extrait le jour de semaine et la minute du jour dans le fuseau horaire donné. */
export function localMoment(date: Date, timezone: string): LocalMoment {
  // 'i' = jour ISO (1 = lundi … 7 = dimanche). On convertit en 0 = dimanche.
  const isoDow = Number(formatInTimeZone(date, timezone, 'i'))
  const dayOfWeek = isoDow === 7 ? 0 : isoDow
  const hours = Number(formatInTimeZone(date, timezone, 'H'))
  const minutes = Number(formatInTimeZone(date, timezone, 'm'))
  return { dayOfWeek, minuteOfDay: hours * 60 + minutes }
}

/** Vrai si la minute (0..1439) est couverte par la plage [start, end), gérant le passage à minuit. */
export function minuteInRange(minute: number, startMinute: number, endMinute: number): boolean {
  if (endMinute <= 1440) {
    return minute >= startMinute && minute < endMinute
  }
  // Plage qui chevauche minuit (ex: 1320 → 1800 = 22h00 → 06h00) :
  // couvre [start, 1440) puis [0, end-1440).
  return minute >= startMinute || minute < endMinute - 1440
}

/** Vrai si la bande couvre ce jour de semaine (liste vide = tous les jours). */
function bandCoversDay(band: TransferRateBandInput, dayOfWeek: number): boolean {
  return band.daysOfWeek.length === 0 || band.daysOfWeek.includes(dayOfWeek)
}

/**
 * Sélectionne la bande tarifaire applicable à un instant donné.
 * Règle : parmi les bandes couvrant le jour ET l'heure, on prend la priorité la plus haute.
 * À défaut, on prend la bande marquée `isDefault`. Renvoie `null` si rien ne s'applique.
 */
export function selectBand(
  bands: TransferRateBandInput[],
  date: Date,
  timezone: string,
): TransferRateBandInput | null {
  const { dayOfWeek, minuteOfDay } = localMoment(date, timezone)

  const matching = bands
    .filter(
      (b) =>
        bandCoversDay(b, dayOfWeek) && minuteInRange(minuteOfDay, b.startMinute, b.endMinute),
    )
    .sort((a, b) => b.priority - a.priority)

  if (matching.length > 0) return matching[0]

  const fallback = bands.find((b) => b.isDefault)
  return fallback ?? null
}
