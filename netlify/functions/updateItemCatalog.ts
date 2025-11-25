import type { Config, Context } from '@netlify/functions';
import {
  DEFAULT_CATEGORY_CODE,
  ensureTables,
  getAllMarketItemsInCategory,
  upsertItems,
} from '../lib/market';

export const config: Config = {
  schedule: '0 10 * * 3', // 매주 수요일 10시
};

export default async function handler(req: Request, _context: Context) {
  try {
    const eventBody = await req.json().catch(() => null);
    const rawCategory = eventBody?.categoryCode;
    const parsedCategory =
      rawCategory !== undefined && rawCategory !== null ? Number(rawCategory) : NaN;
    const categoryCode =
      Number.isFinite(parsedCategory) && parsedCategory > 0
        ? parsedCategory
        : DEFAULT_CATEGORY_CODE;

    if (!categoryCode || Number.isNaN(categoryCode)) {
      throw new Error('DEFAULT_CATEGORY_CODE 환경 변수가 숫자가 아닙니다.');
    }

    const snapshotTime = new Date();
    console.info(
      `[updateItemCatalog] 시작 - category=${categoryCode}, time=${snapshotTime.toISOString()}`,
    );

    await ensureTables();
    const items = await getAllMarketItemsInCategory(categoryCode);

    if (items.length === 0) {
      console.info(`[updateItemCatalog] 업데이트할 아이템이 없습니다. category=${categoryCode}`);
      return new Response(null, { status: 200 });
    }

    await upsertItems(items, categoryCode, snapshotTime);

    console.info(
      `[updateItemCatalog] 업데이트 완료 - category=${categoryCode}, count=${items.length}`,
    );

    return new Response(null, { status: 200 });
  } catch (err) {
    console.error(
      '[updateItemCatalog] 오류:',
      err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.',
    );
    return new Response('error', { status: 500 });
  }
}
