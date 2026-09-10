/** Saint Lucia banks for staff payroll dropdowns, grouped for display order. */

export type BankGroup = {
  label: string
  banks: string[]
}

export const SAINT_LUCIA_BANK_GROUPS: BankGroup[] = [
  {
    label: 'Commercial Banks',
    banks: [
      '1st National Bank Saint Lucia Limited',
      'Bank of Saint Lucia Ltd.',
      'CIBC Caribbean Bank Limited (formerly CIBC FirstCaribbean)',
      'Republic Bank (EC) Ltd.'
    ]
  },
  {
    label: 'Credit Unions',
    banks: [
      'Choiseul Co-operative Credit Union',
      'Dennery Community Co-operative Credit Union',
      'Elks City of Castries Co-operative Credit Union',
      'Fond St. Jacques Co-operative Credit Union',
      'Jannou Credit Union (formerly St. Lucia Civil Service)',
      'Laborie Co-operative Credit Union',
      'Mabouya Valley Co-operative Credit Union',
      'Mon Repos Eastern Co-operative Credit Union',
      'National Farmers & General Workers',
      'Royal St. Lucia Police and Allied Services',
      'Saltibus Co-operative Credit Union',
      'Saint Lucia Hospitality Industry Workers',
      'Seventh Day Adventist Credit Union',
      'St. Lucia Teachers Co-operative Credit Union',
      "St. Lucia Workers' Credit Co-operative Society"
    ]
  },
  {
    label: 'International Banks',
    banks: [
      'PROVEN Bank (Saint Lucia) Limited',
      'Bank of Saint Lucia International Limited',
      'Berkeley Bank & Trust Limited',
      'Euro Exim Bank Limited',
      'Petrus Private Bank Limited',
      'Hermes Bank Limited',
      'Arbiter Bank International (St. Lucia) Ltd.',
      'First Citizens Financial Services (St. Lucia) Limited',
      'Atlantic Financial Limited'
    ]
  }
]

export const SAINT_LUCIA_BANK_NAMES: string[] = SAINT_LUCIA_BANK_GROUPS.flatMap((g) => g.banks)

export function isKnownSaintLuciaBank(name: string): boolean {
  return SAINT_LUCIA_BANK_NAMES.includes(name)
}
