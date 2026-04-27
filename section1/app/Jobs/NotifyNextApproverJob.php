<?php

namespace App\Jobs;

use App\Models\LeaveRequest;
use App\Models\User;
use App\Notifications\NextLeaveApprovalNotification;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Notification;

class NotifyNextApproverJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public int $leaveRequestId,
        public int $approverId
    ) {
    }

    public function handle(): void
    {
        $leave = LeaveRequest::query()->with(['employee', 'department', 'leaveType'])->findOrFail($this->leaveRequestId);
        $approver = User::query()->findOrFail($this->approverId);

        Notification::send($approver, new NextLeaveApprovalNotification($leave));
    }
}

