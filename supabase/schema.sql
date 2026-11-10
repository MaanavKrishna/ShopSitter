-- Shopsitter storage. The app talks to these tables with the service-role key from
-- server code only, so row level security is on with no public policies.

create table if not exists products (
  shop text not null check (shop in ('live', 'demo')),
  sku text not null,
  name text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  stock integer not null default 0,
  ref_image_url text,
  primary key (shop, sku)
);

create table if not exists visits (
  id text primary key,
  shop text not null check (shop in ('live', 'demo')),
  status text not null,
  opened_at bigint not null,
  last_settled_at bigint not null,
  data jsonb not null
);

create index if not exists visits_shop_opened on visits (shop, opened_at desc);
create index if not exists visits_shop_status on visits (shop, status);

alter table products enable row level security;
alter table visits enable row level security;

insert into storage.buckets (id, name, public)
values ('shelf', 'shelf', false)
on conflict (id) do nothing;
