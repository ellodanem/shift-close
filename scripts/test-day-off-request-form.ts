import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dayOffRequestFormHtml } from '../lib/day-off-request-form-print'

describe('day off request form', () => {
  it('prints the blank paper form staff fill in by hand', () => {
    const html = dayOffRequestFormHtml()
    assert.match(html, /Day\/Days off request form/)
    assert.match(html, /Date:/)
    assert.match(html, /Name:/)
    assert.match(html, /Requested Day\(s\) OFF Date\(s\)/)
    assert.match(html, /Reason for request:/)
    assert.match(html, /Submitted to:/)
    assert.match(html, /Employee signature/)
    assert.match(html, /Approved/)
    assert.match(html, />Yes </)
    assert.match(html, />No </)
    assert.match(html, /Comments:/)
    assert.equal(html.match(/<tr><td><\/td><\/tr>/g)?.length, 4)
    assert.equal(html.match(/class="rule"/g)?.length, 2 + 5 + 2)
    assert.equal(html.match(/class="check"/g)?.length, 2)
  })
})
