import { supabase } from './supabase-client.js';

export async function fetchRevealedTo(profileId){
  const { data, error } = await supabase
    .from('face_reveals')
    .select('revealed_to')
    .eq('profile_id', profileId);
  if (error) throw error;
  return (data || []).map(r => r.revealed_to);
}

export async function revealFaceTo(profileId, revealedTo){
  const { error } = await supabase.from('face_reveals').insert({ profile_id: profileId, revealed_to: revealedTo });
  if (error) throw error;
}

export async function unrevealFaceFrom(profileId, revealedTo){
  const { error } = await supabase.from('face_reveals').delete().eq('profile_id', profileId).eq('revealed_to', revealedTo);
  if (error) throw error;
}
