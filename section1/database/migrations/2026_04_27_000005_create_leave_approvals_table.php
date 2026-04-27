<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('leave_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('leave_request_id')->constrained('leave_requests')->cascadeOnDelete();
            $table->unsignedSmallInteger('level');
            $table->foreignId('approver_id')->constrained('users')->cascadeOnDelete();
            $table->string('status')->default('pending'); // pending|approved|rejected
            $table->timestamp('acted_at')->nullable();
            $table->text('comment')->nullable();
            $table->timestamps();

            $table->unique(['leave_request_id', 'level']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_approvals');
    }
};

