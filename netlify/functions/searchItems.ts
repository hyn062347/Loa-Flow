import type { Context } from '@netlify/functions';
import { ensureTables, queryItemNames } from '../lib/market';

export default async function handler(req: Request, _context: Context) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('q') ?? '';
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : 10;

    await ensureTables();
    const names = await queryItemNames(q, Number.isFinite(limit) && limit > 0 ? limit : 10);

    return new Response(JSON.stringify(names), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error(
      '[searchItems] 오류:',
      err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.',
    );
    return new Response(JSON.stringify({ error: 'Failed to search items' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
