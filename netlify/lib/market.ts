import { neon } from '@neondatabase/serverless';



export const API_BASE_URL = 'https://developer-lostark.game.onstove.com';
const API_KEY = process.env.API_KEY;
const DATABASE_URL =
  process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
const MAX_PAGE = Number(process.env.MAX_PAGE ?? '50');
export const DEFAULT_CATEGORY_CODE = Number(process.env.DEFAULT_CATEGORY_CODE ?? '50000');
export type MarketSortKey = 'GRADE' | 'YDAY_AVG_PRICE' | 'RECENT_PRICE' | 'CURRENT_MIN_PRICE';
export type SortDirection = 'ASC' | 'DESC';

export interface MarketRequestPayload {
  ItemName?: string;
  CategoryCode: number;
  PageNo: number;
  Sort: MarketSortKey;
  SortCondition: SortDirection;
}

export interface MarketItem {
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

export interface MarketSearchResponse {
  PageNo: number;
  PageSize: number;
  TotalCount: number;
  Items: MarketItem[];
}

const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

function requireSql() {
  if (!sql) {
    throw new Error(
      'DATABASE_URL / NEON_DATABASE_URL / NETLIFY_DATABASE_URL 환경 변수가 설정되지 않았습니다.',
    );
  }
  return sql;
}

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

export async function getAllMarketItemsInCategory(
  categoryCode: number,
  options?: { sort?: MarketSortKey; sortDirection?: SortDirection; maxPage?: number },
): Promise<MarketItem[]> {
  const sort = options?.sort ?? 'RECENT_PRICE';
  const sortDirection = options?.sortDirection ?? 'ASC';
  const maxPage = options?.maxPage ?? MAX_PAGE;

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

export async function ensureTables() {
  const db = requireSql();

  await db`
    CREATE TABLE IF NOT EXISTS lostark_items (
      id BIGINT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      grade VARCHAR(20),
      icon TEXT,
      category_code INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await db`
    CREATE TABLE IF NOT EXISTS lostark_market_prices (
      id BIGSERIAL PRIMARY KEY,
      item_id BIGINT NOT NULL REFERENCES lostark_items(id),
      recent_price NUMERIC(15,2),
      current_min_price NUMERIC(15,2),
      yday_avg_price NUMERIC(15,2),
      category_code INTEGER NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await db`CREATE INDEX IF NOT EXISTS idx_market_prices_item_time ON lostark_market_prices (item_id, recorded_at DESC)`;
}

export async function upsertItems(
  items: MarketItem[],
  categoryCode: number,
  snapshotTime: Date,
) {
  const db = requireSql();

  for (const item of items) {
    await db`
      INSERT INTO lostark_items (
        id, name, grade, icon, category_code, updated_at
      )
      VALUES (
        ${item.Id},
        ${item.Name},
        ${item.Grade},
        ${item.Icon},
        ${categoryCode},
        ${snapshotTime}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        grade = EXCLUDED.grade,
        icon = EXCLUDED.icon,
        category_code = EXCLUDED.category_code,
        updated_at = EXCLUDED.updated_at
    `;
  }
}

export async function insertPriceSnapshots(
  items: MarketItem[],
  categoryCode: number,
  snapshotTime: Date,
) {
  const db = requireSql();

  for (const item of items) {
    await db`
      INSERT INTO lostark_market_prices (
        item_id, recent_price, current_min_price, yday_avg_price,
        recorded_at
      )
      VALUES (
        ${item.Id},
        ${item.RecentPrice},
        ${item.CurrentMinPrice},
        ${item.YDayAvgPrice},
        ${snapshotTime}
      )
    `;
  }
}

export async function queryItemNames(search: string, limit = 10) {
  if (!search || !search.trim()) return [];
  const db = requireSql();
  const pattern = `%${search.trim()}%`;
  const rows = (await db`
  SELECT id, name
  FROM lostark_items
  WHERE name ILIKE ${pattern}
  ORDER BY name ASC
  LIMIT ${limit}
`) as { id: number; name: string }[];
  return rows;
}
