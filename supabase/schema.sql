-- Apply in the SQL editor of a NEW Supabase project. Never run against an unrelated project.
create extension if not exists pgcrypto;
create table if not exists public.competitions (
 id uuid primary key default gen_random_uuid(), title text not null, short_title text not null,
 tagline text not null default 'Celebrating Knowledge. Inspiring Excellence.',
 year integer not null default 2026, venue text, logo_url text, primary_color text not null default '#b9924b',
 starts_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.categories (
 id uuid primary key default gen_random_uuid(),competition_id uuid not null references public.competitions(id) on delete cascade,name text not null,
 unique(competition_id,name)
);
create table if not exists public.schools (
 id uuid primary key default gen_random_uuid(),name text not null,short_name text not null,logo_url text,created_at timestamptz not null default now()
);
create table if not exists public.teams (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),category_id uuid not null references public.categories(id),
 unique(school_id,category_id)
);
create table if not exists public.competition_groups (
 id uuid primary key default gen_random_uuid(),competition_id uuid not null references public.competitions(id),
 category_id uuid not null references public.categories(id),name text not null,stage text not null default 'Opening Round',
 status text not null default 'scheduled' check(status in ('scheduled','live','final')),created_at timestamptz not null default now(),
 unique(category_id,stage,name)
);
create table if not exists public.group_teams (
 group_id uuid not null references public.competition_groups(id) on delete cascade,
 team_id uuid not null references public.teams(id) on delete cascade,primary key(group_id,team_id)
);
create table if not exists public.scores (
 group_id uuid not null,team_id uuid not null,points integer not null default 0 check(points>=0),version bigint not null default 0,
 updated_at timestamptz not null default now(),primary key(group_id,team_id),
 foreign key(group_id,team_id) references public.group_teams(group_id,team_id) on delete cascade
);
create table if not exists public.admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('super_admin','admin','scorekeeper')),
 created_at timestamptz not null default now()
);
create table if not exists public.score_events (
 id bigint generated always as identity primary key, group_id uuid not null,team_id uuid not null,
 actor_id uuid not null references auth.users(id),delta integer not null,before_points integer not null,
 after_points integer not null,created_at timestamptz not null default now()
);
create index if not exists idx_categories_competition on public.categories(competition_id);
create index if not exists idx_groups_competition on public.competition_groups(competition_id);
create index if not exists idx_group_teams_team on public.group_teams(team_id);
create index if not exists idx_score_events_group on public.score_events(group_id,created_at desc);
-- Expose only a narrowly scoped public leaderboard projection.
create or replace view public.leaderboard_entries with (security_invoker=true) as
 select g.competition_id,gt.group_id,t.id as team_id,s.name,s.short_name,coalesce(sc.points,0)::integer as score
 from public.group_teams gt join public.competition_groups g on g.id=gt.group_id
 join public.teams t on t.id=gt.team_id join public.schools s on s.id=t.school_id
 left join public.scores sc on sc.group_id=gt.group_id and sc.team_id=gt.team_id;
-- Row level security. Public views expose only public event information.
alter table public.competitions enable row level security;
alter table public.categories enable row level security;
alter table public.schools enable row level security;
alter table public.teams enable row level security;
alter table public.competition_groups enable row level security;
alter table public.group_teams enable row level security;
alter table public.scores enable row level security;
alter table public.admins enable row level security;
alter table public.score_events enable row level security;
create policy "Public competition metadata" on public.competitions for select to anon,authenticated using(true);
create policy "Public categories" on public.categories for select to anon,authenticated using(true);
create policy "Public schools" on public.schools for select to anon,authenticated using(true);
create policy "Public team information" on public.teams for select to anon,authenticated using(true);
create policy "Public groups" on public.competition_groups for select to anon,authenticated using(true);
create policy "Public group assignments" on public.group_teams for select to anon,authenticated using(true);
create policy "Public scores" on public.scores for select to anon,authenticated using(true);
create policy "Own admin record" on public.admins for select to authenticated using(user_id=(select auth.uid()));
create policy "Admins read score events" on public.score_events for select to authenticated
 using(exists(select 1 from public.admins a where a.user_id=(select auth.uid()) and a.role in ('super_admin','admin','scorekeeper')));
-- No direct score writes. Privileged functions enforce authorization and auditability.
create or replace function public.adjust_score(p_group_id uuid,p_team_id uuid,p_delta integer)
returns integer language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_before integer;v_after integer;
begin
 if v_actor is null or not exists(select 1 from public.admins where user_id=v_actor and role in ('super_admin','admin','scorekeeper')) then
  raise exception 'Not authorized to update scores';end if;
 if not exists(select 1 from public.competition_groups where id=p_group_id and status='live') then raise exception 'Group scoring is not live';end if;
 if abs(p_delta)>100 then raise exception 'Score adjustment exceeds maximum per operation';end if;
 insert into public.scores(group_id,team_id,points) values(p_group_id,p_team_id,0)
 on conflict(group_id,team_id) do nothing;
 select points into v_before from public.scores where group_id=p_group_id and team_id=p_team_id for update;
 v_after:=v_before+p_delta;
 if v_after<0 then raise exception 'Score cannot be negative';end if;
 update public.scores set points=v_after,version=version+1,updated_at=now() where group_id=p_group_id and team_id=p_team_id;
 insert into public.score_events(group_id,team_id,actor_id,delta,before_points,after_points)
 values(p_group_id,p_team_id,v_actor,p_delta,v_before,v_after);
 return v_after;
end;$$;
create or replace function public.finalize_group(p_group_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.admins where user_id=auth.uid() and role in ('super_admin','admin')) then
  raise exception 'Only administrators can finalize results';end if;
 update public.competition_groups set status='final' where id=p_group_id and status='live';
 if not found then raise exception 'Group is not live or does not exist';end if;
end;$$;
revoke all on function public.adjust_score(uuid,uuid,integer) from public,anon;
revoke all on function public.finalize_group(uuid) from public,anon;
grant execute on function public.adjust_score(uuid,uuid,integer) to authenticated;
grant execute on function public.finalize_group(uuid) to authenticated;
grant select on public.competitions,public.categories,public.schools,public.teams,public.competition_groups,public.group_teams,public.scores,public.leaderboard_entries to anon,authenticated;
grant select on public.admins to authenticated;
grant select on public.score_events to authenticated;
-- Subscribe to the scores and competition_groups tables after enabling the Realtime publication.
do $$ begin
 alter publication supabase_realtime add table public.scores;
 exception when duplicate_object then null;end $$;
do $$ begin
 alter publication supabase_realtime add table public.competition_groups;
 exception when duplicate_object then null;end $$;
create policy "Admins update branding" on public.competitions for update to authenticated
 using(exists(select 1 from public.admins where user_id=(select auth.uid()) and role in ('super_admin','admin')))
 with check(exists(select 1 from public.admins where user_id=(select auth.uid()) and role in ('super_admin','admin')));
grant update(title,short_title,tagline,primary_color,logo_url) on public.competitions to authenticated;
