import 'dotenv/config';
import mysql from 'mysql2/promise';

const API_BASE_URL = 'https://developer-lostark.game.onstove.com';

const env = (key, options = {}) => {
  const value = process.env[key];
  if (!value) {
    if (options.optional) return undefined;
    throw new Error(`환경 변수 ${key}가 설정되지 않았습니다.`);
  }
  return value;
};

const dbConfig = {
  host: env('DB_HOST'),
  user: env('DB_USER', { optional: true }) ?? 'root',
  password: env('DB_PASSWORD'),
  database: env('DB_NAME'),
};

const apiKey = env('API_KEY');
const DEFAULT_CATEGORY_CODE = 50000;

async function fetchItemPrice(itemName) {
  const payload = {
    ItemName: itemName,
    CategoryCode: DEFAULT_CATEGORY_CODE,
    PageNo: 1,
    Sort: 'RECENT_PRICE',
    SortCondition: 'ASC',
  };

  const res = await fetch(`${API_BASE_URL}/markets/items`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`아이템 가격 조회 실패 (${res.status}) ${msg}`);
  }

  const data = await res.json();
  const first = data?.Items?.[0];
  if (!first) {
    throw new Error('검색 결과가 없습니다.');
  }
  return { ...first, categoryCode: payload.CategoryCode };
}

async function saveItemPrice(item) {
  const connection = await mysql.createConnection(dbConfig);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS lostark_market_items (
      id BIGINT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      grade VARCHAR(10),
      icon VARCHAR(255),
      bundle_count INT,
      trade_remain_count INT NULL,
      yday_avg_price DECIMAL(15,2),
      recent_price DECIMAL(15,2),
      current_min_price DECIMAL(15,2),
      category_code INT NOT NULL,
      snapshot_time DATETIME NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) CHARACTER SET utf8mb4
  `);

  const snapshotTime = new Date();

  await connection.execute(
    `
      INSERT INTO lostark_market_items (
        id, name, grade, icon, bundle_count, trade_remain_count,
        yday_avg_price, recent_price, current_min_price,
        category_code, snapshot_time
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        grade = VALUES(grade),
        icon = VALUES(icon),
        bundle_count = VALUES(bundle_count),
        trade_remain_count = VALUES(trade_remain_count),
        yday_avg_price = VALUES(yday_avg_price),
        recent_price = VALUES(recent_price),
        current_min_price = VALUES(current_min_price),
        category_code = VALUES(category_code),
        snapshot_time = VALUES(snapshot_time),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      item.Id,
      item.Name,
      item.Grade,
      item.Icon,
      item.BundleCount,
      item.TradeRemainCount ?? null,
      item.YDayAvgPrice,
      item.RecentPrice,
      item.CurrentMinPrice,
      item.categoryCode,
      snapshotTime,
    ],
  );

  await connection.end();
}

async function main() {
  const itemName = process.argv[2];
  if (!itemName) {
    console.error('사용법: node scripts/saveItemPrice.js "<아이템 이름>"');
    process.exit(1);
  }

  try {
    const item = await fetchItemPrice(itemName);
    await saveItemPrice(item);
    console.log(`저장 완료: ${item.Name} (ID: ${item.Id}) - 현재가 ${item.RecentPrice}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
