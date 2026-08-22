import { supabase } from './supabase-client.js';

export async function fetchMyNotifications(profileId){
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, created_at, read_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data || [];
}

export async function fetchUnreadNotificationCount(profileId){
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .is('read_at', null);
  if (error) throw error;
  return count || 0;
}

export async function markNotificationsRead(ids){
  if (!ids.length) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
}

export async function markAllNotificationsRead(profileId){
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .is('read_at', null);
  if (error) throw error;
}
