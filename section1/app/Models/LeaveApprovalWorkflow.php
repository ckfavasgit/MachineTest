<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaveApprovalWorkflow extends Model
{
    use HasFactory;

    protected $fillable = [
        'leave_type_id',
        'department_id',
        'min_days',
        'max_days',
        'level',
        'approver_role',
        'escalate_if_on_leave',
    ];

    protected $casts = [
        'escalate_if_on_leave' => 'bool',
    ];

    public function leaveType(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }
}

