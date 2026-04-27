import { useMemo, useReducer } from 'react'
import { z } from 'zod'
import toast from 'react-hot-toast'
import type { LeaveAction, LeaveType, WizardState } from '../../types/leave'
import { submitLeave } from '../../api/mockLeaveApi'
import { calculateDurationDays, compareYyyyMmDd, isValidYyyyMmDd } from '../../utils/leaveMath'

const step1Schema = z
  .object({
    leaveType: z.enum(['Annual', 'Sick', 'Casual', 'Unpaid']),
    startDate: z
      .string()
      .refine((v) => isValidYyyyMmDd(v), { message: 'Start date is required.' }),
    endDate: z
      .string()
      .refine((v) => isValidYyyyMmDd(v), { message: 'End date is required.' }),
    halfDay: z.boolean(),
  })
  .superRefine((val, ctx) => {
    if (val.halfDay) return
    if (compareYyyyMmDd(val.endDate, val.startDate) < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date must be on or after start date.',
      })
    }
  })

const step2Schema = z.object({
  reason: z.string().trim().min(5, 'Reason must be at least 5 characters.'),
})

function buildInitialState(): WizardState {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const iso = `${yyyy}-${mm}-${dd}`

  return {
    step: 1,
    leaveType: '',
    startDate: iso,
    endDate: iso,
    halfDay: false,
    reason: '',
    document: undefined,
    step1Errors: {},
    step2Errors: {},
    canGoToStep2: false,
    isSubmitting: false,
  }
}

function reducer(state: WizardState, action: LeaveAction): WizardState {
  switch (action.type) {
    case 'SET_LEAVE_TYPE':
      return { ...state, leaveType: action.leaveType }
    case 'SET_START_DATE': {
      const nextStart = action.startDate
      const nextEnd = state.halfDay ? nextStart : state.endDate
      return { ...state, startDate: nextStart, endDate: nextEnd }
    }
    case 'SET_END_DATE':
      return state.halfDay ? state : { ...state, endDate: action.endDate }
    case 'TOGGLE_HALF_DAY': {
      const halfDay = action.halfDay
      return {
        ...state,
        halfDay,
        endDate: halfDay ? state.startDate : state.endDate,
      }
    }
    case 'SET_REASON':
      return { ...state, reason: action.reason }
    case 'SET_DOCUMENT':
      return { ...state, document: action.document }
    case 'SET_STEP1_VALIDATION':
      return {
        ...state,
        canGoToStep2: action.canGoToStep2,
        step1Errors: action.errors,
      }
    case 'SET_STEP2_VALIDATION':
      return { ...state, step2Errors: action.errors }
    case 'GO_TO_STEP': {
      if (action.step === 2 && !state.canGoToStep2) return state
      return { ...state, step: action.step }
    }
    case 'SUBMIT_START':
      return { ...state, isSubmitting: true }
    case 'SUBMIT_END':
      return action.resetTo
    default: {
      const _exhaustive: never = action
      void _exhaustive
      return state
    }
  }
}

function zodErrorsToMap(issues: z.ZodIssue[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !out[key]) out[key] = issue.message
  }
  return out
}

