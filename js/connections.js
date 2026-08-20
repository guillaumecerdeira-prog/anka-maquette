import { supabase } from './supabase-client.js';

export async function fetchIncomingConnectionRequest(myId, theirId){
  const { data, error } = await supabase
    .from('connection_requests')
    .select('id, status')
    .eq('from_profile_id', theirId)
    .eq('to_profile_id', myId)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function respondToConnectionRequest(requestId, status){
  const { error } = await supabase.from('connection_requests').update({ status }).eq('id', requestId);
  if (error) throw error;
}
