import { createStorage } from '@jobspy/storage';

export default async function FavoritesPage({ searchParams }) {
  const uid = searchParams?.uid ? parseInt(searchParams.uid, 10) : null;
  if (!uid) {
    return (
      <main>
        <h1>Favorites</h1>
        <p>Pass ?uid=TELEGRAM_ID to view favorites for a user.</p>
      </main>
    );
  }
  const storage = createStorage();
  const u = await storage.getUser(uid);
  const rows = u.favorites || [];
  return (
    <main>
      <h1>Favorites of {uid}</h1>
      <ul>
        {rows.slice(0,100).map((j, i) => (
          <li key={i} style={{ marginBottom: 12 }}>
            <div><strong>{j.title}</strong> — {j.company} • {j.location}</div>
            <div>{j.site} • {j.date_posted}</div>
            <div><a href={j.job_url_raw || j.job_url} target="_blank">Open</a></div>
          </li>
        ))}
      </ul>
    </main>
  );
}

