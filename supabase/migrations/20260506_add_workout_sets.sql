create table if not exists workout_sets (
  id uuid primary key default gen_random_uuid(),
  external_set_id text unique not null,
  external_session_id text not null,
  set_number integer not null,
  exercise text not null,
  reps integer null,
  bad_reps integer null,
  form_score numeric null,
  angle_data jsonb null,
  coaching_summary text null,
  started_at timestamptz null,
  ended_at timestamptz null,
  source_device text not null default 'SmartRep-Pi1-Camera',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workout_sets_session_id
on workout_sets(external_session_id);

create index if not exists idx_workout_sets_set_number
on workout_sets(external_session_id, set_number);

alter table workout_sets enable row level security;

create policy "public can read workout_sets"
on workout_sets
for select
to anon
using (true);
