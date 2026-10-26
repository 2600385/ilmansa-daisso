-- =====================================================================
-- 일만사 다있소 · Supabase 초기 설정 (처음 한 번만 실행)
-- SQL Editor에 전체를 붙여넣고 Run을 누르면 됩니다.
-- 실행이 끝나면 결과 칸에 관리자 사번과 처음 비밀번호가 나옵니다.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- 표 ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  emp_no text unique not null,
  name text not null default '',
  division text not null default '',
  office text not null default '',
  role text not null default 'mr' check (role in ('mr','admin')),
  created_at timestamptz not null default now()
);

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('tool','site','brochure','notice')),
  places text[] not null default '{}',
  is_month boolean not null default false,
  for_doctor boolean not null default false,
  url text,
  file_path text,
  description text not null default '',
  doctor_desc text not null default '',
  made_by text not null default '',
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  stage text not null check (stage in ('s1','s2','s3')),
  type text not null check (type in ('base','obj')),
  title text not null,
  body text not null default '',
  tool_id uuid references public.tools(id) on delete set null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  dept text not null default '',
  tel text not null default '',
  places text[] not null default '{}',
  sort int not null default 0
);

create table public.favorites (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tool_id)
);

-- 사용 기록: 사번이 아니라 사무소·사업부 단위로만 집계해서 보여줍니다
create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('login','open','fav','unfav','basket','present','copy','request','mode')),
  target text,
  office text,
  division text,
  created_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 1000),
  place text,
  status text not null default '접수' check (status in ('접수','만드는 중','올림')),
  office text,
  division text,
  created_at timestamptz not null default now()
);

create index on public.events (created_at);
create index on public.favorites (tool_id);

-- ---------- 권한 도우미 ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

-- 기록과 요청에 작성자 소속을 서버에서 채움 (화면에서 조작 불가)
create or replace function public.stamp_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := auth.uid();
  select p.office, p.division into new.office, new.division from public.profiles p where p.id = auth.uid();
  return new;
end $$;

create trigger events_stamp before insert on public.events for each row execute function public.stamp_member();
create trigger requests_stamp before insert on public.requests for each row execute function public.stamp_member();

-- ---------- 보안 규칙 (RLS) ----------
alter table public.profiles enable row level security;
alter table public.tools enable row level security;
alter table public.scripts enable row level security;
alter table public.contacts enable row level security;
alter table public.favorites enable row level security;
alter table public.events enable row level security;
alter table public.requests enable row level security;

create policy "본인 또는 관리자 조회" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy "로그인한 사람 조회" on public.tools for select to authenticated using (active or public.is_admin());
create policy "관리자 등록" on public.tools for insert to authenticated with check (public.is_admin());
create policy "관리자 수정" on public.tools for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "관리자 삭제" on public.tools for delete to authenticated using (public.is_admin());

create policy "로그인한 사람 조회" on public.scripts for select to authenticated using (true);
create policy "관리자 등록" on public.scripts for insert to authenticated with check (public.is_admin());
create policy "관리자 수정" on public.scripts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "관리자 삭제" on public.scripts for delete to authenticated using (public.is_admin());

create policy "로그인한 사람 조회" on public.contacts for select to authenticated using (true);
create policy "관리자 등록" on public.contacts for insert to authenticated with check (public.is_admin());
create policy "관리자 수정" on public.contacts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "관리자 삭제" on public.contacts for delete to authenticated using (public.is_admin());

create policy "내 즐겨찾기 조회" on public.favorites for select to authenticated using (user_id = (select auth.uid()));
create policy "내 즐겨찾기 추가" on public.favorites for insert to authenticated with check (user_id = (select auth.uid()));
create policy "내 즐겨찾기 삭제" on public.favorites for delete to authenticated using (user_id = (select auth.uid()));

-- 기록은 쓰기만 가능. 관리자도 원본은 못 보고 아래 집계 함수로만 봄
create policy "기록 남기기" on public.events for insert to authenticated with check (true);

