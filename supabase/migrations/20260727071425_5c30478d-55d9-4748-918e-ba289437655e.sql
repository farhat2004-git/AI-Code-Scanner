
revoke execute on function public.is_team_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.get_team_role(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.has_team_role(uuid, uuid, public.team_role) from public, anon, authenticated;
revoke execute on function public.can_team_write(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.scan_team(uuid) from public, anon, authenticated;
revoke execute on function public.can_read_scan(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.current_user_email() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;
