create table if not exists workout_commands (
  id uuid primary key default gen_random_uuid(),
  command_type text not null check (
    command_type in (
      'start_session',
      'start_set',
      'end_set',
      'end_session',
      'cancel_session'
    )
  ),
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  external_session_id text null,
  external_set_id text null,
  exercise text null check (exercise is null or exercise in ('bicep_curl', 'squat')),
  set_number integer null,
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'dashboard',
  target_device text not null default 'SmartRep-Pi1',
  error_message text null,
  claimed_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table workout_sessions
add column if not exists session_status text not null default 'completed'
check (session_status in ('active', 'completed', 'cancelled'));

alter table workout_sets
add column if not exists set_status text not null default 'completed'
check (set_status in ('countdown', 'active', 'processing_feedback', 'completed', 'cancelled'));

create index if not exists idx_workout_commands_status_created_at
on workout_commands(status, created_at);

create index if not exists idx_workout_commands_session_id
on workout_commands(external_session_id);

create index if not exists idx_workout_sessions_status
on workout_sessions(session_status);

create index if not exists idx_workout_sets_status
on workout_sets(set_status);

alter table workout_commands enable row level security;
