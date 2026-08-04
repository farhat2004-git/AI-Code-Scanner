create schema if not exists app_private;
grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.is_team_member(_team_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.team_members where team_id = _team_id and user_id = _user_id);
$$;

create or replace function app_private.has_team_role(_team_id uuid, _user_id uuid, _role public.team_role)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.team_members where team_id = _team_id and user_id = _user_id and role = _role);
$$;

create or replace function app_private.can_team_write(_team_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.team_members where team_id = _team_id and user_id = _user_id and role in ('admin','developer'));
$$;

create or replace function app_private.scan_team(_scan_id uuid)
returns uuid language sql stable security definer set search_path to 'public' as $$
  select team_id from public.scans where id = _scan_id;
$$;

create or replace function app_private.can_read_scan(_scan_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.scans s
    where s.id = _scan_id
      and (s.user_id = _user_id or (s.team_id is not null and app_private.is_team_member(s.team_id, _user_id)))
  );
$$;

create or replace function app_private.current_user_email()
returns text language sql stable security definer set search_path to 'public' as $$
  select email from public.profiles where id = auth.uid();
$$;

create or replace function app_private.get_team_role(_team_id uuid, _user_id uuid)
returns public.team_role language sql stable security definer set search_path to 'public' as $$
  select role from public.team_members where team_id = _team_id and user_id = _user_id;
$$;

revoke all on function
  app_private.is_team_member(uuid, uuid),
  app_private.has_team_role(uuid, uuid, public.team_role),
  app_private.can_team_write(uuid, uuid),
  app_private.scan_team(uuid),
  app_private.can_read_scan(uuid, uuid),
  app_private.current_user_email(),
  app_private.get_team_role(uuid, uuid)
from public;

grant execute on function
  app_private.is_team_member(uuid, uuid),
  app_private.has_team_role(uuid, uuid, public.team_role),
  app_private.can_team_write(uuid, uuid),
  app_private.scan_team(uuid),
  app_private.can_read_scan(uuid, uuid),
  app_private.current_user_email(),
  app_private.get_team_role(uuid, uuid)
to authenticated, service_role;

-- teams
drop policy if exists "teams readable by members" on public.teams;
create policy "teams readable by members" on public.teams for select to authenticated
using ((owner_id = auth.uid()) or app_private.is_team_member(id, auth.uid()));

drop policy if exists "teams update by admins" on public.teams;
create policy "teams update by admins" on public.teams for update to authenticated
using (app_private.has_team_role(id, auth.uid(), 'admin')) with check (app_private.has_team_role(id, auth.uid(), 'admin'));

-- team_members
drop policy if exists "members readable by team" on public.team_members;
create policy "members readable by team" on public.team_members for select to authenticated
using ((user_id = auth.uid()) or app_private.is_team_member(team_id, auth.uid()));

drop policy if exists "members delete by admin or self" on public.team_members;
create policy "members delete by admin or self" on public.team_members for delete to authenticated
using ((user_id = auth.uid()) or app_private.has_team_role(team_id, auth.uid(), 'admin'));

drop policy if exists "members update by admin" on public.team_members;
create policy "members update by admin" on public.team_members for update to authenticated
using (app_private.has_team_role(team_id, auth.uid(), 'admin')) with check (app_private.has_team_role(team_id, auth.uid(), 'admin'));

drop policy if exists "members insert by admin or self-join" on public.team_members;
create policy "members insert by admin or self-join" on public.team_members for insert to authenticated
with check (
  app_private.has_team_role(team_id, auth.uid(), 'admin')
  or exists (select 1 from public.teams t where t.id = team_members.team_id and t.owner_id = auth.uid())
  or ((user_id = auth.uid()) and exists (
    select 1 from public.team_invites i
    where i.team_id = team_members.team_id and i.status = 'pending'
      and lower(i.email) = lower(app_private.current_user_email())
      and i.role = team_members.role))
);

-- team_invites
drop policy if exists "invites delete by admins" on public.team_invites;
create policy "invites delete by admins" on public.team_invites for delete to authenticated
using (app_private.has_team_role(team_id, auth.uid(), 'admin'));

