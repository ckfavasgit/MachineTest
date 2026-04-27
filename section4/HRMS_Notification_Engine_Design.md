# HRMS Notification Engine Design

## 1. Data Model Design

### Core Tables

```sql
-- notification_preferences: Per-employee, per-event, per-channel preferences
CREATE TABLE notification_preferences (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT UNSIGNED NOT NULL,
    event_type ENUM('leave_approval', 'payslip_generation', 'probation_end', 'birthday') NOT NULL,
    channel ENUM('email', 'sms', 'in_app', 'whatsapp') NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_preference (employee_id, event_type, channel),
    INDEX idx_employee (employee_id),
    INDEX idx_event_channel (event_type, channel)
);

-- notification_defaults: Global defaults per event type and channel
CREATE TABLE notification_defaults (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_type ENUM('leave_approval', 'payslip_generation', 'probation_end', 'birthday') NOT NULL,
    channel ENUM('email', 'sms', 'in_app', 'whatsapp') NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY unique_default (event_type, channel)
);

-- employee_timezones: Store employee local timezone
CREATE TABLE employee_timezones (
    employee_id BIGINT UNSIGNED PRIMARY KEY,
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

-- notification_logs: Track sent notifications for auditing
CREATE TABLE notification_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT UNSIGNED NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    status ENUM('sent', 'failed', 'pending') NOT NULL,
    message_id VARCHAR(100) NULL,
    error_message TEXT NULL,
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_employee_event (employee_id, event_type),
    INDEX idx_status (status)
);
```

### Handling Per-Employee Defaults Efficiently

- **Cascade Logic**: When checking preferences, first look at `notification_preferences`. If no record exists, fall back to `notification_defaults`.
- **Eager Loading**: Cache employee preferences in Redis on login to avoid repeated DB queries.
- **Default Migration**: On employee creation, optionally seed default preferences from global defaults.

---

## 2. Laravel Flow: Event → Listener → Notification Class

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Event     │────▶│  Listener   │────▶│ Notification     │────▶│ Channel Router  │
│ (Trigger)   │     │ (Process)   │     │ (Build Message)  │     │ (Route by Pref) │
└─────────────┘     └─────────────┘     └──────────────────┘     └─────────────────┘
```

### Event Classes

```php
// filepath: app/Events/LeaveApproved.php
namespace App\Events;

use App\Models\Leave;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class LeaveApproved
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Leave $leave
    ) {}
}
```

### Listener Class

```php
// filepath: app/Listeners/SendNotification.php
namespace App\Listeners;

use App\Events\LeaveApproved;
use App\Services\NotificationRouter;

class SendNotification
{
    public function __construct(
        protected NotificationRouter $router
    ) {}

    public function handle(LeaveApproved $event): void
    {
        $employee = $event->leave->employee;
        
        // Route notification based on preferences
        $this->router->route($employee, 'leave_approval', [
            'leave_type' => $event->leave->leave_type,
            'start_date' => $event->leave->start_date->format('Y-m-d'),
            'status' => $event->leave->status,
        ]);
    }
}
```

---

## 3. Redis Role: Deduplication Strategy

### Key Design

```
Key Pattern: notification:dedup:{event_type}:{employee_id}:{date_hash}
Example: notification:dedup:birthday:12345:2026-04-27
```

### TTL Strategy

| Event Type | TTL Duration | Rationale |
|------------|--------------|-----------|
| Birthday   | 24 hours     | Fires once daily, retry window within day |
| Payslip    | 7 days       | Month-end processing, longer retry window |
| Leave      | 3 days       | Approval valid for short period |
| Probation  | 30 days      | Longer validity period |

### Implementation

```php
// filepath: app/Services/NotificationDeduplicator.php
namespace App\Services;

use Illuminate\Support\Facades\Redis;

class NotificationDeduplicator
{
    private const TTL_MAP = [
        'birthday' => 86400,        // 24 hours
        'payslip_generation' => 604800, // 7 days
        'leave_approval' => 259200, // 3 days
        'probation_end' => 2592000, // 30 days
    ];

    public function isDuplicate(string $eventType, int $employeeId, string $dateHash): bool
    {
        $key = $this->buildKey($eventType, $employeeId, $dateHash);
        
        return (bool) Redis::setnx($key, '1');
    }

    public function markAsSent(string $eventType, int $employeeId, string $dateHash): void
    {
        $key = $this->buildKey($eventType, $employeeId, $dateHash);
        $ttl = self::TTL_MAP[$eventType] ?? 86400;
        
        Redis::setex($key, $ttl, '1');
    }