export function LeaveWizard() {
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState)

  const durationDays = useMemo(
    () => calculateDurationDays(state.startDate, state.endDate, state.halfDay),
    [state.startDate, state.endDate, state.halfDay],
  )

  const validateStep1 = (): boolean => {
    const parsed = step1Schema.safeParse({
      leaveType: state.leaveType,
      startDate: state.startDate,
      endDate: state.halfDay ? state.startDate : state.endDate,
      halfDay: state.halfDay,
    })

    if (!parsed.success) {
      const errs = zodErrorsToMap(parsed.error.issues)
      dispatch({
        type: 'SET_STEP1_VALIDATION',
        canGoToStep2: false,
        errors: {
          leaveType: errs.leaveType,
          startDate: errs.startDate,
          endDate: errs.endDate,
        },
      })
      return false
    }

    dispatch({ type: 'SET_STEP1_VALIDATION', canGoToStep2: true, errors: {} })
    return true
  }

  const validateStep2 = (): boolean => {
    const parsed = step2Schema.safeParse({ reason: state.reason })
    if (!parsed.success) {
      const errs = zodErrorsToMap(parsed.error.issues)
      dispatch({ type: 'SET_STEP2_VALIDATION', errors: { reason: errs.reason } })
      return false
    }
    dispatch({ type: 'SET_STEP2_VALIDATION', errors: {} })
    return true
  }

  const onNext = () => {
    if (!validateStep1()) {
      toast.error('Fix Step 1 errors to continue.')
      return
    }
    dispatch({ type: 'GO_TO_STEP', step: 2 })
  }

  const onBack = () => dispatch({ type: 'GO_TO_STEP', step: 1 })

  const onSubmit = async () => {
    if (!state.canGoToStep2) {
      toast.error('Complete Step 1 before submitting.')
      dispatch({ type: 'GO_TO_STEP', step: 1 })
      return
    }
    if (!validateStep2()) {
      toast.error('Fix Step 2 errors to submit.')
      return
    }

    dispatch({ type: 'SUBMIT_START' })
    try {
      const created = await submitLeave({
        employeeName: 'You (Employee)',
        leaveType: state.leaveType as LeaveType,
        startDate: state.startDate,
        endDate: state.halfDay ? state.startDate : state.endDate,
        halfDay: state.halfDay,
        reason: state.reason.trim(),
        documentName: state.document?.name,
      })
      toast.success(`Leave Application Submitted Successfully.`)
      dispatch({ type: 'SUBMIT_END', resetTo: buildInitialState() })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Submit failed.'
      toast.error(msg)
      dispatch({ type: 'SUBMIT_END', resetTo: { ...state, isSubmitting: false } })
    }
  }

  return (
    <section className="panel">
      <header className="panelHeader">
        <div>
          <h2 className="h2">Apply Leave</h2>
        </div>
        <div className="stepper">
          <span className={state.step === 1 ? 'step step--active' : 'step'}>1</span>
          <span className="stepDivider" />
          <span className={state.step === 2 ? 'step step--active' : 'step'}>2</span>
        </div>
      </header>

      {state.step === 1 ? (
        <div className="grid">
          <label className="field">
            <span className="label">Leave Type</span>
            <select
              className="input"
              value={state.leaveType}
              onChange={(e) =>
                dispatch({ type: 'SET_LEAVE_TYPE', leaveType: e.target.value as WizardState['leaveType'] })
              }
              onBlur={validateStep1}
            >
              <option value="">Select…</option>
              <option value="Annual">Annual</option>
              <option value="Sick">Sick</option>
              <option value="Casual">Casual</option>
              <option value="Unpaid">Unpaid</option>
            </select>
            {state.step1Errors.leaveType ? (
              <span className="error">{state.step1Errors.leaveType}</span>
            ) : null}
          </label>

          <label className="field">
            <span className="label">Start Date</span>
            <input
              className="input"
              type="date"
              value={state.startDate}
              onChange={(e) => dispatch({ type: 'SET_START_DATE', startDate: e.target.value })}
              onBlur={validateStep1}
            />
            {state.step1Errors.startDate ? (
              <span className="error">{state.step1Errors.startDate}</span>
            ) : null}
          </label>

          <label className="field">
            <span className="label">End Date</span>
            <input
              className="input"
              type="date"
              value={state.halfDay ? state.startDate : state.endDate}
              disabled={state.halfDay}
              onChange={(e) => dispatch({ type: 'SET_END_DATE', endDate: e.target.value })}
              onBlur={validateStep1}
            />
            {state.step1Errors.endDate ? (
              <span className="error">{state.step1Errors.endDate}</span>
            ) : null}
          </label>

          <label className="field field--row">
            <input
              type="checkbox"
              checked={state.halfDay}
              onChange={(e) => dispatch({ type: 'TOGGLE_HALF_DAY', halfDay: e.target.checked })}
              onBlur={validateStep1}
            />
            <span className="label">Half Day (locks duration to 0.5)</span>
          </label>

          <div className="summary">
            <div className="summaryRow">
              <span className="muted">Duration</span>
              <span className="pill">{durationDays} day(s)</span>
            </div>
            <div className="summaryRow">
              <span className="muted">Validation</span>
              <span className={state.canGoToStep2 ? 'pill pill--ok' : 'pill pill--warn'}>
                {state.canGoToStep2 ? 'Step 1 valid' : 'Fix errors'}
              </span>
            </div>
          </div>

          <div className="footer">
            <button type="button" className="btn btn--primary" onClick={onNext}>
              Next
            </button>
          </div>
        </div>
      ) : (
        <div className="grid">
          <label className="field field--full">
            <span className="label">Reason</span>
            <textarea
              className="input"
              value={state.reason}
              rows={4}
              onChange={(e) => dispatch({ type: 'SET_REASON', reason: e.target.value })}
              onBlur={validateStep2}
            />
            {state.step2Errors.reason ? (
              <span className="error">{state.step2Errors.reason}</span>
            ) : null}
          </label>

          <label className="field field--full">
            <span className="label">Optional document</span>
            <input
              className="input"
              type="file"
              onChange={(e) => dispatch({ type: 'SET_DOCUMENT', document: e.target.files?.[0] })}
            />
            <span className="muted">
              {state.document ? `Selected: ${state.document.name}` : 'No file selected.'}
            </span>
          </label>

          <div className="summary field--full">
            <div className="summaryRow">
              <span className="muted">Leave</span>
              <span className="pill">
                {state.leaveType || '—'} • {durationDays} day(s)
              </span>
            </div>
            <div className="summaryRow">
              <span className="muted">Dates</span>
              <span className="pill">
                {state.startDate}
                {state.halfDay ? ' (Half Day)' : ` → ${state.endDate}`}
              </span>
            </div>
          </div>

          <div className="footer">
            <button type="button" className="btn btn--ghost" onClick={onBack} disabled={state.isSubmitting}>
              Back
            </button>
            <button type="button" className="btn btn--primary" onClick={onSubmit} disabled={state.isSubmitting}>
              {state.isSubmitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

