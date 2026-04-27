<?php

namespace Database\Factories;

use App\Models\Department;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class LeaveRequestFactory extends Factory
{
    protected $model = LeaveRequest::class;

    public function definition(): array
    {
        $start = $this->faker->dateTimeBetween('+1 day', '+10 days');
        $end = (clone $start)->modify('+5 days');

        return [
            'employee_id' => User::factory(),
            'department_id' => Department::factory(),
            'leave_type_id' => LeaveType::factory(),
            'start_date' => $start->format('Y-m-d'),
            'end_date' => $end->format('Y-m-d'),
            'days' => 6,
            'status' => 'pending',
        ];
    }
}