    private function buildKey(string $eventType, int $employeeId, string $dateHash): string
    {
        return "notification:dedup:{$eventType}:{$employeeId}:{$dateHash}";
    }
}
```

---

## 4. Scheduled Notifications: Timezone-Aware Scheduling

### Approach: Queue with Delayed Execution

```php
// filepath: app/Console/Commands/SchedulePayslipNotifications.php
namespace App\Console\Commands;

use App\Models\Employee;
use App\Jobs\SendPayslipNotification;
use Illuminate\Console\Command;

class SchedulePayslipNotifications extends Command
{
    protected $signature = 'notifications:schedule-payslip {--month=}';
    protected $description = 'Schedule payslip notifications at 9 AM local time';

    public function handle(): int
    {
        $month = $this->option('month') ?? now()->format('Y-m');

        Employee::with('timezone')->chunk(1000, function ($employees) use ($month) {
            foreach ($employees as $employee) {
                $timezone = $employee->timezone ?? 'UTC';
                
                // Calculate 9 AM in employee's local timezone
                $localTime = \Carbon\Carbon::now($timezone)
                    ->startOfDay()
                    ->addHours(9);
                
                // If 9 AM has passed today, schedule for next occurrence
                if ($localTime->isPast()) {
                    $localTime->addDay();
                }

                // Convert to UTC for queue scheduling
                $utcTime = $localTime->copy()->setTimezone('UTC');
                
                $delay = $utcTime->diffInSeconds(now());
                
                SendPayslipNotification::dispatch($employee, $month)
                    ->delay(now()->addSeconds($delay));
            }
        });

        $this->info("Payslip notifications scheduled for {$month}");
        return Command::SUCCESS;
    }
}
```

### Alternative: Laravel Scheduler with Cron

```php
// filepath: app/Console/Kernel.php
protected function schedule(Schedule $schedule): void
{
    // Run at 8 AM UTC daily - handles timezone conversion internally
    $schedule->command('notifications:schedule-payslip')
        ->dailyAt('08:00')
        ->withoutOverlapping()
        ->onOneServer();
}
```

---

## 5. Failure Handling Strategy

### Strategy: Tiered Retry with Fallback + Dead Letter Queue

**Justification:**

When the SMS gateway fails for 50,000 payslip notifications, we implement a **hybrid approach**:

1. **Immediate Fallback to Email**: Since payslips are critical, immediately queue email notifications for all employees who have email enabled in preferences. This ensures delivery even if SMS fails.

2. **Retry with Exponential Backoff**: Queue failed SMS notifications to retry 3 times (5min, 15min, 30min) using Laravel's `Retry` helper or Redis-backed delay queue.

3. **Dead Letter Queue (DLQ)**: After exhausting retries, move to a DLQ table (`failed_notifications`) for manual intervention. This prevents blocking the main queue and allows ops team to analyze and replay later.

4. **Circuit Breaker**: Implement a circuit breaker for SMS gateway - after 100 failures in 5 minutes, temporarily disable SMS routing to prevent cascading failures.

```php
// filepath: app/Services/NotificationRouter.php (Failure Handling)
public function routeWithFallback(Employee $employee, string $eventType, array $data): void
{
    $preferences = $this->getPreferences($employee->id, $eventType);
    
    $channels = array_filter($preferences, fn($p) => $p['is_enabled']);
    
    foreach ($channels as $channel => $enabled) {
        try {
            $this->send($employee, $channel, $eventType, $data);
        } catch (SmsGatewayException $e) {
            // Fallback to email if SMS fails and email is enabled
            if ($channel === 'sms' && $preferences['email']['is_enabled'] ?? false) {
                $this->send($employee, 'email', $eventType, $data);
                $this->logFailure($channel, $e);
            } else {
                // Queue to retry or DLQ
                $this->queueForRetry($employee, $channel, $eventType, $data);
            }
        }
    }
}
```

---

## 6. ERD Sketch

```
┌─────────────────────────┐       ┌─────────────────────────┐
│    notification_defaults │       │    employee_timezones   │
├─────────────────────────┤       ├─────────────────────────┤
│ id (PK)                 │       │ employee_id (PK)        │
│ event_type              │       │ timezone                │
│ channel                 │       │ created_at              │
│ is_enabled              │       │ updated_at              │
│ created_at              │       └───────────┬─────────────┘
│ updated_at              │                   │
└───────────┬─────────────┘                   │
            │                                 │
            │  (fallback)                     │
            ▼                                 ▼
