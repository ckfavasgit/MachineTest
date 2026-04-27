<?php

namespace App\Services\LeaveApproval;

use App\Models\LeaveApprovalWorkflow;
use App\Models\LeaveRequest;
use App\Notifications\LeaveApprovedNotification;
use App\Services\LeaveApproval\Stages\LeaveApprovalStage;
use Illuminate\Pipeline\Pipeline;
use Illuminate\Support\Facades\Notification;

class LeaveApprovalPipeline
{
    public function __construct(
        private Pipeline $pipeline
    ) {
    }

    public function run(LeaveRequest $leaveRequest): LeaveApprovalContext
    {
        $leaveRequest = $leaveRequest->fresh(['employee', 'department']);

        $workflows = LeaveApprovalWorkflow::query()
            ->where('leave_type_id', $leaveRequest->leave_type_id)
            ->where('department_id', $leaveRequest->department_id)
            ->where(function ($q) use ($leaveRequest) {
                $q->whereNull('min_days')->orWhere('min_days', '<=', $leaveRequest->days);
            })
            ->where(function ($q) use ($leaveRequest) {
                $q->whereNull('max_days')->orWhere('max_days', '>=', $leaveRequest->days);
            })
            ->orderBy('level')
            ->get();

        if ($workflows->isEmpty()) {
            throw new \RuntimeException('No approval workflow configured for this leave request.');
        }

        $stages = $workflows->map(fn ($wf) => new LeaveApprovalStage($wf))->all();

        $context = new LeaveApprovalContext($leaveRequest);

        $result = $this->pipeline
            ->send($context)
            ->through($stages)
            ->thenReturn();

        $fresh = $leaveRequest->fresh(['approvals', 'employee']);

        if (
            $fresh->status === 'pending'
            && $fresh->approvals()->count() === $workflows->count()
            && $fresh->approvals()->where('status', 'approved')->count() === $workflows->count()
        ) {
            $fresh->forceFill(['status' => 'approved'])->save();
            Notification::send($fresh->employee, new LeaveApprovedNotification($fresh));
        }

        return $result;
    }
}