drop policy if exists "invites insert by admins" on public.team_invites;
create policy "invites insert by admins" on public.team_invites for insert to authenticated
with check (app_private.has_team_role(team_id, auth.uid(), 'admin') and invited_by = auth.uid());

drop policy if exists "invites readable by admins or invitee" on public.team_invites;
create policy "invites readable by admins or invitee" on public.team_invites for select to authenticated
using (app_private.has_team_role(team_id, auth.uid(), 'admin') or lower(email) = lower(app_private.current_user_email()));

drop policy if exists "invites update by admins or invitee" on public.team_invites;
create policy "invites update by admins or invitee" on public.team_invites for update to authenticated
using (app_private.has_team_role(team_id, auth.uid(), 'admin') or lower(email) = lower(app_private.current_user_email()))
with check (app_private.has_team_role(team_id, auth.uid(), 'admin') or lower(email) = lower(app_private.current_user_email()));

-- profiles
drop policy if exists "profiles readable by teammates" on public.profiles;
create policy "profiles readable by teammates" on public.profiles for select to authenticated
using (exists (
  select 1 from public.team_members m1 join public.team_members m2 on m1.team_id = m2.team_id
  where m1.user_id = auth.uid() and m2.user_id = profiles.id));

-- scans
drop policy if exists "team members can read shared scans" on public.scans;
create policy "team members can read shared scans" on public.scans for select to authenticated
using ((team_id is not null) and app_private.is_team_member(team_id, auth.uid()));

drop policy if exists "team writers can update shared scans" on public.scans;
create policy "team writers can update shared scans" on public.scans for update to authenticated
using ((team_id is not null) and app_private.can_team_write(team_id, auth.uid()))
with check ((team_id is not null) and app_private.can_team_write(team_id, auth.uid()));

-- scan_issues
drop policy if exists "team members can read shared issues" on public.scan_issues;
create policy "team members can read shared issues" on public.scan_issues for select to authenticated
using ((app_private.scan_team(scan_id) is not null) and app_private.is_team_member(app_private.scan_team(scan_id), auth.uid()));

drop policy if exists "team writers can update shared issues" on public.scan_issues;
create policy "team writers can update shared issues" on public.scan_issues for update to authenticated
using ((app_private.scan_team(scan_id) is not null) and app_private.can_team_write(app_private.scan_team(scan_id), auth.uid()))
with check ((app_private.scan_team(scan_id) is not null) and app_private.can_team_write(app_private.scan_team(scan_id), auth.uid()));

-- issue_comments
drop policy if exists "comments readable by scan viewers" on public.issue_comments;
create policy "comments readable by scan viewers" on public.issue_comments for select to authenticated
using (app_private.can_read_scan(scan_id, auth.uid()));

drop policy if exists "comments delete own or team admin" on public.issue_comments;
create policy "comments delete own or team admin" on public.issue_comments for delete to authenticated
using ((user_id = auth.uid()) or ((app_private.scan_team(scan_id) is not null) and app_private.has_team_role(app_private.scan_team(scan_id), auth.uid(), 'admin')));

drop policy if exists "comments insert by scan participants" on public.issue_comments;
create policy "comments insert by scan participants" on public.issue_comments for insert to authenticated
with check (
  (user_id = auth.uid()) and app_private.can_read_scan(scan_id, auth.uid())
  and (exists (select 1 from public.scans s where s.id = issue_comments.scan_id and s.user_id = auth.uid())
       or app_private.can_team_write(app_private.scan_team(scan_id), auth.uid()))
);

-- drop old public-schema helpers
drop function if exists public.can_read_scan(uuid, uuid);
drop function if exists public.can_team_write(uuid, uuid);
drop function if exists public.current_user_email();
drop function if exists public.get_team_role(uuid, uuid);
drop function if exists public.has_team_role(uuid, uuid, public.team_role);
drop function if exists public.is_team_member(uuid, uuid);
drop function if exists public.scan_team(uuid);

-- notifications: system-generated only
drop policy if exists "own notifications insert" on public.notifications;
revoke insert on public.notifications from authenticated, anon;
grant all on public.notifications to service_role;