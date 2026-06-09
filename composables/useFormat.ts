// Helpers de formatage côté client.
export function useFormat() {
  const formatMoney = (cents: number, currency = 'eur') =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency.toUpperCase() }).format(
      cents / 100,
    )

  const formatDateTime = (value: string | Date) =>
    new Date(value).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })

  return { formatMoney, formatDateTime }
}
