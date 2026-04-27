import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { approveLeave, fetchManagerQueue, rejectLeave } from '../../api/mockLeaveApi'
import { LeaveCard } from '../../components/LeaveCard'
import type { LeaveApplication } from '../../types/leave'

type ManagerQueue = Awaited<ReturnType<typeof fetchManagerQueue>>

const queueKey = ['managerQueue'] as const

function moveItem(
  queue: ManagerQueue,
  id: string,
  to: 'approved' | 'rejected',
): ManagerQueue {
  const idx = queue.pending.findIndex((p) => p.id === id)
  if (idx < 0) return queue
  const item = queue.pending[idx]
  const updated: LeaveApplication = {
    ...item,
    status: to === 'approved' ? 'APPROVED' : 'REJECTED',
  }

  return {
    pending: [...queue.pending.slice(0, idx), ...queue.pending.slice(idx + 1)],
    approved: to === 'approved' ? [updated, ...queue.approved] : queue.approved,
    rejected: to === 'rejected' ? [updated, ...queue.rejected] : queue.rejected,
  }
}

export function ApprovalQueue() {
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: queueKey,
    queryFn: fetchManagerQueue,
  })

  const approveMut = useMutation({
    mutationFn: (id: string) => approveLeave(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queueKey })
      const previous = qc.getQueryData<ManagerQueue>(queueKey)
      if (previous) qc.setQueryData<ManagerQueue>(queueKey, moveItem(previous, id, 'approved'))
      return { previous }
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(queueKey, ctx.previous)
      toast.error(err instanceof Error ? err.message : 'Approve failed.')
    },
    onSuccess: () => {
      toast.success('Approved.')
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: queueKey })
    },
  })

  const rejectMut = useMutation({
    mutationFn: (id: string) => rejectLeave(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queueKey })
      const previous = qc.getQueryData<ManagerQueue>(queueKey)
      if (previous) qc.setQueryData<ManagerQueue>(queueKey, moveItem(previous, id, 'rejected'))
      return { previous }
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(queueKey, ctx.previous)
      toast.error(err instanceof Error ? err.message : 'Reject failed.')
    },
    onSuccess: () => {
      toast.success('Rejected.')
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: queueKey })
    },
  })

  const disableActions = approveMut.isPending || rejectMut.isPending

  return (
    <section className="panel">
      <header className="panelHeader">
        <div>
          <h2 className="h2">Approval Queue</h2>
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => qc.invalidateQueries({ queryKey: queueKey })}
        >
          Refresh
        </button>
      </header>

      {isLoading ? <div className="muted">Loading…</div> : null}
      {isError ? <div className="error">Failed to load approvals.</div> : null}

      {data ? (
        <div className="columns">
          <div className="col">
            <h3 className="h3">Pending</h3>
            <div className="stack">
              {data.pending.length === 0 ? (
                <div className="muted">No pending requests.</div>
              ) : (
                data.pending.map((app) => (
                  <LeaveCard
                    key={app.id}
                    application={app}
                    actions={{
                      onApprove: () => approveMut.mutate(app.id),
                      onReject: () => rejectMut.mutate(app.id),
                      disabled: disableActions,
                    }}
                  />
                ))
              )}
            </div>
          </div>

          <div className="col">
            <h3 className="h3">Approved</h3>
            <div className="stack">
              {data.approved.length === 0 ? (
                <div className="muted">No approved requests.</div>
              ) : (
                data.approved.map((app) => <LeaveCard key={app.id} application={app} />)
              )}
            </div>
          </div>

          <div className="col">
            <h3 className="h3">Rejected</h3>
            <div className="stack">
              {data.rejected.length === 0 ? (
                <div className="muted">No rejected requests.</div>
              ) : (
                data.rejected.map((app) => <LeaveCard key={app.id} application={app} />)
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

