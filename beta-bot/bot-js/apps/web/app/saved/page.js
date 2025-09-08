import { createStorage } from '@jobspy/storage';

export default async function SavedPage({ searchParams }) {
  const uid = searchParams?.uid ? parseInt(searchParams.uid, 10) : null;
  if (!uid) {
    return (
      <main>
        <h1>Saved Searches</h1>
        <p>Pass ?uid=TELEGRAM_ID to view saved searches for a user.</p>
      </main>
    );
  }
  const storage = createStorage();
  const u = await storage.getUser(uid);
  const rows = u.saved_searches || [];
  return (
    <main>
      <h1>Saved of {uid}</h1>
      <ul>
        {rows.slice(0,100).map((s, i) => (
          <li key={i} style={{ marginBottom: 12 }}>
            <div><strong>{s.name}</strong></div>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(s.filters || {}, null, 2)}</pre>
          </li>
        ))}
      </ul>
    </main>
  );
}

