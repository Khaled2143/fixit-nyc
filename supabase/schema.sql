create table issues (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  description text not null,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  location_source text not null check (location_source in ('address', 'manual_pin', 'latlong')),
  status text not null default 'submitted' check (status in ('submitted', 'resolved')),
  photo_url text,
  video_link text,
  resolved_via text,
  created_at timestamptz not null default now()
);

alter table issues enable row level security;

create policy "Public can read issues"
  on issues for select
  using (true);

create policy "Public can create issues"
  on issues for insert
  with check (true);

-- No update/delete policy: default-denied. No admin/moderation surface
-- exists yet, so issues are immutable once created via the public API.
