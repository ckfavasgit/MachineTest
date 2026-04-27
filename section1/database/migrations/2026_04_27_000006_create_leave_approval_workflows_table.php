<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('leave_approval_workflows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('leave_type_id')->constrained('leave_types')->cascadeOnDelete();
            $table->foreignId('department_id')->constrained('departments')->cascadeOnDelete();
            $table->unsignedSmallInteger('min_days')->nullable();
            $table->unsignedSmallInteger('max_days')->nullable();
            $table->unsignedSmallInteger('level'); // 1..N
            $table->string('approver_role'); // team_lead|hr_manager|dept_head
            $table->boolean('escalate_if_on_leave')->default(false);
            $table->timestamps();

            $table->index(['leave_type_id', 'department_id', 'min_days', 'max_days'], 'leave_wf_lookup');
            $table->unique(['leave_type_id', 'department_id', 'min_days', 'max_days', 'level'], 'leave_workflow_unique_level');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_approval_workflows');
    }
};

