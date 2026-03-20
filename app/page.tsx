// app/page.tsx
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default async function LeaderboardPage() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, name, highscore')
    .order('highscore', { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
    return (
      <main style={{ maxWidth: 600, margin: '2rem auto', padding: '1rem' }}>
        <h1>Nova7 Game Leaderboard</h1>
        <p>Failed to load leaderboard.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 600, margin: '2rem auto', padding: '1rem' }}>
      <h1>Nova7 Game Leaderboard</h1>

      <nav style={{ marginBottom: '1.5rem' }}>
        <Link href="/signup">Sign up</Link> |{' '}
        <Link href="/signin">Sign in</Link> |{' '}
        <a href="https://nova7game.org/game" target="_blank" rel="noreferrer">
          Play Nova7
        </a>
      </nav>

      {(!profiles || profiles.length === 0) && (
        <p>No scores yet. Be the first to play and set a highscore!</p>
      )}

      <ol>
        {profiles?.map((p, idx) => (
          <li key={p.id} style={{ marginBottom: '0.5rem' }}>
            {idx + 1}. <strong>{p.name || 'Anonymous'}</strong>: {p.highscore}
          </li>
        ))}
      </ol>
    </main>
  );
}
