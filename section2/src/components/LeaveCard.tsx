import type { LeaveApplication } from '../types/leave'

type Props = {
  application: LeaveApplication
  actions?:
    | {
        approveLabel?: string
        rejectLabel?: string
        onApprove: () => void
        onReject: () => void
        disabled?: boolean
      }
    | undefined
}

export function LeaveCard({ application, actions }: Props) {
  return (
    <article className="card">
      <div className="cardTop">
        <div>
          <div className="cardTitle">{application.employeeName}</div>
          <div className="cardMeta">
            {application.leaveType} • {application.durationDays} day(s) • Remaining:{' '}
            {application.remainingLeaveBalanceDays}
          </div>
          <div className="cardMeta">
            {application.startDate}
            {application.halfDay ? ' (Half Day)' : ` → ${application.endDate}`}
          </div>
        </div>
        <span className={`badge badge--${application.status.toLowerCase()}`}>
          {application.status}
        </span>
      </div>

      <div className="cardBody">{application.reason}</div>

      {application.documentName ? (
        <div className="cardMeta">Document: {application.documentName}</div>
      ) : null}

      {actions ? (
        <div className="cardActions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={actions.onApprove}
            disabled={actions.disabled}
          >
            {actions.approveLabel ?? 'Approve'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={actions.onReject}
            disabled={actions.disabled}
          >
            {actions.rejectLabel ?? 'Reject'}
          </button>
        </div>
      ) : null}
    </article>
  )
}

