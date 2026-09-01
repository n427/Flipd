-- The original example used a generic campus image. Use an unmistakable
-- graduation reference photo so the Wanted card matches its title.
update public.wanted_posts
set photo_urls = array['https://images.unsplash.com/photo-1627556704302-624286467c65?w=1200&auto=format&fit=crop'],
    updated_at = clock_timestamp()
where id = 'c2200000-0000-4000-8000-000000000002';
