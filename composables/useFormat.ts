// Helpers de formatage côté client, alignés sur la langue active (FR/EN sur les
// pages client ; l'espace chauffeur reste en français, locale par défaut).
import { formatRideDateTime } from '~/lib/datetime'

export function useFormat() {
  const { locale } = useI18n()
  const intlLocale = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

  const formatMoney = (cents: number, currency = 'eur') =>
    new Intl.NumberFormat(intlLocale.value, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100)

  // Heure d'une course : quand un fuseau (celui du chauffeur / lieu de prise en
  // charge) est fourni, on l'ancre dessus et on ajoute le repère « (heure de … ) »
  // — sinon repli sur le fuseau du navigateur (usage hors course).
  const formatDateTime = (value: string | Date, timeZone?: string) =>
    timeZone
      ? formatRideDateTime(value, timeZone, locale.value === 'en' ? 'en' : 'fr')
      : new Date(value).toLocaleString(intlLocale.value, { dateStyle: 'long', timeStyle: 'short' })

  return { formatMoney, formatDateTime }
}
