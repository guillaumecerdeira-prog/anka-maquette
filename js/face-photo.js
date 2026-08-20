import { supabase } from './supabase-client.js';

const BUCKET = 'face-photos';
const SIGNED_URL_TTL = 3600;

// One photo per profile, stored at a fixed path regardless of the source
// file's format, so re-uploading always replaces it in place (no orphaned
// objects left behind when someone switches from a .jpg to a .png).
function pathFor(profileId){
  return `${profileId}/face`;
}

// Returns a signed URL for the profile's face photo, or null if there is
// none or the current user isn't allowed to see it (storage + table RLS
// mirror the face_reveals access model: the owner, or anyone the owner
// has revealed their face to).
export async function fetchFacePhotoUrl(profileId){
  const { data, error } = await supabase
    .from('face_photos')
    .select('storage_path')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(data.storage_path, SIGNED_URL_TTL);
  if (signError) throw signError;
  return signed.signedUrl;
}

export async function uploadFacePhoto(profileId, file){
  const path = pathFor(profileId);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { error: upsertError } = await supabase
    .from('face_photos')
    .upsert({ profile_id: profileId, storage_path: path, updated_at: new Date().toISOString() });
  if (upsertError) throw upsertError;
}
