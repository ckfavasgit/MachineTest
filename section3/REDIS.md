# SECTION 3 (Redis)

## Employee Session Control + Live Attendance Counter

------------------------------------------------------------------------

# Part A --- Single Session Enforcement

## 1. Store Session in Redis (8-hour TTL)

``` php
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;

public function login(Request $request)
{
    $employee = Employee::where('email', $request->email)->first();

    if (!$employee || !Hash::check($request->password, $employee->password)) {
        return response()->json(['message' => 'Invalid credentials'], 401);
    }

    $token = Str::random(60);
    $key = "session:employee:{$employee->id}";

    $oldToken = Redis::get($key);

    if ($oldToken) {
        // Optional: invalidate old token
    }

    Redis::setex($key, 28800, $token);

    return response()->json([
        'token' => $token,
        'employee_id' => $employee->id
    ]);
}
```

------------------------------------------------------------------------

## 2. Middleware to Validate Session

``` php
class ValidateEmployeeSession
{
    public function handle($request, Closure $next)
    {
        $employeeId = $request->header('employee-id');
        $token = $request->header('Authorization');

        $key = "session:employee:$employeeId";
        $storedToken = Redis::get($key);

        if (!$storedToken || $storedToken !== $token) {
            return response()->json([
                'message' => 'Session superseded. Please log in again.'
            ], 401);
        }

        return $next($request);
    }
}
```

------------------------------------------------------------------------

# Part B --- Live Attendance Counter

## Redis Key

attendance:summary:{date}

## Fields

present, absent, on_leave

------------------------------------------------------------------------

## Punch-In Logic

``` php
Redis::hincrby($key, 'present', 1);
```

------------------------------------------------------------------------

## Live Summary API

``` php
$data = Redis::hgetall($key);
```

------------------------------------------------------------------------

## Rehydration Logic

``` php
Redis::hmset($key, [
    'present' => $present,
    'absent' => $absent,
    'on_leave' => $onLeave
]);
```

------------------------------------------------------------------------

# Risk

-   Redis is in-memory → data loss on restart

------------------------------------------------------------------------

# Mitigation

-   Enable RDB / AOF
-   Use DB as source of truth
-   Rehydrate from DB
