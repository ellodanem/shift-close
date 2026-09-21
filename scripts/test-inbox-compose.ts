import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SAMPLE_INBOX_THREADS, buildComposeDraft } from '../lib/inbox-sample'

describe('buildComposeDraft', () => {
  const rubis = SAMPLE_INBOX_THREADS.find((t) => t.id === 'rubis')!

  it('reply addresses only the sender', () => {
    const draft = buildComposeDraft('reply', rubis)
    assert.equal(draft.to, 'accounts@rubis.example')
    assert.equal(draft.cc, '')
    assert.ok(draft.subject.startsWith('Re:'))
  })

  it('replyAll keeps peer recipients on cc', () => {
    const draft = buildComposeDraft('replyAll', rubis)
    assert.equal(draft.to, 'accounts@rubis.example')
    assert.ok(draft.cc.includes('fuel@rubis.example'))
    assert.ok(!draft.cc.includes('westline.slu@gmail.com'))
  })

  it('forward clears recipients and prefixes Fw', () => {
    const draft = buildComposeDraft('forward', rubis)
    assert.equal(draft.to, '')
    assert.equal(draft.cc, '')
    assert.ok(draft.subject.startsWith('Fw:'))
  })
})
