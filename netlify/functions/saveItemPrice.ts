import type { Config, Context } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';

export const config: Config = {
  schedule: '*/5 * * * *', // 매 5분
};

const API_BASE_URL = 'https://developer-lostark.game.onstove.com';
const API_KEY = process.env.API_KEY;
const DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
const MAX_PAGE = Number(process.env.MAX_PAGE ?? '50');
const DEFAULT_CATEGORY_CODE = Number(process.env.DEFAULT_CATEGORY_CODE ?? '50000');

type MarketSortKey = 'GRADE' | 'YDAY_AVG_PRICE' | 'RECENT_PRICE' | 'CURRENT_MIN_PRICE';
type SortDirection = 'ASC' | 'DESC';

interface MarketRequestPayload {
  ItemName?: string;
  CategoryCode: number;
  PageNo: number;
  Sort: MarketSortKey;
  SortCondition: SortDirection;
}

interface MarketItem {
  Id: number;
  Name: string;
  Grade: string;
  Icon: string;
  BundleCount: number;
  TradeRemainCount: number | null;
  YDayAvgPrice: number;
  RecentPrice: number;
  CurrentMinPrice: number;
}

interface MarketSearchResponse {
  PageNo: number;
  PageSize: number;
  TotalCount: number;
  Items: MarketItem[];
}

const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

async function searchMarket(
  payload: MarketRequestPayload,
  options?: { signal?: AbortSignal },
): Promise<MarketSearchResponse> {
  if (!API_KEY) {
    throw new Error('API_KEY 환경 변수가 설정되지 않았습니다.');
  }

  const authorization =
    API_KEY.startsWith('Bearer ') || API_KEY.startsWith('bearer ')
      ? API_KEY
      : `Bearer ${API_KEY}`;

  const response = await fetch(`${API_BASE_URL}/markets/items`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization,
    },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`거래소 정보를 불러오지 못했습니다. (${response.status}) ${message}`);
  }

  const result: MarketSearchResponse = await response.json();
  return result;
}

async function getAllMarketItemsInCategory(categoryCode: number): Promise<MarketItem[]> {
  const sort: MarketSortKey = 'RECENT_PRICE';
  const sortDirection: SortDirection = 'ASC';
  const maxPage = MAX_PAGE;

  const allItems: MarketItem[] = [];
  let pageNo = 1;
  let totalCount: number | undefined;

  while (pageNo <= maxPage) {
    const payload: MarketRequestPayload = {
      CategoryCode: categoryCode,
      PageNo: pageNo,
      Sort: sort,
      SortCondition: sortDirection,
    };

    const res = await searchMarket(payload);

    if (!res.Items || res.Items.length === 0) {
      break;
    }

    allItems.push(...res.Items);
    totalCount = res.TotalCount;

    if (totalCount && allItems.length >= totalCount) {
      break;
    }

    pageNo += 1;
  }

  return allItems;
}

async function ensureTable() {
  if (!sql) {
    throw new Error('DATABASE_URL 또는 NEON_DATABASE_URL 환경 변수가 설정되지 않았습니다.');
  }

  await sql`
    CREATE TABLE IF NOT EXISTS lostark_market_items (
      id BIGINT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      grade VARCHAR(20),
      icon TEXT,
      bundle_count INTEGER,
      trade_remain_count INTEGER,
      yday_avg_price NUMERIC(15,2),
      recent_price NUMERIC(15,2),
      current_min_price NUMERIC(15,2),
      category_code INTEGER NOT NULL,
      snapshot_time TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function saveItems(items: MarketItem[], categoryCode: number) {
  if (!sql) {
    throw new Error('DATABASE_URL 또는 NEON_DATABASE_URL 환경 변수가 설정되지 않았습니다.');
  }

  const snapshotTime = new Date();

  for (const item of items) {
    await sql`
      INSERT INTO lostark_market_items (
        id, name, grade, icon, bundle_count, trade_remain_count,
        yday_avg_price, recent_price, current_min_price,
        category_code, snapshot_time, updated_at
      )
      VALUES (
        ${item.Id},
        ${item.Name},
        ${item.Grade},
        ${item.Icon},
        ${item.BundleCount},
        ${item.TradeRemainCount ?? null},
        ${item.YDayAvgPrice},
        ${item.RecentPrice},
        ${item.CurrentMinPrice},
        ${categoryCode},
        ${snapshotTime},
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        grade = EXCLUDED.grade,
        icon = EXCLUDED.icon,
        bundle_count = EXCLUDED.bundle_count,
        trade_remain_count = EXCLUDED.trade_remain_count,
        yday_avg_price = EXCLUDED.yday_avg_price,
        recent_price = EXCLUDED.recent_price,
        current_min_price = EXCLUDED.current_min_price,
        category_code = EXCLUDED.category_code,
        snapshot_time = EXCLUDED.snapshot_time,
        updated_at = NOW();
    `;
  }
}

export default async function handler(req: Request, _context: Context) {
  try {
    // scheduled 실행 시 body에는 { next_run } 정도만 들어올 수 있음
    const eventBody = await req.json().catch(() => null);
    const body = eventBody ?? null;

    const overrideCategory = body?.categoryCode ? Number(body.categoryCode) : undefined;
    const categoryCode =
      overrideCategory && !Number.isNaN(overrideCategory)
        ? overrideCategory
        : DEFAULT_CATEGORY_CODE;

    if (!categoryCode || Number.isNaN(categoryCode)) {
      throw new Error('DEFAULT_CATEGORY_CODE 환경 변수가 숫자가 아닙니다.');
    }

    console.info(
      `[saveItemPrice] 시작 - category=${categoryCode}, time=${new Date().toISOString()}`,
    );

    await ensureTable();
    const items = await getAllMarketItemsInCategory(categoryCode);

    if (items.length === 0) {
      console.info(`[saveItemPrice] 저장할 아이템이 없습니다. category=${categoryCode}`);
      return new Response(null, { status: 200 });
    }

    await saveItems(items, categoryCode);

    console.info(
      `[saveItemPrice] 저장 완료 - category=${categoryCode}, count=${items.length}`,
    );

    return new Response(null, { status: 200 });
  } catch (err) {
    console.error(
      '[saveItemPrice] 오류:',
      err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.',
    );
    return new Response('error', { status: 500 });
  }
}
