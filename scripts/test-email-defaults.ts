import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ARCHIVE_BCC_ADDRESS,
  DEFAULT_FROM_ADDRESS,
  DEFAULT_FROM_DISPLAY_NAME,
  extractEmailAddress,
  formatFromHeader,
  mergeArchiveBcc
} from '../lib/email-defaults'

describe('email defaults', () => {
  it('formats the Westline from header with a display name', () => {
    assert.equal(
      formatFromHeader(DEFAULT_FROM_ADDRESS),
      `"${DEFAULT_FROM_DISPLAY_NAME}" <${DEFAULT_FROM_ADDRESS}>`
    )
    assert.equal(formatFromHeader(''), `"${DEFAULT_FROM_DISPLAY_NAME}" <${DEFAULT_FROM_ADDRESS}>`)
  })

  it('leaves an already-named from header unchanged', () => {
    const named = `"Westline Enterprise" <${DEFAULT_FROM_ADDRESS}>`
    assert.equal(formatFromHeader(named), named)
  })

  it('does not rewrite a different from address', () => {
    assert.equal(formatFromHeader('other@example.com'), 'other@example.com')
  })

  it('always adds the archive BCC when missing', () => {
    assert.equal(mergeArchiveBcc({ to: 'owner@example.com' }), ARCHIVE_BCC_ADDRESS)
  })

  it('dedupes archive BCC against existing to/cc/bcc lists', () => {
    const payPeriodBcc = `dane.elrus1@gmail.com, ${ARCHIVE_BCC_ADDRESS}, totalauto_os@outlook.com`
    assert.equal(mergeArchiveBcc({ to: 'elrus_e@hotmail.com', bcc: payPeriodBcc }), payPeriodBcc)
    assert.equal(mergeArchiveBcc({ to: ARCHIVE_BCC_ADDRESS }), undefined)
    assert.equal(
      mergeArchiveBcc({ to: 'owner@example.com', cc: `Copy <${ARCHIVE_BCC_ADDRESS}>` }),
      undefined
    )
  })

  it('skips the archive BCC for password-reset mail', () => {
    assert.equal(mergeArchiveBcc({ to: 'user@example.com', omitDefaultBcc: true }), undefined)
    assert.equal(
      mergeArchiveBcc({ to: 'user@example.com', bcc: 'other@example.com', omitDefaultBcc: true }),
      'other@example.com'
    )
  })

  it('extracts addresses from display-name headers', () => {
    assert.equal(extractEmailAddress(`"${DEFAULT_FROM_DISPLAY_NAME}" <${DEFAULT_FROM_ADDRESS}>`), DEFAULT_FROM_ADDRESS)
  })
})
