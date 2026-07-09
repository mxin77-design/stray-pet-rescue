alter table public.stray_pet_reports
add column if not exists status text not null default '待核实';
