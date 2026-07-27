
-- ============ enum ============
create type public.team_role as enum ('admin','developer','viewer');

-- ============ profiles ============
create table public.profiles (
  id uuid primary key,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- ============ teams ============
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.teams to authenticated;
grant all on public.teams to service_role;
alter table public.teams enable row level security;

-- ============ team_members ============
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null,
  role public.team_role not null default 'developer',
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);
grant select, insert, update, delete on public.team_members to authenticated;
grant all on public.team_members to service_role;
alter table public.team_members enable row level security;

-- ============ team_invites ============
create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role public.team_role not null default 'developer',
  invited_by uuid not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (team_id, email)
);
grant select, insert, update, delete on public.team_invites to authenticated;
grant all on public.team_invites to service_role;
alter table public.team_invites enable row level security;

-- ============ scans / scan_issues additions ============
alter table public.scans add column if not exists team_id uuid references public.teams(id) on delete set null;
alter table public.scans add column if not exists assigned_to uuid;
alter table public.scan_issues add column if not exists status text not null default 'open';
alter table public.scan_issues add column if not exists status_by uuid;
alter table public.scan_issues add column if not exists status_at timestamptz;

-- ============ issue_comments ============
create table public.issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.scan_issues(id) on delete cascade,
  scan_id uuid not null references public.scans(id) on delete cascade,
  user_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.issue_comments to authenticated;
grant all on public.issue_comments to service_role;
alter table public.issue_comments enable row level security;

-- ============ security definer helpers ============
create or replace function public.is_team_member(_team_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where team_id = _team_id and user_id = _user_id);
$$;

create or replace function public.get_team_role(_team_id uuid, _user_id uuid)
returns public.team_role language sql stable security definer set search_path = public as $$
  select role from public.team_members where team_id = _team_id and user_id = _user_id;
$$;

create or replace function public.has_team_role(_team_id uuid, _user_id uuid, _role public.team_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where team_id = _team_id and user_id = _user_id and role = _role);
$$;

-- can this user write (status/assign) on this team?
create or replace function public.can_team_write(_team_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where team_id = _team_id and user_id = _user_id and role in ('admin','developer')
  );
$$;

-- team of a scan
create or replace function public.scan_team(_scan_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.scans where id = _scan_id;
$$;

create or replace function public.can_read_scan(_scan_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.scans s
    where s.id = _scan_id
      and (s.user_id = _user_id or (s.team_id is not null and public.is_team_member(s.team_id, _user_id)))
  );
$$;

create or replace function public.current_user_email()
returns text language sql stable security definer set search_path = public as $$
  select email from public.profiles where id = auth.uid();
$$;

-- ============ profiles policies + signup trigger ============
create policy "profiles readable by self"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles readable by teammates"
  on public.profiles for select to authenticated
  using (exists (
    select 1 from public.team_members m1
    join public.team_members m2 on m1.team_id = m2.team_id
    where m1.user_id = auth.uid() and m2.user_id = public.profiles.id
  ));

create policy "profiles update own"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email, display_name)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1))
from auth.users u
on conflict (id) do nothing;

-- ============ teams policies ============
create policy "teams readable by members"
  on public.teams for select to authenticated
  using (owner_id = auth.uid() or public.is_team_member(id, auth.uid()));

create policy "teams insert by owner"
  on public.teams for insert to authenticated
  with check (owner_id = auth.uid());

create policy "teams update by admins"
  on public.teams for update to authenticated
  using (public.has_team_role(id, auth.uid(), 'admin'))
  with check (public.has_team_role(id, auth.uid(), 'admin'));

create policy "teams delete by owner"
  on public.teams for delete to authenticated
  using (owner_id = auth.uid());

-- ============ team_members policies ============
create policy "members readable by team"
  on public.team_members for select to authenticated
  using (user_id = auth.uid() or public.is_team_member(team_id, auth.uid()));

