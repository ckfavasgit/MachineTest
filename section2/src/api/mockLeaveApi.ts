import { calculateDurationDays } from '../utils/leaveMath'
import type { LeaveApplication, LeaveStatus, LeaveType } from '../types/leave'

type SubmitLeaveInput = {
  employeeName: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  halfDay: boolean
  reason: string
  documentName?: string
}

type ManagerQueue = {
  pending: LeaveApplication[]
  approved: LeaveApplication[]
  rejected: LeaveApplication[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function randomId(): string {
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}

function shouldFail(probability: number): boolean {
  return Math.random() < probability
}

type EmployeeBalance = Record<string, number>

const balances: EmployeeBalance = {
  'Asha (Employee)': 12,
  'Ravi (Employee)': 8,
  'You (Employee)': 10,
}

let db: LeaveApplication[] = seed()

function seed(): LeaveApplication[] {
  const now = new Date().toISOString()
  const mk = (p: {
    employeeName: string
    leaveType: LeaveType
    startDate: string
    endDate: string
    halfDay: boolean
    reason: string
    status: LeaveStatus
  }): LeaveApplication => {
    const durationDays = calculateDurationDays(p.startDate, p.endDate, p.halfDay)
    const remainingLeaveBalanceDays = Math.max(
      0,
      (balances[p.employeeName] ?? 10) - durationDays,
    )
    return {
      id: randomId(),
      employeeName: p.employeeName,
      leaveType: p.leaveType,
      startDate: p.startDate,
      endDate: p.endDate,
      halfDay: p.halfDay,
      durationDays,
      reason: p.reason,
      remainingLeaveBalanceDays,
      status: p.status,
      createdAt: now,
    }
  }

  return [
    mk({
      employeeName: 'Asha (Employee)',
      leaveType: 'Annual',
      startDate: '2026-04-29',
      endDate: '2026-04-30',
      halfDay: false,
      reason: 'Family function.',
      status: 'PENDING',
    }),
    mk({
      employeeName: 'Ravi (Employee)',
      leaveType: 'Sick',
      startDate: '2026-04-28',
      endDate: '2026-04-28',
      halfDay: true,
      reason: 'Doctor visit.',
      status: 'PENDING',
    }),
    mk({
      employeeName: 'Asha (Employee)',
      leaveType: 'Casual',
      startDate: '2026-04-22',
      endDate: '2026-04-22',
      halfDay: false,
      reason: 'Personal work.',
      status: 'APPROVED',
    }),
  ]
}

function toQueue(apps: LeaveApplication[]): ManagerQueue {
  const pending: LeaveApplication[] = []
  const approved: LeaveApplication[] = []
  const rejected: LeaveApplication[] = []
  for (const a of apps) {
    if (a.status === 'PENDING') pending.push(a)
    else if (a.status === 'APPROVED') approved.push(a)
    else rejected.push(a)
  }
  pending.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  approved.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  rejected.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return { pending, approved, rejected }
}

export async function fetchManagerQueue(): Promise<ManagerQueue> {
  await sleep(350)
  return toQueue(db)
}

export async function submitLeave(input: SubmitLeaveInput): Promise<LeaveApplication> {
  await sleep(500)

  const durationDays = calculateDurationDays(
    input.startDate,
    input.endDate,
    input.halfDay,
  )

  const currentBalance = balances[input.employeeName] ?? 10
  const remainingLeaveBalanceDays = Math.max(0, currentBalance - durationDays)

  const created: LeaveApplication = {
    id: randomId(),
    employeeName: input.employeeName,
    leaveType: input.leaveType,
    startDate: input.startDate,
    endDate: input.halfDay ? input.startDate : input.endDate,
    halfDay: input.halfDay,
    durationDays,
    reason: input.reason,
    documentName: input.documentName,
    remainingLeaveBalanceDays,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  }

  db = [created, ...db]
  return created
}

export async function approveLeave(id: string): Promise<LeaveApplication> {
  await sleep(450)
  if (shouldFail(0.25)) {
    throw new Error('Approval failed due to a network error.')
  }

  const idx = db.findIndex((a) => a.id === id)
  if (idx < 0) throw new Error('Leave request not found.')
  const app = db[idx]
  if (app.status !== 'PENDING') return app

  balances[app.employeeName] = Math.max(
    0,
    (balances[app.employeeName] ?? 10) - app.durationDays,
  )

  const updated: LeaveApplication = {
    ...app,
    status: 'APPROVED',
    remainingLeaveBalanceDays: balances[app.employeeName] ?? app.remainingLeaveBalanceDays,
  }
  db = [...db.slice(0, idx), updated, ...db.slice(idx + 1)]
  return updated
}

export async function rejectLeave(id: string): Promise<LeaveApplication> {
  await sleep(450)
  if (shouldFail(0.25)) {
    throw new Error('Rejection failed due to a network error.')
  }

  const idx = db.findIndex((a) => a.id === id)
  if (idx < 0) throw new Error('Leave request not found.')
  const app = db[idx]
  if (app.status !== 'PENDING') return app

  const updated: LeaveApplication = { ...app, status: 'REJECTED' }
  db = [...db.slice(0, idx), updated, ...db.slice(idx + 1)]
  return updated
}

