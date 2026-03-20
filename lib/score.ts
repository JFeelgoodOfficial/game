import { supabase } from '@/supabase';

/**
 * Upserts a highscore for the given user.
 * Only updates if the new score is higher than the existing one.
 */
export async function submitScore(userId: string, score: number) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { id: userId, highscore: score },
      { onConflict: 'id', ignoreDuplicates: false } // will update row on conflict
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}
