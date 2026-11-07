-- Example starter competition. Execute AFTER schema.sql in your NEW Supabase project.
-- School records below are fictional preview data, not actual registered participants.
with c as (
 insert into public.competitions(title,short_title,tagline,year,venue)
 values('IMJ Group Annual Schools Quiz Competition','IMJ Schools Quiz','Celebrating Knowledge. Inspiring Excellence.',2026,'Kaduna, Nigeria') returning id
), cat as (
 insert into public.categories(competition_id,name)
 select id,'Secondary Schools' from c union all select id,'Primary Schools' from c returning id,competition_id,name
), g as (
 insert into public.competition_groups(competition_id,category_id,name,stage,status)
 select competition_id,id,'Group A','Opening Round','live' from cat where name='Secondary Schools' returning id,category_id
), s as (
 insert into public.schools(name,short_name)
 values ('Greenfield International Academy','Greenfield Academy'),('Kaduna Capital School','Kaduna Capital'),('Bright Future College','Bright Future'),('Royal Scholars Academy','Royal Scholars'),('Al-Hikmah Model School','Al-Hikmah'),('Excellence International School','Excellence Int’l'),('Unity Comprehensive School','Unity School'),('Victory Model College','Victory College') returning id,name
), t as (
 insert into public.teams(school_id,category_id)
 select s.id,cat.id from s cross join cat where cat.name='Secondary Schools' returning id,school_id
), gt as (
 insert into public.group_teams(group_id,team_id)
 select g.id,t.id from g cross join t returning group_id,team_id
)
insert into public.scores(group_id,team_id,points)
select gt.group_id,gt.team_id,0 from gt;
-- After creating an account in Supabase Authentication > Users, grant your own user UUID administrator access:
-- insert into public.admins(user_id,role) values ('YOUR_AUTH_USER_UUID','super_admin');
