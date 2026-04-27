<?php

namespace App\Services\LeaveApproval;

use App\Models\LeaveRequest;

class LeaveApprovalContext
{
    public function __construct(
        public LeaveRequest $leaveRequest
    ) {
    }
}

