-- Rights-compliant SabSewa Local Master Product Catalogue.
-- This stores product structure and lawful image references only.
-- No third-party commercial website images, descriptions, logos or photos are included.

create extension if not exists "pgcrypto";

alter table public.catalog_items
  add column if not exists standard_title text,
  add column if not exists subcategory text,
  add column if not exists local_names jsonb not null default '{}'::jsonb,
  add column if not exists common_units text[] not null default '{}'::text[],
  add column if not exists brand_name text,
  add column if not exists pack_size text,
  add column if not exists search_keywords text[] not null default '{}'::text[],
  add column if not exists alternative_spellings text[] not null default '{}'::text[],
  add column if not exists image_status text not null default 'image_pending'
    check (image_status in ('image_pending', 'vendor_contributed_pending', 'approved_shared_image', 'private_vendor_image', 'takedown_disabled')),
  add column if not exists rights_notes text not null default 'No external third-party image is authorised for this master product by default.';

create table if not exists public.master_product_catalog (
  id uuid primary key default gen_random_uuid(),
  standard_title text not null,
  category text not null check (category in ('kirana', 'vegetables', 'fruits')),
  subcategory text not null,
  local_names jsonb not null default '{}'::jsonb,
  common_units text[] not null default '{}'::text[],
  brand_name text,
  pack_size text,
  search_keywords text[] not null default '{}'::text[],
  alternative_spellings text[] not null default '{}'::text[],
  image_status text not null default 'image_pending'
    check (image_status in ('image_pending', 'vendor_contributed_pending', 'approved_shared_image', 'private_vendor_image', 'takedown_disabled')),
  image_policy_note text not null default 'Use only vendor-contributed, manufacturer-authorised, properly licensed, or SabSewa-commissioned images.',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.master_product_image_consents (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.master_product_catalog(id) on delete restrict,
  source_vendor_id uuid references public.vendors(id) on delete restrict,
  source_user_id uuid,
  consent_text text not null,
  consent_terms_version text not null,
  original_filename text,
  content_checksum text not null,
  perceptual_hash text,
  declared_ownership boolean not null default false,
  allow_shared_catalogue_use boolean not null default false,
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdrawal_reason text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.master_product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.master_product_catalog(id) on delete restrict,
  product_title text not null,
  category text not null,
  subcategory text not null,
  s3_object_key text not null unique,
  thumbnail_object_key text not null unique,
  source_type text not null check (source_type in ('vendor_contributed', 'manufacturer_distributor_permission', 'commercial_reuse_licence', 'sabsewa_commissioned')),
  source_vendor_id uuid references public.vendors(id) on delete restrict,
  source_user_id uuid,
  licence_or_consent_reference uuid references public.master_product_image_consents(id) on delete restrict,
  consent_timestamp timestamptz,
  original_filename text,
  content_checksum text not null unique,
  perceptual_hash text,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected', 'disabled', 'takedown_pending')),
  approval_administrator uuid,
  approved_at timestamptz,
  rejection_reason text,
  withdrawal_requested_at timestamptz,
  withdrawal_reason text,
  takedown_status text not null default 'none'
    check (takedown_status in ('none', 'disputed', 'disabled', 'resolved')),
  takedown_reason text,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.master_product_image_takedown_audit (
  id uuid primary key default gen_random_uuid(),
  master_image_id uuid not null references public.master_product_images(id) on delete restrict,
  action text not null check (action in ('dispute_reported', 'disabled', 'reinstated', 'rejected', 'withdrawal_requested', 'withdrawal_accepted')),
  actor_user_id uuid,
  actor_role text,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.vendor_items
  add column if not exists master_product_id uuid references public.master_product_catalog(id) on delete set null,
  add column if not exists master_image_id uuid references public.master_product_images(id) on delete set null,
  add column if not exists image_reference_type text not null default 'vendor_private'
    check (image_reference_type in ('vendor_private', 'master_shared', 'image_pending'));

create index if not exists idx_master_product_catalog_category
  on public.master_product_catalog(category, subcategory, standard_title);

create index if not exists idx_master_product_catalog_keywords
  on public.master_product_catalog using gin(search_keywords);

create unique index if not exists uniq_master_product_catalog_business_key
  on public.master_product_catalog (
    standard_title,
    category,
    subcategory,
    coalesce(brand_name, ''),
    coalesce(pack_size, '')
  );

create index if not exists idx_master_product_images_product_status
  on public.master_product_images(product_id, moderation_status, takedown_status);

alter table public.master_product_catalog enable row level security;
alter table public.master_product_image_consents enable row level security;
alter table public.master_product_images enable row level security;
alter table public.master_product_image_takedown_audit enable row level security;

drop policy if exists "Authenticated users read active master catalogue" on public.master_product_catalog;
create policy "Authenticated users read active master catalogue"
  on public.master_product_catalog for select
  to authenticated
  using (is_active = true);

drop policy if exists "Admins manage master catalogue" on public.master_product_catalog;
create policy "Admins manage master catalogue"
  on public.master_product_catalog for all
  to authenticated
  using (public.is_company_admin())
  with check (public.is_company_admin());

drop policy if exists "Vendors read own image consents" on public.master_product_image_consents;
create policy "Vendors read own image consents"
  on public.master_product_image_consents for select
  to authenticated
  using (public.owns_vendor(source_vendor_id) or public.is_company_admin());

drop policy if exists "Users read approved active master images" on public.master_product_images;
create policy "Users read approved active master images"
  on public.master_product_images for select
  to authenticated
  using (moderation_status = 'approved' and takedown_status = 'none');

drop policy if exists "Admins read all master images" on public.master_product_images;
create policy "Admins read all master images"
  on public.master_product_images for select
  to authenticated
  using (public.is_company_admin());

drop policy if exists "Admins read takedown audit" on public.master_product_image_takedown_audit;
create policy "Admins read takedown audit"
  on public.master_product_image_takedown_audit for select
  to authenticated
  using (public.is_company_admin());

-- Inserts, approval, withdrawal and takedown actions should be performed by
-- protected backend service-role routes with full audit metadata.

insert into public.master_product_catalog
  (standard_title, category, subcategory, local_names, common_units, brand_name, pack_size, search_keywords, alternative_spellings, image_status)
values
  ('Rice', 'kirana', 'staples', '{"hi":["chawal"],"bn":["chal"],"ta":["arisi"],"kn":["akki"]}', array['kg','gram','packet'], null, null, array['rice','chawal','raw rice','boiled rice'], array['chaval','chaawal'], 'image_pending'),
  ('Wheat Flour', 'kirana', 'staples', '{"hi":["atta"],"pa":["atta"],"mr":["kanik"]}', array['kg','packet'], null, null, array['wheat flour','atta','chakki atta'], array['aata'], 'image_pending'),
  ('Besan', 'kirana', 'staples', '{"hi":["besan"],"gu":["chana lot"]}', array['gram','kg','packet'], null, null, array['besan','gram flour','chana flour'], array['basan'], 'image_pending'),
  ('Toor Dal', 'kirana', 'pulses', '{"hi":["arhar dal","toor dal"],"kn":["togari bele"]}', array['kg','gram','packet'], null, null, array['toor dal','arhar dal','pigeon pea'], array['tur dal'], 'image_pending'),
  ('Moong Dal', 'kirana', 'pulses', '{"hi":["moong dal"],"kn":["hesaru bele"]}', array['kg','gram','packet'], null, null, array['moong dal','green gram dal'], array['mung dal'], 'image_pending'),
  ('Masoor Dal', 'kirana', 'pulses', '{"hi":["masoor dal"]}', array['kg','gram','packet'], null, null, array['masoor dal','red lentil'], array['massor dal'], 'image_pending'),
  ('Chana Dal', 'kirana', 'pulses', '{"hi":["chana dal"]}', array['kg','gram','packet'], null, null, array['chana dal','bengal gram'], array['channa dal'], 'image_pending'),
  ('Sugar', 'kirana', 'staples', '{"hi":["chini","shakkar"]}', array['kg','gram','packet'], null, null, array['sugar','chini','shakkar'], array['cheeni'], 'image_pending'),
  ('Salt', 'kirana', 'staples', '{"hi":["namak"]}', array['kg','gram','packet'], null, null, array['salt','namak','iodised salt'], array['namak'], 'image_pending'),
  ('Jaggery', 'kirana', 'staples', '{"hi":["gud"]}', array['kg','gram','piece'], null, null, array['jaggery','gud'], array['gur'], 'image_pending'),
  ('Cooking Oil', 'kirana', 'staples', '{"hi":["tel"],"kn":["enne"]}', array['litre','ml','packet','bottle'], null, null, array['cooking oil','edible oil','tel'], array['oil'], 'image_pending'),
  ('Mustard Oil', 'kirana', 'staples', '{"hi":["sarson ka tel"]}', array['litre','ml','bottle'], null, null, array['mustard oil','sarson oil'], array['sarso tel'], 'image_pending'),
  ('Turmeric Powder', 'kirana', 'spices', '{"hi":["haldi powder"],"kn":["arisina pudi"]}', array['gram','packet'], null, null, array['turmeric','haldi','haldi powder'], array['haldi'], 'image_pending'),
  ('Red Chilli Powder', 'kirana', 'spices', '{"hi":["lal mirch powder"]}', array['gram','packet'], null, null, array['red chilli powder','lal mirch'], array['chili powder','mirchi powder'], 'image_pending'),
  ('Coriander Powder', 'kirana', 'spices', '{"hi":["dhaniya powder"]}', array['gram','packet'], null, null, array['coriander powder','dhaniya powder'], array['dhaniya'], 'image_pending'),
  ('Cumin Seeds', 'kirana', 'spices', '{"hi":["jeera"]}', array['gram','packet'], null, null, array['cumin','jeera','cumin seeds'], array['jira'], 'image_pending'),
  ('Garam Masala', 'kirana', 'spices', '{"hi":["garam masala"]}', array['gram','packet'], null, null, array['garam masala','spice mix'], array['garam masala powder'], 'image_pending'),
  ('Tea', 'kirana', 'beverages', '{"hi":["chai patti"]}', array['gram','packet'], null, null, array['tea','chai','chai patti'], array['tea powder'], 'image_pending'),
  ('Coffee', 'kirana', 'beverages', '{"hi":["coffee"]}', array['gram','packet','bottle'], null, null, array['coffee','coffee powder'], array['cofee'], 'image_pending'),
  ('Milk', 'kirana', 'dairy', '{"hi":["doodh"],"ta":["paal"],"kn":["haalu"]}', array['litre','ml','packet'], null, null, array['milk','doodh','packet milk'], array['dudh'], 'image_pending'),
  ('Curd', 'kirana', 'dairy', '{"hi":["dahi"]}', array['gram','kg','packet','cup'], null, null, array['curd','dahi','yogurt'], array['yoghurt'], 'image_pending'),
  ('Paneer', 'kirana', 'dairy', '{"hi":["paneer"]}', array['gram','packet'], null, null, array['paneer','cottage cheese'], array['panir'], 'image_pending'),
  ('Bread', 'kirana', 'packaged-food', '{"hi":["bread"]}', array['packet','piece'], null, null, array['bread','loaf'], array['bred'], 'image_pending'),
  ('Biscuits', 'kirana', 'packaged-food', '{"hi":["biscuit"]}', array['packet'], null, null, array['biscuits','cookies','biscuit packet'], array['biskut'], 'image_pending'),
  ('Noodles', 'kirana', 'packaged-food', '{"hi":["noodles"]}', array['packet'], null, null, array['noodles','instant noodles'], array['nudles'], 'image_pending'),
  ('Soap', 'kirana', 'personal-care', '{"hi":["sabun"]}', array['piece','pack'], null, null, array['soap','bath soap','sabun'], array['saabun'], 'image_pending'),
  ('Shampoo', 'kirana', 'personal-care', '{"hi":["shampoo"]}', array['ml','bottle','sachet'], null, null, array['shampoo','hair wash'], array['shampu'], 'image_pending'),
  ('Toothpaste', 'kirana', 'personal-care', '{"hi":["toothpaste","dant manjan"]}', array['gram','tube'], null, null, array['toothpaste','dental cream'], array['tooth paste'], 'image_pending'),
  ('Detergent Powder', 'kirana', 'household', '{"hi":["detergent powder"]}', array['kg','gram','packet'], null, null, array['detergent','washing powder'], array['detergent'], 'image_pending'),
  ('Dishwash Bar', 'kirana', 'household', '{"hi":["bartan sabun"]}', array['piece','pack'], null, null, array['dishwash bar','dish wash soap'], array['dish bar'], 'image_pending'),
  ('Potato', 'vegetables', 'root-vegetables', '{"hi":["aloo"],"bn":["alu"],"ta":["urulai"],"kn":["alugadde"]}', array['kg','gram'], null, null, array['potato','aloo'], array['alu'], 'image_pending'),
  ('Onion', 'vegetables', 'bulb-vegetables', '{"hi":["pyaz"],"bn":["peyaj"],"ta":["vengayam"],"kn":["eerulli"]}', array['kg','gram'], null, null, array['onion','pyaz'], array['pyaaz'], 'image_pending'),
  ('Tomato', 'vegetables', 'common-vegetables', '{"hi":["tamatar"],"ta":["thakkali"],"kn":["tomato"]}', array['kg','gram'], null, null, array['tomato','tamatar'], array['tomatoe'], 'image_pending'),
  ('Green Chilli', 'vegetables', 'common-vegetables', '{"hi":["hari mirch"]}', array['gram','kg'], null, null, array['green chilli','hari mirch'], array['green chili'], 'image_pending'),
  ('Ginger', 'vegetables', 'root-vegetables', '{"hi":["adrak"]}', array['gram','kg'], null, null, array['ginger','adrak'], array['adarak'], 'image_pending'),
  ('Garlic', 'vegetables', 'bulb-vegetables', '{"hi":["lahsun"]}', array['gram','kg'], null, null, array['garlic','lahsun'], array['lasun'], 'image_pending'),
  ('Coriander Leaves', 'vegetables', 'leafy-vegetables', '{"hi":["hara dhaniya"]}', array['bunch','gram'], null, null, array['coriander leaves','hara dhaniya','cilantro'], array['dhaniya leaves'], 'image_pending'),
  ('Spinach', 'vegetables', 'leafy-vegetables', '{"hi":["palak"]}', array['bunch','gram','kg'], null, null, array['spinach','palak'], array['paalak'], 'image_pending'),
  ('Cauliflower', 'vegetables', 'common-vegetables', '{"hi":["phool gobhi"]}', array['piece','kg'], null, null, array['cauliflower','phool gobhi'], array['gobi'], 'image_pending'),
  ('Cabbage', 'vegetables', 'common-vegetables', '{"hi":["patta gobhi"]}', array['piece','kg'], null, null, array['cabbage','patta gobhi'], array['band gobhi'], 'image_pending'),
  ('Carrot', 'vegetables', 'root-vegetables', '{"hi":["gajar"]}', array['kg','gram'], null, null, array['carrot','gajar'], array['gazar'], 'image_pending'),
  ('Beans', 'vegetables', 'common-vegetables', '{"hi":["beans","sem"]}', array['kg','gram'], null, null, array['beans','green beans'], array['french beans'], 'image_pending'),
  ('Capsicum', 'vegetables', 'common-vegetables', '{"hi":["shimla mirch"]}', array['kg','gram','piece'], null, null, array['capsicum','bell pepper','shimla mirch'], array['capcicum'], 'image_pending'),
  ('Brinjal', 'vegetables', 'common-vegetables', '{"hi":["baingan"],"ta":["kathirikai"]}', array['kg','gram'], null, null, array['brinjal','baingan','eggplant'], array['brinjal'], 'image_pending'),
  ('Bottle Gourd', 'vegetables', 'gourds', '{"hi":["lauki","dudhi"]}', array['piece','kg'], null, null, array['bottle gourd','lauki','dudhi'], array['ghiya'], 'image_pending'),
  ('Bitter Gourd', 'vegetables', 'gourds', '{"hi":["karela"]}', array['kg','gram'], null, null, array['bitter gourd','karela'], array['karela'], 'image_pending'),
  ('Cucumber', 'vegetables', 'common-vegetables', '{"hi":["kheera"]}', array['kg','piece'], null, null, array['cucumber','kheera'], array['khira'], 'image_pending'),
  ('Peas', 'vegetables', 'common-vegetables', '{"hi":["matar"]}', array['kg','gram'], null, null, array['peas','matar','green peas'], array['mutter'], 'image_pending'),
  ('Lemon', 'vegetables', 'common-vegetables', '{"hi":["nimbu"]}', array['piece','dozen','kg'], null, null, array['lemon','nimbu'], array['limbu'], 'image_pending'),
  ('Apple', 'fruits', 'fresh-fruits', '{"hi":["seb"]}', array['kg','piece'], null, null, array['apple','seb'], array['aple'], 'image_pending'),
  ('Banana', 'fruits', 'fresh-fruits', '{"hi":["kela"]}', array['dozen','piece'], null, null, array['banana','kela'], array['bananna'], 'image_pending'),
  ('Orange', 'fruits', 'fresh-fruits', '{"hi":["santra"]}', array['kg','piece','dozen'], null, null, array['orange','santra'], array['santara'], 'image_pending'),
  ('Mango', 'fruits', 'seasonal-fruits', '{"hi":["aam"]}', array['kg','piece','dozen'], null, null, array['mango','aam'], array['mangoes'], 'image_pending'),
  ('Grapes', 'fruits', 'fresh-fruits', '{"hi":["angoor"]}', array['kg','gram'], null, null, array['grapes','angoor'], array['grape'], 'image_pending'),
  ('Pomegranate', 'fruits', 'fresh-fruits', '{"hi":["anar"]}', array['kg','piece'], null, null, array['pomegranate','anar'], array['pomogranate'], 'image_pending'),
  ('Papaya', 'fruits', 'fresh-fruits', '{"hi":["papita"]}', array['kg','piece'], null, null, array['papaya','papita'], array['papita'], 'image_pending'),
  ('Watermelon', 'fruits', 'seasonal-fruits', '{"hi":["tarbooj"]}', array['piece','kg'], null, null, array['watermelon','tarbooj'], array['tarbuj'], 'image_pending'),
  ('Muskmelon', 'fruits', 'seasonal-fruits', '{"hi":["kharbooja"]}', array['piece','kg'], null, null, array['muskmelon','kharbooja'], array['kharbuja'], 'image_pending'),
  ('Guava', 'fruits', 'fresh-fruits', '{"hi":["amrood"]}', array['kg','piece'], null, null, array['guava','amrood'], array['amrud'], 'image_pending'),
  ('Pineapple', 'fruits', 'fresh-fruits', '{"hi":["ananas"]}', array['piece','kg'], null, null, array['pineapple','ananas'], array['annanas'], 'image_pending'),
  ('Coconut', 'fruits', 'fresh-fruits', '{"hi":["nariyal"]}', array['piece'], null, null, array['coconut','nariyal'], array['narial'], 'image_pending'),
  ('Sweet Lime', 'fruits', 'fresh-fruits', '{"hi":["mosambi"]}', array['kg','piece','dozen'], null, null, array['sweet lime','mosambi'], array['mausambi'], 'image_pending')
on conflict do nothing;

insert into public.catalog_items
  (name, standard_title, category, subcategory, image_url, default_unit, local_names, common_units, brand_name, pack_size, search_keywords, alternative_spellings, image_status, rights_notes)
select
  standard_title,
  standard_title,
  category,
  subcategory,
  null,
  coalesce(common_units[1], 'piece'),
  local_names,
  common_units,
  brand_name,
  pack_size,
  search_keywords,
  alternative_spellings,
  image_status,
  image_policy_note
from public.master_product_catalog
where not exists (
  select 1
  from public.catalog_items ci
  where coalesce(ci.standard_title, ci.name) = public.master_product_catalog.standard_title
    and ci.category = public.master_product_catalog.category
    and coalesce(ci.subcategory, '') = public.master_product_catalog.subcategory
    and coalesce(ci.brand_name, '') = coalesce(public.master_product_catalog.brand_name, '')
    and coalesce(ci.pack_size, '') = coalesce(public.master_product_catalog.pack_size, '')
);
