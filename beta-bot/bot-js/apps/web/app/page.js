export default function Page() {
  return (
    <main>
      <h1>MicroStudio Job Search</h1>
      <p>Backend is Next.js API. Telegram webhook endpoint: <code>/api/telegram</code></p>
      <ul>
        <li><a href="/search">Search</a></li>
        <li><a href="/favorites">Favorites (requires ?uid=)</a></li>
        <li><a href="/saved">Saved (requires ?uid=)</a></li>
        <li><a href="/last">Last results (requires ?uid=)</a></li>
        <li><a href="/api/health">Health</a></li>
      </ul>
    </main>
  );
}
