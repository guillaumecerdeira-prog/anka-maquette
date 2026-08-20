import { supabase } from './supabase-client.js';

export const PROMPT_CATALOG = [
  "Un truc que tu pourrais expliquer pendant des heures",
  "Ton dimanche idéal",
  "Une petite victoire récente",
  "Ce qui te fait rire à coup sûr",
  "Un plan parfait pour un premier rendez-vous",
  "Une chose que tu apprends en ce moment"
];

export async function fetchInterestsCatalog(){
  const { data, error } = await supabase
    .from('interests')
    .select('id, name, slug, color_from, color_to')
    .order('name');
  if (error) throw error;
  return data;
}

export async function fetchMyProfile(userId){
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id, display_name, birth_date, avatar_style, dm_open, created_at,
      is_supervisor, is_banned, suspended_until,
      profile_interests ( interest_id, interests ( id, name, slug, color_from, color_to ) ),
      profile_prompts ( id, question, answer, position )
    `)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { count: revealCount, error: revealError } = await supabase
    .from('face_reveals')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', userId);
  if (revealError) throw revealError;

  return {
    ...data,
    interests: data.profile_interests.map(pi => pi.interests),
    prompts: [...data.profile_prompts].sort((a, b) => a.position - b.position),
    faceRevealCount: revealCount ?? 0
  };
}

export async function fetchProfileById(profileId){
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id, display_name, birth_date, avatar_style, dm_open, created_at,
      profile_interests ( interests ( id, name ) ),
      profile_prompts ( id, question, answer, position )
    `)
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    interests: data.profile_interests.map(pi => pi.interests),
    prompts: [...data.profile_prompts].sort((a, b) => a.position - b.position)
  };
}

export async function createProfile(userId, { displayName, birthDate, avatarStyle, interestIds, prompts }){
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: userId, display_name: displayName, birth_date: birthDate, avatar_style: avatarStyle });
  if (profileError) throw profileError;

  if (interestIds.length) {
    const { error: interestsError } = await supabase
      .from('profile_interests')
      .insert(interestIds.map(interest_id => ({ profile_id: userId, interest_id })));
    if (interestsError) throw interestsError;
  }

  const promptRows = prompts
    .filter(p => p.answer.trim())
    .map((p, i) => ({ profile_id: userId, question: p.question, answer: p.answer.trim(), position: i }));
  if (promptRows.length) {
    const { error: promptsError } = await supabase.from('profile_prompts').insert(promptRows);
    if (promptsError) throw promptsError;
  }
}

export async function updatePromptAnswer(promptId, answer){
  const { error } = await supabase.from('profile_prompts').update({ answer }).eq('id', promptId);
  if (error) throw error;
}

export async function deletePrompt(promptId){
  const { error } = await supabase.from('profile_prompts').delete().eq('id', promptId);
  if (error) throw error;
}

export async function updateAvatarStyle(profileId, avatarStyle){
  const { error } = await supabase.from('profiles').update({ avatar_style: avatarStyle }).eq('id', profileId);
  if (error) throw error;
}

export async function updateProfileInterests(profileId, interestIds){
  const { error: deleteError } = await supabase.from('profile_interests').delete().eq('profile_id', profileId);
  if (deleteError) throw deleteError;

  if (interestIds.length) {
    const { error: insertError } = await supabase
      .from('profile_interests')
      .insert(interestIds.map(interest_id => ({ profile_id: profileId, interest_id })));
    if (insertError) throw insertError;
  }
}

export async function setDmOpen(userId, dmOpen){
  const { error } = await supabase.from('profiles').update({ dm_open: dmOpen }).eq('id', userId);
  if (error) throw error;
}

export async function touchLastSeen(userId){
  await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId);
}
