import { forwardRef } from 'react'
import {
  buildExpectedRevenueShareModel,
  type ExpectedRevenueShareInput
} from '@/lib/expected-revenue-share'

type Props = {
  data: ExpectedRevenueShareInput
  depositsAndCardOnly: boolean
}

const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  padding: '10px 0',
  borderBottom: '1px solid #f3f4f6',
  fontSize: 16
} as const

const amountStyle = {
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 650
} as const

/** Off-screen card captured as the share PNG. Layout matches the approved preview. */
export const ExpectedRevenueShareCard = forwardRef<HTMLDivElement, Props>(
  function ExpectedRevenueShareCard({ data, depositsAndCardOnly }, ref) {
    const model = buildExpectedRevenueShareModel(data, depositsAndCardOnly)

    return (
      <div
        ref={ref}
        aria-hidden
        style={{
          position: 'fixed',
          left: -10000,
          top: 0,
          width: 640,
          background: '#ffffff',
          color: '#111827',
          fontFamily: '"Segoe UI", system-ui, sans-serif',
          borderRadius: 16,
          overflow: 'hidden'
        }}
      >
        <div style={{ background: '#064e3b', color: '#ecfdf5', padding: '22px 28px 20px' }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: '0.14em',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#a7f3d0'
            }}
          >
            Westline
          </div>
          <div
            style={{
              margin: '6px 0 0',
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: '-0.02em'
            }}
          >
            Expected revenue
          </div>
          <div style={{ marginTop: 8, fontSize: 15, color: '#d1fae5' }}>{model.rangeLine}</div>
        </div>
        <div style={{ padding: '22px 28px 26px' }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#047857'
            }}
          >
            Grand total
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              fontVariantNumeric: 'tabular-nums',
              color: '#022c22'
            }}
          >
            {model.grandTotal}
          </div>
          {model.excludedNote && (
            <div style={{ marginTop: 6, fontSize: 13, color: '#065f46' }}>{model.excludedNote}</div>
          )}
          <div style={{ marginTop: 18, borderTop: '1px solid #e5e7eb' }}>
            <div style={rowStyle}>
              <span>Deposits</span>
              <span style={amountStyle}>{model.deposits}</span>
            </div>
            <div style={rowStyle}>
              <span>Card</span>
              <span style={amountStyle}>{model.card}</span>
            </div>
            <div style={{ ...rowStyle, paddingLeft: 16, fontSize: 14, color: '#4b5563' }}>
              <span>Debit (system)</span>
              <span style={{ ...amountStyle, fontWeight: 600, color: '#374151' }}>{model.debit}</span>
            </div>
            <div style={{ ...rowStyle, paddingLeft: 16, fontSize: 14, color: '#4b5563' }}>
              <span>Credit (other)</span>
              <span style={{ ...amountStyle, fontWeight: 600, color: '#374151' }}>{model.credit}</span>
            </div>
            <div style={rowStyle}>
              <span>Fleet</span>
              <span style={amountStyle}>{model.fleet}</span>
            </div>
            <div style={rowStyle}>
              <span>Vouchers / coupons</span>
              <span style={amountStyle}>{model.vouchers}</span>
            </div>
          </div>
          {model.days && (
            <>
              <div
                style={{
                  marginTop: 18,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#6b7280'
                }}
              >
                By day
              </div>
              <div style={{ marginTop: 18, borderTop: '1px solid #e5e7eb' }}>
                {model.days.map((day) => (
                  <div key={day.date}>
                    <div style={rowStyle}>
                      <span>{day.date}</span>
                      <span style={amountStyle}>{day.total}</span>
                    </div>
                    <div
                      style={{
                        marginTop: -6,
                        paddingBottom: 10,
                        fontSize: 13,
                        color: '#6b7280',
                        borderBottom: '1px solid #f3f4f6'
                      }}
                    >
                      {day.detail}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }
)
