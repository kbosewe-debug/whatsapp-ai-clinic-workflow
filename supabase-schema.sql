create extension if not exists pgcrypto;

create table if not exists clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  website text,
  opening_time time default '08:00',
  closing_time time default '17:00',
  timezone text default 'Africa/Nairobi',
  created_at timestamptz default now()
);

create table if not exists doctors (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  specialty text not null,
  phone text,
  email text,
  calendar_id text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists doctor_availability (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctors(id) on delete cascade,
  day_of_week integer not null check(day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_minutes integer not null default 30,
  active boolean default true
);

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text,
  phone text not null,
  email text,
  date_of_birth date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(clinic_id, phone)
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id),
  doctor_id uuid not null references doctors(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked'
    check(status in ('booked','confirmed','completed','cancelled','no_show')),
  reason text,
  calendar_event_id text,
  reminder_24h_sent boolean default false,
  reminder_2h_sent boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists appointments_doctor_time_idx
on appointments(doctor_id, starts_at, ends_at);

create table if not exists faqs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  question text not null,
  answer text not null,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid references patients(id),
  phone text not null,
  message text,
  status text not null default 'open'
    check(status in ('open','assigned','resolved')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);

insert into clinics(name,phone,address,website,opening_time,closing_time,timezone)
select 'Demo Health Clinic','+254700000000','Nairobi, Kenya','https://example.com','08:00','17:00','Africa/Nairobi'
where not exists (select 1 from clinics);

-- After running this SQL:
-- select id,name from clinics;
-- Put the clinic UUID into DEFAULT_CLINIC_ID.
