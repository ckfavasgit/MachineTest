export type LeaveType = 'Annual' | 'Sick' | 'Casual' | 'Unpaid'

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type LeaveApplication = {
  id: string
  employeeName: string
  leaveType: LeaveType
  startDate: string // yyyy-mm-dd
  endDate: string // yyyy-mm-dd (same as startDate for half-day)
  halfDay: boolean
  durationDays: number // 0.5, 1, 2, ...
  reason: string
  documentName?: string
  remainingLeaveBalanceDays: number
  status: LeaveStatus
  createdAt: string // ISO string
}

export type WizardStep = 1 | 2

export type WizardState = {
  step: WizardStep
  leaveType: LeaveType | ''
  startDate: string
  endDate: string
  halfDay: boolean
  reason: string
  document?: File
  step1Errors: Partial<Record<'leaveType' | 'startDate' | 'endDate', string>>
  step2Errors: Partial<Record<'reason', string>>
  canGoToStep2: boolean
  isSubmitting: boolean
}

export type LeaveAction =
  | { type: 'SET_LEAVE_TYPE'; leaveType: WizardState['leaveType'] }
  | { type: 'SET_START_DATE'; startDate: string }
  | { type: 'SET_END_DATE'; endDate: string }
  | { type: 'TOGGLE_HALF_DAY'; halfDay: boolean }
  | { type: 'SET_REASON'; reason: string }
  | { type: 'SET_DOCUMENT'; document?: File }
  | {
      type: 'SET_STEP1_VALIDATION'
      canGoToStep2: boolean
      errors: WizardState['step1Errors']
    }
  | { type: 'SET_STEP2_VALIDATION'; errors: WizardState['step2Errors'] }
  | { type: 'GO_TO_STEP'; step: WizardStep }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_END'; resetTo: WizardState }

