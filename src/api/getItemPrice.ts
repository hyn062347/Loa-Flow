const API_BASE_URL = 'https://developer-lostark.game.onstove.com';
const API_KEY = import.meta.env.API_KEY;

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

export async function searchMarket(
  payload: MarketRequestPayload,
  options?: { signal?: AbortSignal },
): Promise<MarketSearchResponse> {
  const response = await fetch(`${API_BASE_URL}/markets/items`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `${API_KEY}`,
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
  options?: {
    sort?: MarketSortKey;
    sortDirection?: SortDirection;
    maxPage?: number; // 안전용 상한 (기본 50)
    itemName?: string; // 특정 이름으로 필터하고 싶을 때
    signal?: AbortSignal;
  },
): Promise<MarketItem[]> {
  const sort = options?.sort ?? 'RECENT_PRICE';
  const sortDirection = options?.sortDirection ?? 'ASC';
  const maxPage = options?.maxPage ?? 50;

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

    // ItemName이 있다면 추가
    if (options?.itemName && options.itemName.trim()) {
      payload.ItemName = options.itemName.trim();
    }

    const res = await searchMarket(payload, { signal: options?.signal });

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