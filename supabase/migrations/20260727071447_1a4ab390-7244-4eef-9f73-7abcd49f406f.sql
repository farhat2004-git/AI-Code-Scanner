
grant execute on function public.is_team_member(uuid, uuid) to authenticated;
grant execute on function public.get_team_role(uuid, uuid) to authenticated;
grant execute on function public.has_team_role(uuid, uuid, public.team_role) to authenticated;
grant execute on function public.can_team_write(uuid, uuid) to authenticated;
grant execute on function public.scan_team(uuid) to authenticated;
grant execute on function public.can_read_scan(uuid, uuid) to authenticated;
grant execute on function public.current_user_email() to authenticated;
