create table if not exists public.stray_pet_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  city text not null,
  district text not null,
  location text not null,
  animal_type text not null,
  status text not null default '待核实',
  urgency text not null,
  seen_at text,
  media_url text,
  contact_name text not null,
  contact_info text not null,
  description text not null
);

alter table public.stray_pet_reports enable row level security;

drop policy if exists "No public direct access" on public.stray_pet_reports;
create policy "No public direct access"
on public.stray_pet_reports
for all
using (false)
with check (false);
