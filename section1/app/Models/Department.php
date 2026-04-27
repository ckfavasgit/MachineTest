<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Department extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'head_user_id',
        'hr_manager_user_id',
    ];

    public function head(): BelongsTo
    {
        return $this->belongsTo(User::class, 'head_user_id');
    }

    public function hrManager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'hr_manager_user_id');
    }
}