┌─────────────────────────────────────────────────────────────┐
│              notification_preferences                       │
├─────────────────────────────────────────────────────────────┤
│ id (PK)                                                     │
│ employee_id (FK) ──────────────▶ employees(id)             │
│ event_type              ◀───────── notification_defaults   │
│ channel                 ◀───────── (event_type, channel)   │
│ is_enabled                                                 │
│ created_at                                                 │
│ updated_at                                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ (logs)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   notification_logs                         │
├─────────────────────────────────────────────────────────────┤
│ id (PK)                                                     │
│ employee_id (FK) ──────────▶ employees(id)                 │
│ event_type                                                 │
│ channel                                                    │
│ status (sent/failed/pending)                                │
│ message_id                                                 │
│ error_message                                              │
│ sent_at                                                    │
│ created_at                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Code Snippet: Notification Router

```php
// filepath: app/Services/NotificationRouter.php
namespace App\Services;

use App\Models\Employee;
use App\Models\NotificationPreference;
use App\Notifications\LeaveApprovalNotification;
use App\Notifications\PayslipNotification;
use App\Notifications\ProbationEndNotification;
use App\Notifications\BirthdayNotification;
use Illuminate\Support\Facades\Log;

class NotificationRouter
{
    /**
     * Route notification to all enabled channels based on preferences
     */
    public function route(Employee $employee, string $eventType, array $data = []): void
    {
        $preferences = $this->getEffectivePreferences($employee->id, $eventType);
        
        foreach ($preferences as $channel => $isEnabled) {
            if (!$isEnabled) {
                continue;
            }
            
            $this->sendViaChannel($employee, $channel, $eventType, $data);
        }
    }

    /**
     * Get effective preferences (employee-specific + global defaults)
     */
    protected function getEffectivePreferences(int $employeeId, string $eventType): array
    {
        // Get employee-specific preferences
        $employeePrefs = NotificationPreference::where('employee_id', $employeeId)
            ->where('event_type', $eventType)
            ->pluck('is_enabled', 'channel')
            ->toArray();
        
        // Get global defaults
        $defaultPrefs = config("notifications.defaults.{$eventType}", [
            'email' => true,
            'in_app' => true,
            'sms' => false,
            'whatsapp' => false,
        ]);
        
        // Merge: employee prefs override defaults
        return array_merge($defaultPrefs, $employeePrefs);
    }

    /**
     * Send notification via specific channel
     */
    protected function sendViaChannel(Employee $employee, string $channel, string $eventType, array $data): void
    {
        $notification = $this->buildNotification($eventType, $data);
        
        try {
            match ($channel) {
                'email' => $employee->notify($notification->viaEmail()),
                'sms' => $this->sendSms($employee, $notification),
                'whatsapp' => $this->sendWhatsApp($employee, $notification),
                'in_app' => $employee->notify($notification->viaDatabase()),
                default => Log::warning("Unknown channel: {$channel}"),
            };
            
            $this->logSuccess($employee->id, $eventType, $channel);
            
        } catch (\Exception $e) {
            $this->logFailure($employee->id, $eventType, $channel, $e->getMessage());
            throw $e;
        }
    }

    /**
     * Build appropriate notification instance
     */
    protected function buildNotification(string $eventType, array $data)
    {
        return match ($eventType) {
            'leave_approval' => new LeaveApprovalNotification($data),
            'payslip_generation' => new PayslipNotification($data),
            'probation_end' => new ProbationEndNotification($data),
            'birthday' => new BirthdayNotification($data),
            default => throw new \InvalidArgumentException("Unknown event type: {$eventType}"),
        };
    }

    protected function sendSms(Employee $employee, $notification): void
    {
        // SMS gateway integration
    }

    protected function sendWhatsApp(Employee $employee, $notification): void
    {
        // WhatsApp API integration
    }

    protected function logSuccess(int $employeeId, string $eventType, string $channel): void
    {
        // Log to notification_logs table
    }

    protected function logFailure(int $employeeId, string $eventType, string $channel, string $error): void
    {
        // Log failure to notification_logs table
    }
}
```

---

## Summary

| Component | Solution |
|-----------|----------|
| **Data Model** | `notification_preferences` + `notification_defaults` with cascade logic |
| **Laravel Flow** | Event → Listener → NotificationRouter → Channel-specific handlers |
| **Redis Deduplication** | `notification:dedup:{event}:{emp_id}:{date}` with TTL per event type |
| **Timezone Scheduling** | Calculate 9 AM local time, convert to UTC delay for queue |
| **Failure Handling** | Immediate email fallback + exponential retry + DLQ + circuit breaker |