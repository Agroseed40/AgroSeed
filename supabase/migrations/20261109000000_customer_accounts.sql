-- Customer account storage for the Supabase auth provider.
-- Run this in Supabase SQL Editor before setting CUSTOMER_AUTH_PROVIDER=supabase.

create table if not exists public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text not null unique,
  name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_carts (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  items_json jsonb not null default '[]'::jsonb,
  guest_snapshot_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  phone text not null,
  line1 text not null,
  line2 text,
  city text not null,
  state text not null,
  pincode char(6) not null check (pincode ~ '^[0-9]{6}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_addresses_owner_idx
  on public.customer_addresses (customer_id, is_default desc, created_at desc);
create unique index if not exists customer_addresses_one_default_idx
  on public.customer_addresses (customer_id) where is_default;

alter table public.customers enable row level security;
alter table public.customer_carts enable row level security;
alter table public.customer_addresses enable row level security;

grant select, insert, update on public.customers to authenticated;
grant select, insert, update on public.customer_carts to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;

drop policy if exists customers_select_own on public.customers;
create policy customers_select_own on public.customers
  for select to authenticated using (auth.uid() = id);
drop policy if exists customers_insert_own on public.customers;
create policy customers_insert_own on public.customers
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists customers_update_own on public.customers;
create policy customers_update_own on public.customers
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists customer_carts_select_own on public.customer_carts;
create policy customer_carts_select_own on public.customer_carts
  for select to authenticated using (auth.uid() = customer_id);
drop policy if exists customer_carts_insert_own on public.customer_carts;
create policy customer_carts_insert_own on public.customer_carts
  for insert to authenticated with check (auth.uid() = customer_id);
drop policy if exists customer_carts_update_own on public.customer_carts;
create policy customer_carts_update_own on public.customer_carts
  for update to authenticated using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

drop policy if exists customer_addresses_select_own on public.customer_addresses;
create policy customer_addresses_select_own on public.customer_addresses
  for select to authenticated using (auth.uid() = customer_id);
drop policy if exists customer_addresses_insert_own on public.customer_addresses;
create policy customer_addresses_insert_own on public.customer_addresses
  for insert to authenticated with check (auth.uid() = customer_id);
drop policy if exists customer_addresses_update_own on public.customer_addresses;
create policy customer_addresses_update_own on public.customer_addresses
  for update to authenticated using (auth.uid() = customer_id) with check (auth.uid() = customer_id);
drop policy if exists customer_addresses_delete_own on public.customer_addresses;
create policy customer_addresses_delete_own on public.customer_addresses
  for delete to authenticated using (auth.uid() = customer_id);

create or replace function public.merge_customer_cart(p_guest_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid := auth.uid();
  v_account_items jsonb;
  v_prior_guest_items jsonb;
  v_merged_items jsonb;
begin
  if v_customer_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_guest_items is null or jsonb_typeof(p_guest_items) <> 'array' or jsonb_array_length(p_guest_items) > 50 then
    raise exception 'Invalid cart contents' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_guest_items) as rows(item)
    where coalesce(item->>'sku', '') !~ '^[A-Za-z0-9_-]{1,64}$'
      or coalesce(item->>'quantity', '') !~ '^[0-9]+$'
      or (item->>'quantity')::integer < 1
      or (item->>'quantity')::integer > 99
  ) then
    raise exception 'Invalid cart item' using errcode = '22023';
  end if;

  insert into public.customer_carts (customer_id) values (v_customer_id)
    on conflict (customer_id) do nothing;
  select items_json, guest_snapshot_json
    into v_account_items, v_prior_guest_items
    from public.customer_carts
    where customer_id = v_customer_id
    for update;

  with account_map as (
    select coalesce(jsonb_object_agg(item->>'sku', (item->>'quantity')::integer), '{}'::jsonb) as values
      from jsonb_array_elements(coalesce(v_account_items, '[]'::jsonb)) as rows(item)
  ), guest_map as (
    select coalesce(jsonb_object_agg(item->>'sku', (item->>'quantity')::integer), '{}'::jsonb) as values
      from jsonb_array_elements(p_guest_items) as rows(item)
  ), prior_map as (
    select coalesce(jsonb_object_agg(item->>'sku', (item->>'quantity')::integer), '{}'::jsonb) as values
      from jsonb_array_elements(coalesce(v_prior_guest_items, '[]'::jsonb)) as rows(item)
  ), quantities as (
    select keys.sku,
      least(99,
        coalesce((account_map.values->>keys.sku)::integer, 0)
        + greatest(0,
          coalesce((guest_map.values->>keys.sku)::integer, 0)
          - coalesce((prior_map.values->>keys.sku)::integer, 0)
        )
      ) as quantity
    from account_map cross join guest_map cross join prior_map
    cross join lateral jsonb_object_keys(account_map.values || guest_map.values) as keys(sku)
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('sku', sku, 'quantity', quantity) order by sku)
      filter (where quantity > 0),
    '[]'::jsonb
  ) into v_merged_items
  from quantities;

  update public.customer_carts
    set items_json = v_merged_items,
        guest_snapshot_json = p_guest_items,
        updated_at = now()
    where customer_id = v_customer_id;
  return v_merged_items;
end;
$$;

create or replace function public.save_customer_address(
  p_id uuid,
  p_name text,
  p_phone text,
  p_line1 text,
  p_line2 text,
  p_city text,
  p_state text,
  p_pincode text,
  p_is_default boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid := auth.uid();
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_saved_id uuid;
begin
  if v_customer_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_pincode !~ '^[0-9]{6}$' then
    raise exception 'Invalid PIN code' using errcode = '22023';
  end if;
  if coalesce(p_is_default, false) then
    update public.customer_addresses
      set is_default = false, updated_at = now()
      where customer_id = v_customer_id and is_default and id <> v_id;
  end if;
  insert into public.customer_addresses
    (id, customer_id, name, phone, line1, line2, city, state, pincode, is_default)
  values
    (v_id, v_customer_id, p_name, p_phone, p_line1, nullif(p_line2, ''), p_city, p_state, p_pincode, coalesce(p_is_default, false))
  on conflict (id) do update set
    name = excluded.name,
    phone = excluded.phone,
    line1 = excluded.line1,
    line2 = excluded.line2,
    city = excluded.city,
    state = excluded.state,
    pincode = excluded.pincode,
    is_default = excluded.is_default,
    updated_at = now()
  where public.customer_addresses.customer_id = v_customer_id
  returning id into v_saved_id;
  if v_saved_id is null then
    raise exception 'Address not found in this account' using errcode = '42501';
  end if;
  return v_saved_id;
end;
$$;

grant execute on function public.merge_customer_cart(jsonb) to authenticated;
grant execute on function public.save_customer_address(uuid, text, text, text, text, text, text, text, boolean) to authenticated;
