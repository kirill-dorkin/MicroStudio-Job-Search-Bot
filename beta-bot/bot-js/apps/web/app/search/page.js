"use client";
import { useState } from 'react';

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('');
  const [remote, setRemote] = useState('');
  const [dist, setDist] = useState('');
  const [sources, setSources] = useState('indeed,zip_recruiter,glassdoor,google');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [offset, setOffset] = useState(0);

  async function doSearch(e) {
    e.preventDefault();
    setLoading(true);
    setRows([]);
    setOffset(0);
    const url = `/api/search?q=${encodeURIComponent(q)}&loc=${encodeURIComponent(loc)}&results=20&offset=0&dist=${encodeURIComponent(dist||'')}&remote=${encodeURIComponent(remote||'')}&sources=${encodeURIComponent(sources)}`;
    const res = await fetch(url);
    const data = await res.json();
    setLoading(false);
    if (data.ok) setRows(data.rows);
  }

  async function loadMore() {
    const nextOffset = rows.length;
    setLoading(true);
    const url = `/api/search?q=${encodeURIComponent(q)}&loc=${encodeURIComponent(loc)}&results=20&offset=${nextOffset}&dist=${encodeURIComponent(dist||'')}&remote=${encodeURIComponent(remote||'')}&sources=${encodeURIComponent(sources)}`;
    const res = await fetch(url);
    const data = await res.json();
    setLoading(false);
    if (data.ok && data.rows?.length) {
      const seen = new Set(rows.map(r => r.job_url));
      const merged = rows.slice();
      for (const j of data.rows) if (!seen.has(j.job_url)) { merged.push(j); seen.add(j.job_url); }
      setRows(merged);
      setOffset(nextOffset);
    }
  }

  return (
    <main>
      <h1>Search</h1>
      <form onSubmit={doSearch} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 16 }}>
        <input placeholder="keywords" value={q} onChange={e=>setQ(e.target.value)} />
        <input placeholder="location" value={loc} onChange={e=>setLoc(e.target.value)} />
        <select value={remote} onChange={e=>setRemote(e.target.value)}>
          <option value="">remote:any</option>
          <option value="yes">remote:yes</option>
          <option value="no">remote:no</option>
        </select>
        <input placeholder="distance" value={dist} onChange={e=>setDist(e.target.value)} />
        <input placeholder="sources (csv)" value={sources} onChange={e=>setSources(e.target.value)} />
        <button type="submit" disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
      </form>
      <ul>
        {rows.map((j, i) => (
          <li key={i} style={{ marginBottom: 12 }}>
            <div><strong>{j.title}</strong> — {j.company} • {j.location}</div>
            <div>{j.site} • {j.date_posted} • {j.remote} • {j.job_type} • {j.salary}</div>
            <div><a href={j.job_url_raw || j.job_url} target="_blank" rel="noreferrer">Open</a></div>
          </li>
        ))}
      </ul>
      {rows.length > 0 && (
        <button onClick={loadMore} disabled={loading}>
          {loading ? 'Loading...' : 'Load more'}
        </button>
      )}
    </main>
  );
}
