<?php

namespace App\Notifications;

use App\Models\LeaveRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class NextLeaveApprovalNotification extends Notification
{
    use Queueable;

    public function __construct(
        public LeaveRequest $leaveRequest
    ) {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Leave approval needed')
            ->line("A leave request #{$this->leaveRequest->id} needs your approval.")
            ->line("Employee: {$this->leaveRequest->employee->name}")
            ->line("Type: {$this->leaveRequest->leaveType->name}")
            ->line("Days: {$this->leaveRequest->days}");
    }
}

