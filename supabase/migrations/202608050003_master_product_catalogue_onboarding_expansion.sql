-- Master Product Catalogue expansion for faster vendor onboarding.
-- Broadens category support and seeds commonly sold local products.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'master_product_catalog'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%category%'
  loop
    execute format('alter table public.master_product_catalog drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.master_product_catalog
  drop constraint if exists master_product_catalog_category_check;

alter table public.master_product_catalog
  add constraint master_product_catalog_category_check
  check (category in (
    'kirana',
    'vegetables',
    'fruits',
    'dairy',
    'bakery',
    'beverages',
    'household',
    'household-essentials',
    'personal-care',
    'packaged-food',
    'pharmacy',
    'medical',
    'stationery',
    'hardware',
    'tiffin',
    'restaurant',
    'other'
  ));

insert into public.master_product_catalog
  (standard_title, category, subcategory, local_names, common_units, brand_name, pack_size, search_keywords, alternative_spellings, image_status)
values
  ('Paracetamol Tablets', 'pharmacy', 'common-medicines', '{"hi":["bukhar ki goli","paracetamol"],"kn":["paracetamol"]}', array['strip','tablet'], null, null, array['paracetamol','fever tablet','pain relief','crocin','dolo'], array['parasitamol','paracetmol'], 'image_pending'),
  ('ORS Sachet', 'pharmacy', 'first-aid', '{"hi":["ors","rehydration"],"kn":["ors"]}', array['sachet','packet'], null, null, array['ors','oral rehydration salt','dehydration'], array['o r s'], 'image_pending'),
  ('Bandage Roll', 'pharmacy', 'first-aid', '{"hi":["patti","bandage"],"kn":["bandage"]}', array['roll','piece'], null, null, array['bandage','first aid','dressing'], array['band aid roll'], 'image_pending'),
  ('Antiseptic Liquid', 'pharmacy', 'first-aid', '{"hi":["antiseptic","dawai liquid"],"kn":["antiseptic"]}', array['bottle','ml'], null, null, array['antiseptic liquid','wound cleaning','first aid'], array['antispetic'], 'image_pending'),
  ('Cotton Roll', 'pharmacy', 'first-aid', '{"hi":["rui","cotton"],"kn":["cotton"]}', array['roll','packet'], null, null, array['cotton','medical cotton','first aid'], array['cotten'], 'image_pending'),
  ('Notebook', 'stationery', 'writing-supplies', '{"hi":["copy","notebook"],"kn":["notebook"]}', array['piece','pack'], null, null, array['notebook','copy','exercise book','school copy'], array['note book'], 'image_pending'),
  ('Ball Pen', 'stationery', 'writing-supplies', '{"hi":["pen"],"kn":["pen"]}', array['piece','pack'], null, null, array['pen','ball pen','writing pen'], array['bal pen'], 'image_pending'),
  ('Pencil', 'stationery', 'writing-supplies', '{"hi":["pencil"],"kn":["pencil"]}', array['piece','pack'], null, null, array['pencil','school pencil','writing pencil'], array['pensil'], 'image_pending'),
  ('Eraser', 'stationery', 'writing-supplies', '{"hi":["rubber","eraser"],"kn":["eraser"]}', array['piece','pack'], null, null, array['eraser','rubber','pencil eraser'], array['rabar'], 'image_pending'),
  ('Fevicol Glue', 'stationery', 'adhesives', '{"hi":["gond","glue"],"kn":["glue"]}', array['bottle','tube'], null, null, array['glue','adhesive','fevicol','craft glue'], array['glue bottle'], 'image_pending'),
  ('LED Bulb', 'hardware', 'electrical', '{"hi":["led bulb","bijli bulb"],"kn":["led bulb"]}', array['piece','box'], null, null, array['led bulb','bulb','light bulb','electric bulb'], array['lite bulb'], 'image_pending'),
  ('AA Battery', 'hardware', 'electrical', '{"hi":["battery","cell"],"kn":["battery"]}', array['piece','pack'], null, null, array['aa battery','cell','battery'], array['battry'], 'image_pending'),
  ('Insulation Tape', 'hardware', 'electrical', '{"hi":["electric tape","insulation tape"],"kn":["insulation tape"]}', array['roll','piece'], null, null, array['insulation tape','electrical tape','electric tape'], array['insulation tap'], 'image_pending'),
  ('Nails', 'hardware', 'fasteners', '{"hi":["keel","nail"],"kn":["nails"]}', array['packet','kg','gram'], null, null, array['nails','iron nails','fasteners'], array['keel'], 'image_pending'),
  ('Screwdriver', 'hardware', 'tools', '{"hi":["pechkas","screwdriver"],"kn":["screwdriver"]}', array['piece'], null, null, array['screwdriver','tool','pechkas'], array['screw driver'], 'image_pending'),
  ('Floor Cleaner', 'household-essentials', 'cleaning', '{"hi":["floor cleaner","pochha liquid"],"kn":["floor cleaner"]}', array['bottle','litre','ml'], null, null, array['floor cleaner','cleaning liquid','phenyl'], array['floor clener'], 'image_pending'),
  ('Toilet Cleaner', 'household-essentials', 'cleaning', '{"hi":["toilet cleaner"],"kn":["toilet cleaner"]}', array['bottle','ml'], null, null, array['toilet cleaner','bathroom cleaner'], array['toilet clener'], 'image_pending'),
  ('Garbage Bags', 'household-essentials', 'cleaning', '{"hi":["kachra bag","garbage bag"],"kn":["garbage bag"]}', array['roll','pack'], null, null, array['garbage bags','dustbin bag','trash bag'], array['garbage bag'], 'image_pending'),
  ('Aluminium Foil', 'household-essentials', 'kitchen', '{"hi":["foil paper","aluminium foil"],"kn":["aluminium foil"]}', array['roll','box'], null, null, array['aluminium foil','foil paper','kitchen foil'], array['aluminum foil'], 'image_pending'),
  ('Paper Plates', 'household-essentials', 'disposables', '{"hi":["paper plate"],"kn":["paper plate"]}', array['pack','piece'], null, null, array['paper plates','disposable plates'], array['paper plat'], 'image_pending'),
  ('Cake Rusk', 'bakery', 'rusk-toast', '{"hi":["rusk"],"kn":["rusk"]}', array['packet'], null, null, array['rusk','cake rusk','toast'], array['rusks'], 'image_pending'),
  ('Bun', 'bakery', 'bread', '{"hi":["bun"],"kn":["bun"]}', array['piece','pack'], null, null, array['bun','bakery bun','bread bun'], array['buns'], 'image_pending'),
  ('Samosa', 'tiffin', 'snacks', '{"hi":["samosa"],"kn":["samosa"]}', array['piece'], null, null, array['samosa','snack','evening snack'], array['samosa'], 'image_pending'),
  ('Idli', 'tiffin', 'breakfast', '{"hi":["idli"],"kn":["idli"]}', array['piece','plate'], null, null, array['idli','breakfast','south indian'], array['idly'], 'image_pending'),
  ('Chapati', 'tiffin', 'meals', '{"hi":["roti","chapati"],"kn":["chapati"]}', array['piece','plate'], null, null, array['chapati','roti','phulka'], array['chappati'], 'image_pending')
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
from public.master_product_catalog mpc
where not exists (
  select 1
  from public.catalog_items ci
  where coalesce(ci.standard_title, ci.name) = mpc.standard_title
    and ci.category = mpc.category
    and coalesce(ci.subcategory, '') = mpc.subcategory
    and coalesce(ci.brand_name, '') = coalesce(mpc.brand_name, '')
    and coalesce(ci.pack_size, '') = coalesce(mpc.pack_size, '')
);
