function usDateInMonth(value, year, month) {
  const text = String(value || '').trim()
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) {
    return Number(us[3]) === Number(year) && Number(us[1]) === Number(month)
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!iso) return false
  return Number(iso[1]) === Number(year) && Number(iso[2]) === Number(month)
}

module.exports = { usDateInMonth }
