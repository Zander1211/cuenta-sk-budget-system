-- 1. Create a storage bucket for project photos
insert into storage.buckets (id, name, public) 
values ('project-photos', 'project-photos', true)
on conflict (id) do nothing;

-- 2. Allow public access to view the photos
create policy "Public Access" 
on storage.objects for select 
using ( bucket_id = 'project-photos' );

-- 3. Allow authenticated users to upload photos
create policy "Auth Upload" 
on storage.objects for insert 
with check ( bucket_id = 'project-photos' and auth.role() = 'authenticated' );

-- 4. Create a database table to track photo metadata
create table if not exists public.project_photos (
    id uuid default gen_random_uuid() primary key,
    project_id text not null,
    url text not null,
    caption text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Enable Row Level Security (RLS) on the table
alter table public.project_photos enable row level security;

-- 6. Allow all authenticated users to select (view) photos
create policy "Users can view all project photos" 
on public.project_photos for select 
to authenticated 
using ( true );

-- 7. Allow all authenticated users to insert (upload) photos
create policy "Users can insert project photos" 
on public.project_photos for insert 
to authenticated 
with check ( true );

-- 8. Allow users to delete photos (optional, but good for management)
create policy "Users can delete project photos" 
on public.project_photos for delete 
to authenticated 
using ( true );
