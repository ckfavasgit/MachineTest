<?php

namespace App\Services\LeaveApproval;

use App\Models\LeaveApproval;
use App\Models\LeaveRequest;
use App\Models\User;
use Carbon\CarbonImmutable;

class LeaveApprovalService
{
    public function __construct(
        private LeaveApprovalPipeline $pipeline
    ) {
    }

    public function submit(LeaveRequest $leaveRequest): void
    {
        $leaveRequest->forceFill(['status' => 'pending'])->save();
        $this->pipeline->run($leaveRequest);
    }

    public function approve(LeaveApproval $approval, User $actor, ?string $comment = null): void
    {
        if ((int) $approval->approver_id !== (int) $actor->id) {
            throw new \RuntimeException('Only assigned approver may approve.');
        }

        $approval->forceFill([
            'status' => 'approved',
            'acted_at' => CarbonImmutable::now(),
            'comment' => $comment,
        ])->save();

        $this->pipeline->run($approval->leaveRequest);
    }

    public function reject(LeaveApproval $approval, User $actor, ?string $reason = null): void
    {
        if ((int) $approval->approver_id !== (int) $actor->id) {
            throw new \RuntimeException('Only assigned approver may reject.');
        }

        $approval->forceFill([
            'status' => 'rejected',
            'acted_at' => CarbonImmutable::now(),
            'comment' => $reason,
        ])->save();

        $approval->leaveRequest->forceFill([
            'status' => 'rejected',
            'rejected_by_id' => $actor->id,
            'rejection_reason' => $reason,
        ])->save();

        $this->pipeline->run($approval->leaveRequest);
    }
}

