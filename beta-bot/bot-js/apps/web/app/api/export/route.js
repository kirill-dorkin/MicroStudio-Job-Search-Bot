import { createStorage } from '@jobspy/storage';
import Papa from 'papaparse';

export async function GET(req) {
  const url = new URL(req.url);
  const uid = parseInt(url.searchParams.get('uid') || '0', 10);
  const type = (url.searchParams.get('type') || 'last').toLowerCase();
  if (!uid) return new Response('uid required', { status: 400 });
  const storage = createStorage();
  const u = await storage.getUser(uid);
  const rows = type === 'favorites' ? (u.favorites || []) : (u.last_results || []);
  const csv = Papa.unparse(rows);
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${type}-${uid}.csv"`
    }
  });
}

