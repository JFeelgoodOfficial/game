import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default async function LeaderboardPage() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('name, highscore')
    .order('highscore', { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
    return <p>Failed to load leaderboard.</p>;
  }

  return (
    <div style={{ maxWidth: '600px', margin: '2rem auto', padding: '1rem' }}>
      <h1>Nova7 Game Leaderboard</h1>
      <nav style={{ marginBottom: '1.5rem' }}>
        <Link href="/signup">Sign up</Link> |{' '}
        <Link href="/signin">Sign in</Link>
      </nav>
      <ol>
        {profiles?.map((p, idx) => (
          <li key={p.id} style={{ marginBottom: '0.5rem' }}>
            {idx + 1}.{' '}
            <strong>{p.name || 'Anonymous'}</strong>: {p.highscore}
          </li>
        ))}
      </ol>
      <p>
        Play the game and submit your score – it will appear here if it’s a
        new high score.
      </p>
    </div>
  );
}
