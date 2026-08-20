import { supabase } from './supabase-client.js';

export async function fetchBlockedIds(myId){
  const { data, error } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', myId);
  if (error) throw error;
  return (data || []).map(b => b.blocked_id);
}

export async function blockProfile(targetProfileId){
  const { error } = await supabase.rpc('block_profile', { target_profile_id: targetProfileId });
  if (error) throw error;
}

export async function unblockProfile(targetProfileId){
  const { error } = await supabase.rpc('unblock_profile', { target_profile_id: targetProfileId });
  if (error) throw error;
}
