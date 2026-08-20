import { supabase } from './supabase-client.js';

export async function sendDmAccessRequest(targetProfileId, contextType, contextId){
  const { data, error } = await supabase.rpc('send_dm_access_request', {
    target_profile_id: targetProfileId,
    p_context_type: contextType,
    p_context_id: contextId
  });
  if (error) throw error;
  return data;
}

export async function fetchIncomingDmRequests(myId){
  const { data, error } = await supabase
    .from('dm_access_requests')
    .select('id, requester_id, context_type, context_id, created_at, profiles!dm_access_requests_requester_id_fkey(display_name, avatar_style)')
    .eq('recipient_id', myId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchOutgoingDmRequestStatus(myId, targetProfileId){
  const { data, error } = await supabase
    .from('dm_access_requests')
    .select('id, status')
    .eq('requester_id', myId)
    .eq('recipient_id', targetProfileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchPendingDmRequestCount(myId){
  const { count, error } = await supabase
    .from('dm_access_requests')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', myId)
    .eq('status', 'pending');
  if (error) throw error;
  return count || 0;
}

export async function respondDmAccessRequest(requestId, accepted){
  const { error } = await supabase.rpc('respond_dm_access_request', { request_id: requestId, accepted });
  if (error) throw error;
}
