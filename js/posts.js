import { supabase } from './supabase-client.js';

export async function fetchWall(profileId){
  const { data, error } = await supabase
    .from('posts')
    .select('id, body, visibility, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createPost(profileId, body, visibility){
  const { error } = await supabase.from('posts').insert({ profile_id: profileId, body, visibility });
  if (error) throw error;
}

export async function deletePost(postId){
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}