create policy "요청 보내기" on public.requests for insert to authenticated with check (true);
create policy "내 요청 또는 관리자 조회" on public.requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy "관리자 상태 변경" on public.requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 계정 만들기 (사번 로그인) ----------
-- 사번은 내부적으로 '사번@daisso.internal' 형태의 로그인 아이디가 됩니다
create or replace function public._upsert_member(
  p_emp_no text, p_name text, p_division text, p_office text, p_role text, p_password text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_email text;
begin
  if p_emp_no is null or trim(p_emp_no) !~ '^[0-9A-Za-z]{3,20}$' then
    raise exception '사번은 영문·숫자 3~20자로 넣어주세요';
  end if;
  if coalesce(p_role,'mr') not in ('mr','admin') then raise exception '권한 값이 올바르지 않습니다'; end if;
  v_email := lower(trim(p_emp_no)) || '@daisso.internal';
  select id into v_id from auth.users where email = v_email;
  if v_id is null then
    if p_password is null or length(p_password) < 6 then
      raise exception '새 계정은 6자 이상 비밀번호가 필요합니다';
    end if;
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  elsif p_password is not null and p_password <> '' then
    if length(p_password) < 6 then raise exception '비밀번호는 6자 이상이어야 합니다'; end if;
    update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
      where id = v_id;
  end if;
  insert into public.profiles (id, emp_no, name, division, office, role)
  values (v_id, trim(p_emp_no), coalesce(p_name,''), coalesce(p_division,''), coalesce(p_office,''), coalesce(p_role,'mr'))
  on conflict (id) do update set name = excluded.name, division = excluded.division,
    office = excluded.office, role = excluded.role;
  return v_id;
end $$;

-- 관리자 화면에서 부르는 함수들 (관리자만 실행됨)
create or replace function public.admin_upsert_member(
  p_emp_no text, p_name text, p_division text, p_office text, p_role text default 'mr', p_password text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있습니다'; end if;
  return public._upsert_member(p_emp_no, p_name, p_division, p_office, p_role, p_password);
end $$;

create or replace function public.admin_delete_member(p_emp_no text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception '관리자만 할 수 있습니다'; end if;
  delete from auth.users where email = lower(trim(p_emp_no)) || '@daisso.internal' and id <> auth.uid();
end $$;

create or replace function public.admin_stats(p_from timestamptz default null)
returns table (target text, type text, division text, office text, cnt bigint, people bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception '관리자만 볼 수 있습니다'; end if;
  return query
    select e.target, e.type, coalesce(e.division,''), coalesce(e.office,''), count(*), count(distinct e.user_id)
      from public.events e where p_from is null or e.created_at >= p_from
      group by e.target, e.type, e.division, e.office
    union all
    select null::text, 'any', coalesce(e.division,''), coalesce(e.office,''), count(*), count(distinct e.user_id)
      from public.events e where p_from is null or e.created_at >= p_from
      group by e.division, e.office
    union all
    select f.tool_id::text, 'fav_now', coalesce(p.division,''), coalesce(p.office,''), count(*), count(distinct f.user_id)
      from public.favorites f join public.profiles p on p.id = f.user_id
      group by f.tool_id, p.division, p.office;
end $$;

revoke all on function public._upsert_member(text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_upsert_member(text,text,text,text,text,text) from public, anon;
revoke all on function public.admin_delete_member(text) from public, anon;
revoke all on function public.admin_stats(timestamptz) from public, anon;
grant execute on function public.admin_upsert_member(text,text,text,text,text,text) to authenticated;
grant execute on function public.admin_delete_member(text) to authenticated;
grant execute on function public.admin_stats(timestamptz) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------- 파일 보관함 (PDF·이미지) ----------
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;
create policy "다있소 파일 조회" on storage.objects for select to authenticated using (bucket_id = 'files');
create policy "다있소 파일 올리기" on storage.objects for insert to authenticated with check (bucket_id = 'files' and public.is_admin());
create policy "다있소 파일 수정" on storage.objects for update to authenticated using (bucket_id = 'files' and public.is_admin());
create policy "다있소 파일 삭제" on storage.objects for delete to authenticated using (bucket_id = 'files' and public.is_admin());

-- ---------- 처음 데이터 ----------
insert into public.tools (name, kind, places, is_month, for_doctor, description, doctor_desc, made_by, sort) values
  ('일만사 수익 시뮬레이터', 'tool', '{new}', true, true, '환자 수를 넣으면 일만사 예상 수익과 혈액검사 패키지 금액을 바로 계산합니다.', '우리 병원 환자 수로 일만사 예상 수익을 계산해 봅니다.', '이혜선 CM', 1),
  ('일만사 등록 이지플래너', 'tool', '{new,keep}', false, true, '원장님께 일만사 수가 수입을 한눈에 보여주는 상담용 화면입니다.', '일만사 수가와 등록 절차를 한눈에 확인합니다.', '이혜선 CM', 2),
  ('검진센터 제안 브로셔', 'brochure', '{new}', true, true, '병원명과 담당자명을 넣으면 거래처 맞춤 제안 포스터가 만들어집니다.', '병원에 맞춘 일만사 제안서입니다.', '이혜선 CM', 3),
  ('AX004 청구증대 툴', 'tool', '{keep}', false, false, '환자는 많은데 교육상담 청구가 낮은 거래처를 찾아냅니다.', '', '이혜선 CM', 4),
  ('청구현황 대시보드', 'tool', '{keep}', false, false, '사무소별 청구 순위와 월별 추이를 봅니다.', '', '이혜선 CM', 5);

insert into public.scripts (stage, type, title, body, tool_id, sort)
select s.stage, s.type, s.title, '[문구 입력]', t.id, s.sort
from (values
  ('s1','base','첫 인사와 일만사 소개','검진센터 제안 브로셔',1),
  ('s1','base','예상 수익 보여드리기','일만사 수익 시뮬레이터',2),
  ('s1','obj','인력이 없어요',null,3),
  ('s1','obj','수익이 얼마나 돼요?','일만사 수익 시뮬레이터',4),
  ('s1','obj','환자들이 싫어해요',null,5),
  ('s2','base','등록 절차 안내','일만사 등록 이지플래너',1),
  ('s2','base','웰체크 셋팅 안내',null,2),
  ('s2','obj','절차가 복잡해 보여요','일만사 등록 이지플래너',3),
  ('s3','base','첫 청구 안내',null,1),
  ('s3','base','공복검사 루틴 안내',null,2),
  ('s3','obj','청구가 잘 안 돼요','AX004 청구증대 툴',3)
) as s(stage, type, title, tool_name, sort)
left join public.tools t on t.name = s.tool_name;

insert into public.contacts (topic, dept, tel, places, sort) values
  ('청구 기준·수가 문의', '[부서명]', '[대표번호]', '{keep}', 1),
  ('일만사 사업 운영 문의', '[부서명]', '[대표번호]', '{new,keep}', 2),
  ('웰체크 셋팅·시스템 문의', '[부서명]', '[대표번호]', '{new}', 3);

-- ---------- 첫 관리자 계정 ----------
-- 아래 결과 칸에 나오는 처음 비밀번호로 로그인한 뒤, 바로 바꿔주세요.
with pw as (select substr(md5(random()::text || clock_timestamp()::text), 1, 10) as p)
select '2600385' as "관리자 사번", p as "처음 비밀번호",
       public._upsert_member('2600385', '[이름]', '[사업부]', '경인1사무소', 'admin', p) is not null as "만들어짐"
from pw;
