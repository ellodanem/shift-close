/**
 * One-time migration: copy data from local SQLite (prisma/shiftclose.db) to Neon Postgres.
 * Run from project root with: DATABASE_URL set to your Neon URL, and prisma/shiftclose.db present.
 *
 * Usage: node scripts/migrate-sqlite-to-neon.js
 * Requires: npm install --save-dev sql.js dotenv
 */

require('dotenv').config()
const path = require('path')
const fs = require('fs')

const sqlitePath = path.join(__dirname, '..', 'prisma', 'shiftclose.db')
if (!fs.existsSync(sqlitePath)) {
  console.error('SQLite file not found at prisma/shiftclose.db. Nothing to migrate.')
  process.exit(1)
}

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.startsWith('postgres')) {
  console.error('DATABASE_URL must be set to your Neon Postgres connection string (e.g. in .env).')
  process.exit(1)
}

const initSqlJs = require('sql.js')
const { PrismaClient } = require('@prisma/client')

function snakeToCamel (str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

const dateTimeColumns = new Set([
  'created_at', 'updated_at', 'uploaded_at', 'invoice_date', 'due_date',
  'simulation_date', 'payment_date', 'imported_at',
  'createdAt', 'updatedAt', 'uploadedAt', 'invoiceDate', 'dueDate',
  'simulationDate', 'paymentDate', 'importedAt'
])

function rowToCamel (row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    const key = snakeToCamel(k)
    if (v === null || v === undefined) {
      out[key] = v
      continue
    }
    if (typeof v === 'number' && (k === 'has_missing_hard_copy_data' || k === 'over_short_explained')) {
      out[key] = v === 1
      continue
    }
    if (typeof v === 'number' && dateTimeColumns.has(k)) {
      out[key] = new Date(v)
      continue
    }
    if (typeof v === 'string' && dateTimeColumns.has(k) && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      out[key] = new Date(v)
      continue
    }
    out[key] = v
  }
  return out
}

function execToRows (db, sql) {
  const result = db.exec(sql)
  if (!result.length || !result[0].values.length) return []
  const { columns, values } = result[0]
  return values.map(row => {
    const obj = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj
  })
}

const tableOrder = [
  'staff',
  'staff_document',
  'shift_close',
  'corrections',
  'note_history',
  'historical_fuel_data',
  'invoices',
  'invoice_corrections',
  'payment_simulations',
  'balances',
  'payment_batches',
  'paid_invoices',
  'payment_corrections',
  'customer_ar_summary',
  'customer_ar_account_snapshots'
]

const modelByTable = {
  staff: 'staff',
  staff_document: 'staffDocument',
  shift_close: 'shiftClose',
  corrections: 'correction',
  note_history: 'noteHistory',
  historical_fuel_data: 'historicalFuelData',
  invoices: 'invoice',
  invoice_corrections: 'invoiceCorrection',
  payment_simulations: 'paymentSimulation',
  balances: 'balance',
  payment_batches: 'paymentBatch',
  paid_invoices: 'paidInvoice',
  payment_corrections: 'paymentCorrection',
  customer_ar_summary: 'customerArSummary',
  customer_ar_account_snapshots: 'customerArAccountSnapshot'
}

async function main () {
  const SQL = await initSqlJs()
  const fileBuffer = fs.readFileSync(sqlitePath)
  const db = new SQL.Database(new Uint8Array(fileBuffer))
  const prisma = new PrismaClient()

  try {
    const tablesInDb = execToRows(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .map(r => r.name)

    let invoiceIdToPaidId = []

    for (const table of tableOrder) {
      if (!tablesInDb.includes(table)) {
        console.log(`Skip ${table} (not in SQLite)`)
        continue
      }
      const model = modelByTable[table]
      const rows = execToRows(db, `SELECT * FROM ${table}`)
      if (rows.length === 0) {
        console.log(`${table}: 0 rows`)
        continue
      }
      const data = rows.map(row => rowToCamel(row))

      if (table === 'invoices') {
        invoiceIdToPaidId = data.filter(r => r.paidInvoiceId).map(r => ({ id: r.id, paidInvoiceId: r.paidInvoiceId }))
        data.forEach(r => { delete r.paidInvoiceId })
      }

      try {
        await prisma[model].createMany({ data, skipDuplicates: true })
        console.log(`${table}: ${rows.length} rows`)
      } catch (err) {
        console.error(`${table} error:`, err.message)
        throw err
      }
    }

    if (invoiceIdToPaidId.length > 0) {
      for (const { id, paidInvoiceId } of invoiceIdToPaidId) {
        await prisma.invoice.update({
          where: { id },
          data: { paidInvoiceId }
        })
      }
      console.log(`Updated ${invoiceIdToPaidId.length} invoices with paid_invoice_id`)
    }

    console.log('Migration done.')
  } finally {
    db.close()
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
