import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const upcoming: Array<{
      type: 'birthday' | 'invoice' | 'contract' | 'other'
      title: string
      date: string
      daysUntil: number
      priority: 'high' | 'medium' | 'low'
      reminderId?: string
    }> = []

    // Get staff birthdays within the next 7 days
    const today = new Date()
    const nextWeek = new Date(today)
    nextWeek.setDate(today.getDate() + 7)
    
    const staff = await prisma.staff.findMany({
      where: {
        dateOfBirth: { not: null },
        status: 'active'
      },
      select: {
        id: true,
        name: true,
        dateOfBirth: true
      }
    })

    staff.forEach(member => {
      if (!member.dateOfBirth) return
      
      // Parse the date of birth (YYYY-MM-DD format)
      const [year, month, day] = member.dateOfBirth.split('-').map(Number)
      if (!year || !month || !day) return
      
      // Create this year's birthday
      const thisYearBirthday = new Date(today.getFullYear(), month - 1, day)
      
      // If birthday already passed this year, use next year
      if (thisYearBirthday < today) {
        thisYearBirthday.setFullYear(today.getFullYear() + 1)
      }
      
      // Check if birthday is within the next 7 days
      const daysUntil = Math.ceil((thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysUntil >= 0 && daysUntil <= 7) {
        const y = thisYearBirthday.getFullYear()
        const m = String(thisYearBirthday.getMonth() + 1).padStart(2, '0')
        const d = String(thisYearBirthday.getDate()).padStart(2, '0')
        upcoming.push({
          type: 'birthday',
          title: `${member.name}'s Birthday`,
          date: `${y}-${m}-${d}`,
          daysUntil,
          priority: daysUntil <= 3 ? 'high' : daysUntil <= 5 ? 'medium' : 'low'
        })
      }
    })

    // TODO: Add invoice due dates when invoice/payables module is implemented
    // Example structure:
    // const invoices = await prisma.invoice.findMany({
    //   where: {
    //     dueDate: {
    //       gte: today.toISOString().split('T')[0],
    //       lte: nextWeek.toISOString().split('T')[0]
    //     },
    //     status: 'unpaid'
    //   }
    // })
    // invoices.forEach(invoice => {
    //   const daysUntil = Math.ceil((new Date(invoice.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    //   upcoming.push({
    //     type: 'invoice',
    //     title: `Invoice ${invoice.number} Due`,
    //     date: invoice.dueDate,
    //     daysUntil,
    //     priority: daysUntil <= 3 ? 'high' : daysUntil <= 5 ? 'medium' : 'low'
    //   })
    // })

    // Custom reminders within next 7 days (use local date to avoid timezone shift)
    const toLocalDateStr = (d: Date) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    const todayStr = toLocalDateStr(today)
    const nextWeekStr = toLocalDateStr(nextWeek)
    const reminders = await prisma.reminder.findMany({
      where: {
        date: { gte: todayStr, lte: nextWeekStr }
      },
      orderBy: { date: 'asc' }
    })
    reminders.forEach(reminder => {
      const daysUntil = Math.ceil((new Date(reminder.date + 'T12:00:00').getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntil >= 0 && daysUntil <= 7) {
        upcoming.push({
          type: 'other',
          title: reminder.title,
          date: reminder.date,
          daysUntil,
          priority: daysUntil <= 3 ? 'high' : daysUntil <= 5 ? 'medium' : 'low',
          reminderId: reminder.id
        })
      }
    })

    // TODO: Add contract end dates when contracts module is implemented
    // Example structure:
    // const contracts = await prisma.contract.findMany({
    //   where: {
    //     endDate: {
    //       gte: today.toISOString().split('T')[0],
    //       lte: nextWeek.toISOString().split('T')[0]
    //     }
    //   }
    // })
    // contracts.forEach(contract => {
    //   const daysUntil = Math.ceil((new Date(contract.endDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    //   upcoming.push({
    //     type: 'contract',
    //     title: `Contract ${contract.staffName} Expires`,
    //     date: contract.endDate,
    //     daysUntil,
    //     priority: daysUntil <= 3 ? 'high' : daysUntil <= 5 ? 'medium' : 'low'
    //   })
    // })

    // Sort by days until (soonest first), then by priority
    upcoming.sort((a, b) => {
      if (a.daysUntil !== b.daysUntil) {
        return a.daysUntil - b.daysUntil
      }
      const priorityOrder = { high: 1, medium: 2, low: 3 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })

    return NextResponse.json(upcoming)
  } catch (error) {
    console.error('Error fetching upcoming events:', error)
    return NextResponse.json({ error: 'Failed to fetch upcoming events' }, { status: 500 })
  }
}