create policy "members insert by admin or self-join"
  on public.team_members for insert to authenticated
  with check (
    public.has_team_role(team_id, auth.uid(), 'admin')
    or exists (select 1 from public.teams t where t.id = team_id and t.owner_id = auth.uid())
    or (user_id = auth.uid() and exists (
      select 1 from public.team_invites i
      where i.team_id = team_members.team_id
        and i.status = 'pending'
        and lower(i.email) = lower(public.current_user_email())
        and i.role = team_members.role
    ))
  );

create policy "members update by admin"
  on public.team_members for update to authenticated
  using (public.has_team_role(team_id, auth.uid(), 'admin'))
  with check (public.has_team_role(team_id, auth.uid(), 'admin'));

create policy "members delete by admin or self"
  on public.team_members for delete to authenticated
  using (user_id = auth.uid() or public.has_team_role(team_id, auth.uid(), 'admin'));

-- ============ team_invites policies ============
create policy "invites readable by admins or invitee"
  on public.team_invites for select to authenticated
  using (
    public.has_team_role(team_id, auth.uid(), 'admin')
    or lower(email) = lower(public.current_user_email())
  );

create policy "invites insert by admins"
  on public.team_invites for insert to authenticated
  with check (public.has_team_role(team_id, auth.uid(), 'admin') and invited_by = auth.uid());

create policy "invites update by admins or invitee"
  on public.team_invites for update to authenticated
  using (
    public.has_team_role(team_id, auth.uid(), 'admin')
    or lower(email) = lower(public.current_user_email())
  )
  with check (
    public.has_team_role(team_id, auth.uid(), 'admin')
    or lower(email) = lower(public.current_user_email())
  );

create policy "invites delete by admins"
  on public.team_invites for delete to authenticated
  using (public.has_team_role(team_id, auth.uid(), 'admin'));

-- ============ scans: team access ============
create policy "team members can read shared scans"
  on public.scans for select to authenticated
  using (team_id is not null and public.is_team_member(team_id, auth.uid()));

create policy "team writers can update shared scans"
  on public.scans for update to authenticated
  using (team_id is not null and public.can_team_write(team_id, auth.uid()))
  with check (team_id is not null and public.can_team_write(team_id, auth.uid()));

-- ============ scan_issues: team access ============
create policy "team members can read shared issues"
  on public.scan_issues for select to authenticated
  using (public.scan_team(scan_id) is not null and public.is_team_member(public.scan_team(scan_id), auth.uid()));

create policy "team writers can update shared issues"
  on public.scan_issues for update to authenticated
  using (public.scan_team(scan_id) is not null and public.can_team_write(public.scan_team(scan_id), auth.uid()))
  with check (public.scan_team(scan_id) is not null and public.can_team_write(public.scan_team(scan_id), auth.uid()));

-- ============ issue_comments policies ============
create policy "comments readable by scan viewers"
  on public.issue_comments for select to authenticated
  using (public.can_read_scan(scan_id, auth.uid()));

create policy "comments insert by scan participants"
  on public.issue_comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_read_scan(scan_id, auth.uid())
    and (
      exists (select 1 from public.scans s where s.id = scan_id and s.user_id = auth.uid())
      or public.can_team_write(public.scan_team(scan_id), auth.uid())
    )
  );

create policy "comments update own"
  on public.issue_comments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "comments delete own or team admin"
  on public.issue_comments for delete to authenticated
  using (
    user_id = auth.uid()
    or (public.scan_team(scan_id) is not null and public.has_team_role(public.scan_team(scan_id), auth.uid(), 'admin'))
  );

-- ============ updated_at triggers ============
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger update_teams_updated_at before update on public.teams
  for each row execute function public.update_updated_at_column();
create trigger update_profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at_column();
create trigger update_issue_comments_updated_at before update on public.issue_comments
  for each row execute function public.update_updated_at_column();

create index if not exists idx_team_members_user on public.team_members(user_id);
create index if not exists idx_scans_team on public.scans(team_id);
create index if not exists idx_issue_comments_issue on public.issue_comments(issue_id);
