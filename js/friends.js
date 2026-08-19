import { supabase } from './supabase-client.js';

export async function fetchFriendshipStatus(myId, theirId){
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(`and(requester_id.eq.${myId},addressee_id.eq.${theirId}),and(requester_id.eq.${theirId},addressee_id.eq.${myId})`)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function sendFriendRequest(myId, theirId){
  const { error } = await supabase.from('friendships').insert({ requester_id: myId, addressee_id: theirId });
  if (error) throw error;
}

export async function respondToFriendRequest(friendshipId, status){
  const { error } = await supabase.from('friendships').update({ status, responded_at: new Date().toISOString() }).eq('id', friendshipId);
  if (error) throw error;
}

export async function removeFriendship(friendshipId){
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

export async function fetchIncomingFriendRequests(myId){
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, created_at, profiles!friendships_requester_id_fkey(display_name, avatar_style)')
    .eq('addressee_id', myId)
    .eq('status', 'pending');
  if (error) throw error;
  return data || [];
}

export async function fetchMyFriends(myId){
  const { data, error } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id, profiles!friendships_requester_id_fkey(id,display_name,avatar_style), profiles_addressee:profiles!friendships_addressee_id_fkey(id,display_name,avatar_style)')
    .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
    .eq('status', 'accepted');
  if (error) throw error;
  return (data || []).map(f => f.requester_id === myId ? f.profiles_addressee : f.profiles);
}
