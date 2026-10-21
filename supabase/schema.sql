create table if not exists public.bonds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  face_value numeric(14, 2) not null check (face_value > 0),
  coupon_rate numeric(7, 4) not null check (coupon_rate between 0 and 100),
  pay_day integer not null check (pay_day between 1 and 31),
  pay_months integer[] not null default '{}',
  is_cumulative boolean not null default false,
  maturity_date date not null,
  created_at timestamptz not null default now(),
  constraint valid_payment_months check (
    cardinality(pay_months) <= 12
    and pay_months <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  )
);

alter table public.bonds
  add column if not exists purchase_price numeric(14, 2) check (purchase_price > 0),
  add column if not exists purchased_on date;

create index if not exists bonds_user_id_idx on public.bonds (user_id);

grant select, insert, update, delete on public.bonds to authenticated;

alter table public.bonds enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bonds'
      and policyname = 'Users can read their own bonds'
  ) then
    create policy "Users can read their own bonds"
      on public.bonds for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bonds'
      and policyname = 'Users can add their own bonds'
  ) then
    create policy "Users can add their own bonds"
      on public.bonds for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bonds'
      and policyname = 'Users can update their own bonds'
  ) then
    create policy "Users can update their own bonds"
      on public.bonds for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bonds'
      and policyname = 'Users can delete their own bonds'
  ) then
    create policy "Users can delete their own bonds"
      on public.bonds for delete
      using (auth.uid() = user_id);
  end if;
end
$$;

notify pgrst, 'reload schema';