-- 0031_dispute_evidence_storage — storage policies for dispute evidence
-- (Phase 2: transparent dispute center). Bucket 'dispute-evidence' is private;
-- parties upload into their OWN folder ({uid}/...) directly from the browser
-- and can re-read their own files. The counterparty and staff view evidence
-- only through short-lived signed URLs minted by the API after a party/staff
-- check — same posture as identity documents.

insert into storage.buckets (id, name, public)
values ('dispute-evidence', 'dispute-evidence', false)
on conflict (id) do nothing;

drop policy if exists "dispute evidence owner upload" on storage.objects;
create policy "dispute evidence owner upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "dispute evidence owner read" on storage.objects;
create policy "dispute evidence owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = auth.uid()::text
  );
