/** Default recipients when emailing a saved pay period report from Attendance → Pay Period. */
export const PAY_PERIOD_REPORT_DEFAULT_RECIPIENTS = [
  'elrus_e@hotmail.com',
  'elcock@totalauto758.com'
] as const

export function payPeriodReportDefaultTo(): string {
  return PAY_PERIOD_REPORT_DEFAULT_RECIPIENTS.join(', ')
}
