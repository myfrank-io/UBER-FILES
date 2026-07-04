// Helpers de formatage côté client, alignés sur la langue active (FR/EN sur les
// pages client ; l'espace chauffeur reste en français, locale par défaut).
export function useFormat() {
  const { locale } = useI18n()
  const intlLocale = computed(() => (locale.value === 'en' ? 'en-GB' : 'fr-FR'))

  const formatMoney = (cents: number, currency = 'eur') =>
    new Intl.NumberFormat(intlLocale.value, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100)

  const formatDateTime = (value: string | Date) =>
    new Date(value).toLocaleString(intlLocale.value, { dateStyle: 'long', timeStyle: 'short' })

  return { formatMoney, formatDateTime }
}
