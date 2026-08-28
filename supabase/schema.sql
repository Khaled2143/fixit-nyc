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

-- Accounts and moderation -----------------------------------------------

alter table issues add column user_id uuid references auth.users(id);
alter table issues add column hidden boolean not null default false;

-- Posting now requires an account and all writes go through server-side
-- API routes using the service-role key (which bypasses RLS), so the old
-- anonymous-write policy is removed. There is intentionally no
-- insert/update policy for the anon or authenticated roles on `issues`.
drop policy "Public can create issues" on issues;
drop policy "Public can read issues" on issues;

create policy "Public can read visible issues"
  on issues for select
  using (hidden = false);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  strikes int not null default 0,
  banned_at timestamptz,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can read their own profile"
  on profiles for select
  using (auth.uid() = id);

-- No insert/update/delete policy: profile rows are only ever written by
-- the service-role key from API routes.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table reports (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (issue_id, reporter_id)
);

alter table reports enable row level security;

-- No policies: only the service-role key (which bypasses RLS) reads or
-- writes this table.

-- Usernames must be unique case-insensitively (e.g. "Bob" and "bob" are
-- the same username), so replace the case-sensitive unique constraint
-- with a case-insensitive unique index.
alter table profiles drop constraint profiles_username_key;
create unique index profiles_username_lower_idx on profiles (lower(username));

-- Photo uploads now go through /api/photos (service-role key, bypasses
-- Storage RLS). Remove any INSERT policy on the issue-photos bucket that
-- still allows anon/authenticated clients to upload directly — this was
-- previously only a manual dashboard action (Task 2, Step 3), which meant
-- it was neither version-controlled nor detectable as missing.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'INSERT'
      and (qual ilike '%issue-photos%' or with_check ilike '%issue-photos%')
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

-- Lets the popup show "Resolved in Xd" instead of just a status label.
-- Set by markIssueResolved when an issue flips to resolved; null until then.
alter table issues add column resolved_at timestamptz;

-- Lets a resident signal "this is happening to me too" on an issue, once
-- per account. Mirrors the reports table exactly: insert-only, deduped
-- by a unique constraint, no RLS policies since only the service-role
-- key (which bypasses RLS) ever touches it.
create table me_toos (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (issue_id, user_id)
);

alter table me_toos enable row level security;

-- No policies: only the service-role key (which bypasses RLS) reads or
-- writes this table.

-- Denormalized counter so the list/map can show a count without a
-- count(*) join on every render. Incremented by the me-too API route.
alter table issues add column me_too_count integer not null default 0;
