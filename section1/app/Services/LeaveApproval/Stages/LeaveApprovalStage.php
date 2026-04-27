<?php

namespace App\Services\LeaveApproval\Stages;

use App\Jobs\NotifyNextApproverJob;
use App\Models\LeaveApproval;
use App\Models\LeaveApprovalWorkflow;
use App\Models\LeaveRequest;
use App\Models\User;
use App\Notifications\LeaveRejectedNotification;
use App\Services\LeaveApproval\LeaveApprovalContext;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Support\Facades\Notification;

class LeaveApprovalStage
{
    public function __construct(
        private LeaveApprovalWorkflow $workflow
    ) {
    }

    public function handle(LeaveApprovalContext $context, Closure $next): mixed
    {
        $leave = $context->leaveRequest->fresh(['employee', 'department']);

        if ($leave->status === 'rejected') {
            return $context;
        }

        $approval = LeaveApproval::query()
            ->where('leave_request_id', $leave->id)
            ->where('level', $this->workflow->level)
            ->first();

        if ($approval?->status === 'rejected') {
            if ($leave->status !== 'rejected') {
                $leave->forceFill([
                    'status' => 'rejected',
                    'rejected_by_id' => $approval->approver_id,
                ])->save();

                Notification::send($leave->employee, new LeaveRejectedNotification($leave));
            }

            return $context;
        }

        if (! $approval) {
            $approver = $this->resolveApprover($leave);

            LeaveApproval::create([
                'leave_request_id' => $leave->id,
                'level' => $this->workflow->level,
                'approver_id' => $approver->id,
                'status' => 'pending',
            ]);

            NotifyNextApproverJob::dispatch($leave->id, $approver->id);

            return $context; // stop pipeline until acted
        }

        if ($approval->status === 'pending') {
            return $context; // waiting at this level
        }

        return $next($context);
    }

    private function resolveApprover(LeaveRequest $leave): User
    {
        $employee = $leave->employee;
        $department = $leave->department;

        $approver = match ($this->workflow->approver_role) {
            'team_lead' => $employee->manager,
            'hr_manager' => $department->hrManager,
            'dept_head' => $department->head,
            default => null,
        };

        if (! $approver) {
            throw new \RuntimeException("Approver not configured for role [{$this->workflow->approver_role}].");
        }

        if ($this->workflow->escalate_if_on_leave && $this->isUserOnLeaveToday($approver)) {
            return $approver->manager ?? $approver;
        }

        return $approver;
    }

    private function isUserOnLeaveToday(User $user): bool
    {
        $today = CarbonImmutable::today();

        return LeaveRequest::query()
            ->where('employee_id', $user->id)
            ->where('status', 'approved')
            ->whereDate('start_date', '<=', $today)
            ->whereDate('end_date', '>=', $today)
            ->exists();
    }
}

