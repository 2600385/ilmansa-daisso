-- 일별 사용 추이 (관리자 통계 그래프용)
create or replace function public.admin_daily(p_from timestamptz default null)
returns table (day date, type text, division text, office text, cnt bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception '관리자만 볼 수 있습니다'; end if;
  return query
    select (e.created_at at time zone 'Asia/Seoul')::date, e.type, coalesce(e.division,''), coalesce(e.office,''), count(*)
      from public.events e
     where (p_from is null or e.created_at >= p_from) and e.type in ('open','present','basket','fav')
     group by 1, 2, 3, 4;
end $$;
revoke all on function public.admin_daily(timestamptz) from public, anon;
grant execute on function public.admin_daily(timestamptz) to authenticated;
