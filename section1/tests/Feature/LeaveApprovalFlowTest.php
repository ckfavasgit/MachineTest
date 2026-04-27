<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\LeaveApproval;
use App\Models\LeaveApprovalWorkflow;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use App\Notifications\NextLeaveApprovalNotification;
use App\Services\LeaveApproval\LeaveApprovalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class LeaveApprovalFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_full_approval_flow_final_status_is_approved(): void
    {
        Notification::fake();

        $deptHead = User::factory()->create();
        $hrManager = User::factory()->create();
        $teamLead = User::factory()->create();
        $employee = User::factory()->create(['manager_id' => $teamLead->id]);

        $department = Department::query()->create([
            'name' => 'Engineering',
            'head_user_id' => $deptHead->id,
            'hr_manager_user_id' => $hrManager->id,
        ]);

        $employee->forceFill(['department_id' => $department->id])->save();
        $teamLead->forceFill(['department_id' => $department->id])->save();
        $deptHead->forceFill(['department_id' => $department->id])->save();
        $hrManager->forceFill(['department_id' => $department->id])->save();

        $medical = LeaveType::query()->create(['name' => 'Medical Leave']);

        // Medical Leave (> 5 days): Team Lead → HR Manager → Dept Head
        LeaveApprovalWorkflow::query()->create([
            'leave_type_id' => $medical->id,
            'department_id' => $department->id,
            'min_days' => 6,
            'max_days' => null,
            'level' => 1,
            'approver_role' => 'team_lead',
            'escalate_if_on_leave' => true,
        ]);
        LeaveApprovalWorkflow::query()->create([
            'leave_type_id' => $medical->id,
            'department_id' => $department->id,
            'min_days' => 6,
            'max_days' => null,
            'level' => 2,
            'approver_role' => 'hr_manager',
            'escalate_if_on_leave' => true,
        ]);
        LeaveApprovalWorkflow::query()->create([
            'leave_type_id' => $medical->id,
            'department_id' => $department->id,
            'min_days' => 6,
            'max_days' => null,
            'level' => 3,
            'approver_role' => 'dept_head',
            'escalate_if_on_leave' => true,
        ]);

        $leave = LeaveRequest::query()->create([
            'employee_id' => $employee->id,
            'department_id' => $department->id,
            'leave_type_id' => $medical->id,
            'start_date' => now()->addDays(1)->toDateString(),
            'end_date' => now()->addDays(6)->toDateString(),
            'days' => 6,
            'status' => 'pending',
        ]);

        $service = app(LeaveApprovalService::class);
        $service->submit($leave);

        $leave->refresh();
        $this->assertSame('pending', $leave->status);

        $approval1 = LeaveApproval::query()->where('leave_request_id', $leave->id)->where('level', 1)->firstOrFail();
        $this->assertSame($teamLead->id, $approval1->approver_id);
        Notification::assertSentTo($teamLead, NextLeaveApprovalNotification::class);

        $service->approve($approval1, $teamLead);
        $approval2 = LeaveApproval::query()->where('leave_request_id', $leave->id)->where('level', 2)->firstOrFail();
        $this->assertSame($hrManager->id, $approval2->approver_id);
        Notification::assertSentTo($hrManager, NextLeaveApprovalNotification::class);

        $service->approve($approval2, $hrManager);
        $approval3 = LeaveApproval::query()->where('leave_request_id', $leave->id)->where('level', 3)->firstOrFail();
        $this->assertSame($deptHead->id, $approval3->approver_id);
        Notification::assertSentTo($deptHead, NextLeaveApprovalNotification::class);

        $service->approve($approval3, $deptHead);

        $leave->refresh();
        $this->assertSame('approved', $leave->status);
        $this->assertSame(3, $leave->approvals()->count());
        $this->assertSame(3, $leave->approvals()->where('status', 'approved')->count());
    }
}

