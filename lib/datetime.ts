// Formatage des horaires de course — TOUJOURS dans le fuseau du chauffeur (le
// lieu de prise en charge), qui fait foi. Les instants sont stockés en UTC ;
// leur rendu doit être ancré sur `driver.timezone` partout (emails, notifications,
// pages client, espace chauffeur) et accompagné d'un libellé explicite
// (« heure de Paris ») pour qu'un client dans un autre fuseau ne soit pas induit
// en erreur. Source unique — ne jamais reformater une date de course « à la main ».

export type SupportedLocale = 'fr' | 'en'

function intlLocale(locale: SupportedLocale): string {
  return locale === 'en' ? 'en-GB' : 'fr-FR'
}

/** Ville extraite d'un identifiant IANA (« Europe/Paris » → « Paris »). */
export function timezoneCity(timeZone: string): string {
  return (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ')
}

/** Libellé lisible du fuseau (« heure de Paris » / « Paris time »). */
export function timezoneLabel(timeZone: string, locale: SupportedLocale = 'fr'): string {
  const city = timezoneCity(timeZone)
  return locale === 'en' ? `${city} time` : `heure de ${city}`
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * Date + heure d'une course dans le fuseau du chauffeur, avec libellé de fuseau
 * (ex : « 24 juillet 2026 à 11:30 (heure de Paris) »). `withZone: false` retire
 * le libellé (sujets d'emails, contextes déjà explicites).
 */
export function formatRideDateTime(
  value: Date | string,
  timeZone: string,
  locale: SupportedLocale = 'fr',
  opts: { withZone?: boolean } = {},
): string {
  const s = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone,
  }).format(toDate(value))
  return opts.withZone === false ? s : `${s} (${timezoneLabel(timeZone, locale)})`
}

/** Date seule (sans heure) dans le fuseau du chauffeur. */
export function formatRideDate(
  value: Date | string,
  timeZone: string,
  locale: SupportedLocale = 'fr',
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'long', timeZone }).format(
    toDate(value),
  )
}

/** Heure seule (HH:MM) dans le fuseau du chauffeur. */
export function formatRideTime(
  value: Date | string,
  timeZone: string,
  locale: SupportedLocale = 'fr',
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(toDate(value))
}
