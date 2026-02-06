import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { MonthlyReportData } from './types'

export function exportToPDF(data: MonthlyReportData) {
  const doc = new jsPDF('portrait', 'in', 'letter')
  const pageWidth = 8.5
  const pageHeight = 11
  const margin = 0.5
  const contentWidth = pageWidth - (margin * 2)
  let yPosition = margin

  // Helper functions
  const formatCurrency = (num: number): string => {
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const formatNumber = (num: number): string => {
    return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const formatDateShort = (dateStr: string): string => {
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
  }

  const addNewPageIfNeeded = (requiredHeight: number) => {
    if (yPosition + requiredHeight > pageHeight - margin) {
      doc.addPage()
      yPosition = margin
      return true
    }
    return false
  }

  // Title
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(`Monthly Report - ${data.monthName} ${data.year}`, margin, yPosition)
  yPosition += 0.3

  // Executive Summary Section
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Executive Summary', margin, yPosition)
  yPosition += 0.2

  // Period Overview
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Period Overview', margin, yPosition)
  yPosition += 0.15

  doc.setFont('helvetica', 'normal')
  const periodData = [
    ['Total Days', data.period.totalDays.toString()],
    ['Working Days', data.period.workingDays.toString()],
    ['Complete Days', data.period.completeDays.toString()],
    ['Incomplete Days', data.period.incompleteDays.toString()]
  ]
  
  autoTable(doc, {
    startY: yPosition,
    head: [['Metric', 'Value']],
    body: periodData,
    theme: 'grid',
    headStyles: { fillColor: [200, 200, 200] },
    margin: { left: margin, right: margin },
    styles: { fontSize: 9 }
  })
  
  yPosition = (doc as any).lastAutoTable.finalY + 0.2
  addNewPageIfNeeded(1)

  // Financial Totals
  doc.setFont('helvetica', 'bold')
  doc.text('Financial Totals', margin, yPosition)
  yPosition += 0.15

  const financialData = [
    ['Total Deposits', `$${formatCurrency(data.summary.totalDeposits)}`],
    ['Debit & Credit', `$${formatCurrency(data.summary.debitAndCredit)}`],
    ['Fleet Revenue', `$${formatCurrency(data.summary.fleet)}`],
    ['Vouchers/Coupons', `$${formatCurrency(data.summary.vouchers)}`],
    ['Grand Total', `$${formatCurrency(data.summary.grandTotal)}`]
  ]

  autoTable(doc, {
    startY: yPosition,
    head: [['Category', 'Amount']],
    body: financialData,
    theme: 'grid',
    headStyles: { fillColor: [200, 200, 200] },
    margin: { left: margin, right: margin },
    styles: { fontSize: 9 }
  })

  yPosition = (doc as any).lastAutoTable.finalY + 0.2
  addNewPageIfNeeded(1)

  // Operational Metrics
  doc.setFont('helvetica', 'bold')
  doc.text('Operational Metrics', margin, yPosition)
  yPosition += 0.15

  const operationalData = [
    ['Total Shifts', data.summary.totalShifts.toString()],
    ['Draft Shifts', data.summary.draftShifts.toString()],
    ['Unleaded Sales', formatNumber(data.summary.unleaded)],
    ['Diesel Sales', formatNumber(data.summary.diesel)]
  ]

  autoTable(doc, {
    startY: yPosition,
    head: [['Metric', 'Value']],
    body: operationalData,
    theme: 'grid',
    headStyles: { fillColor: [200, 200, 200] },
    margin: { left: margin, right: margin },
    styles: { fontSize: 9 }
  })

  yPosition = (doc as any).lastAutoTable.finalY + 0.3
  addNewPageIfNeeded(2)

  // Daily Financial Breakdown
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Daily Financial Breakdown', margin, yPosition)
  yPosition += 0.2

  const dailyHeaders = [
    'Date',
    'Dep 1', 'Dep 2', 'Dep 3', 'Dep 4', 'Dep 5', 'Dep 6',
    'Total Dep',
    'Credit',
    'Debit',
    'Unleaded',
    'Diesel',
    'Revenue',
    'Over/Short'
  ]

  const dailyRows = data.dailyBreakdown.map(day => [
    formatDateShort(day.date),
    formatCurrency(day.deposits[0] || 0),
    formatCurrency(day.deposits[1] || 0),
    formatCurrency(day.deposits[2] || 0),
    formatCurrency(day.deposits[3] || 0),
    formatCurrency(day.deposits[4] || 0),
    formatCurrency(day.deposits[5] || 0),
    formatCurrency(day.totalDeposits),
    formatCurrency(day.creditTotal),
    formatCurrency(day.debitTotal),
    formatNumber(day.unleaded),
    formatNumber(day.diesel),
    formatCurrency(day.totalRevenue),
    formatCurrency(day.overShortTotal)
  ])

  // Calculate totals
  const totals = data.dailyBreakdown.reduce(
    (acc, day) => ({
      totalDeposits: acc.totalDeposits + day.totalDeposits,
      creditTotal: acc.creditTotal + day.creditTotal,
      debitTotal: acc.debitTotal + day.debitTotal,
      unleaded: acc.unleaded + day.unleaded,
      diesel: acc.diesel + day.diesel,
      totalRevenue: acc.totalRevenue + day.totalRevenue,
      overShortTotal: acc.overShortTotal + day.overShortTotal
    }),
    {
      totalDeposits: 0,
      creditTotal: 0,
      debitTotal: 0,
      unleaded: 0,
      diesel: 0,
      totalRevenue: 0,
      overShortTotal: 0
    }
  )

  const totalsRow = [
    'TOTAL',
    '-', '-', '-', '-', '-', '-',
    formatCurrency(totals.totalDeposits),
    formatCurrency(totals.creditTotal),
    formatCurrency(totals.debitTotal),
    formatNumber(totals.unleaded),
    formatNumber(totals.diesel),
    formatCurrency(totals.totalRevenue),
    formatCurrency(totals.overShortTotal)
  ]

  autoTable(doc, {
    startY: yPosition,
    head: [dailyHeaders],
    body: [...dailyRows, totalsRow],
    theme: 'grid',
    headStyles: { fillColor: [200, 200, 200], fontStyle: 'bold' },
    bodyStyles: { fontSize: 7 },
    margin: { left: margin, right: margin },
    styles: { cellPadding: 0.05 },
    didParseCell: (data: any) => {
      if (data.row.index === dailyRows.length && data.column.index === 0) {
        data.cell.styles.fontStyle = 'bold'
      }
      if (data.row.index === dailyRows.length) {
        data.cell.styles.fontStyle = 'bold'
      }
    }
  })

  yPosition = (doc as any).lastAutoTable.finalY + 0.3
  doc.addPage()
  yPosition = margin

  // Over/Short Analysis
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Over/Short Analysis', margin, yPosition)
  yPosition += 0.2

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Summary Statistics', margin, yPosition)
  yPosition += 0.15

  const overShortData = [
    ['Total Over/Short', `$${formatCurrency(data.overShortAnalysis.totalOverShort)}`],
    ['Average per Shift', `$${formatCurrency(data.overShortAnalysis.averageOverShort)}`],
    ['Shifts with Discrepancy', data.overShortAnalysis.shiftsWithOverShort.toString()],
    ['Shifts Balanced', data.overShortAnalysis.shiftsWithZeroOverShort.toString()],
    ['Largest Over', `$${formatCurrency(data.overShortAnalysis.largestOver)}`],
    ['Largest Short', `$${formatCurrency(data.overShortAnalysis.largestShort)}`]
  ]

  autoTable(doc, {
    startY: yPosition,
    head: [['Metric', 'Value']],
    body: overShortData,
    theme: 'grid',
    headStyles: { fillColor: [200, 200, 200] },
    margin: { left: margin, right: margin },
    styles: { fontSize: 9 }
  })

  yPosition = (doc as any).lastAutoTable.finalY + 0.3
  addNewPageIfNeeded(2)

  // Significant Discrepancies
  if (data.overShortAnalysis.significantDiscrepancies.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.text('Significant Discrepancies (Over $100)', margin, yPosition)
    yPosition += 0.15

    const discrepancyHeaders = ['Date', 'Shift', 'Supervisor', 'Over/Short', 'Explained', 'Explanation']
    const discrepancyRows = data.overShortAnalysis.significantDiscrepancies.map(d => [
      formatDateShort(d.date),
      d.shift,
      d.supervisor,
      formatCurrency(d.overShortTotal),
      d.overShortExplained ? 'Yes' : 'No',
      d.overShortExplanation || 'No explanation'
    ])

    autoTable(doc, {
      startY: yPosition,
      head: [discrepancyHeaders],
      body: discrepancyRows,
      theme: 'grid',
      headStyles: { fillColor: [200, 200, 200], fontStyle: 'bold' },
      margin: { left: margin, right: margin },
      styles: { fontSize: 8 },
      columnStyles: {
        5: { cellWidth: 'auto' }
      }
    })

    yPosition = (doc as any).lastAutoTable.finalY + 0.3
    addNewPageIfNeeded(1)
  }

  // Supervisor Performance
  if (data.supervisorPerformance.length > 0) {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Supervisor Performance', margin, yPosition)
    yPosition += 0.2

    const supervisorHeaders = ['Supervisor', 'Shifts', 'Total Revenue', 'Avg Revenue', 'Avg Over/Short', 'Discrepancies']
    const supervisorRows = data.supervisorPerformance.map(sup => [
      sup.name,
      sup.shifts.toString(),
      `$${formatCurrency(sup.totalRevenue)}`,
      `$${formatCurrency(sup.averageRevenue)}`,
      `$${formatCurrency(sup.averageOverShort)}`,
      sup.shiftsWithDiscrepancy.toString()
    ])

    autoTable(doc, {
      startY: yPosition,
      head: [supervisorHeaders],
      body: supervisorRows,
      theme: 'grid',
      headStyles: { fillColor: [200, 200, 200], fontStyle: 'bold' },
      margin: { left: margin, right: margin },
      styles: { fontSize: 8 }
    })
  }

  // Save PDF
  doc.save(`monthly-report-${data.year}-${String(data.month).padStart(2, '0')}.pdf`)
}

