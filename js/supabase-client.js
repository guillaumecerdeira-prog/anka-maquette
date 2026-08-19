import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://qdozragddzlmxlerdaci.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_pACzHiQJtCoGhfDKyhbqNQ_0nC2xmgQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
