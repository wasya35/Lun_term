/* Офлайн-тест логики ISS-прокси на мок-данных (без сети). Запуск: npm test */
'use strict';
const assert = require('assert');
const { mskToMs, parseCandles, aggregate, pickFront } = require('../server.js');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

/* --- mskToMs: MSK "YYYY-MM-DD HH:MM:SS" → epoch, MOEX в UTC+3 --- */
ok('mskToMs трактует время как UTC+3', () => {
  // 12:00 MSK == 09:00 UTC
  assert.strictEqual(mskToMs('2026-07-01 12:00:00'), Date.parse('2026-07-01T09:00:00Z'));
});

/* --- parseCandles: несколько страниц candles.json --- */
const candleCols = ['open', 'close', 'high', 'low', 'value', 'volume', 'begin', 'end'];
const candlePage = (rows) => ({ candles: { columns: candleCols, data: rows } });
ok('parseCandles склеивает страницы и мапит колонки по имени', () => {
  const p1 = candlePage([[100, 101, 102, 99, 0, 10, '2026-07-01 10:00:00', '2026-07-01 10:59:59']]);
  const p2 = candlePage([[101, 103, 104, 100, 0, 20, '2026-07-01 11:00:00', '2026-07-01 11:59:59']]);
  const bars = parseCandles([p1, p2]);
  assert.strictEqual(bars.length, 2);
  assert.deepStrictEqual(bars[0], { timestamp: Date.parse('2026-07-01T07:00:00Z'), open: 100, high: 102, low: 99, close: 101, volume: 10 });
  assert.strictEqual(bars[1].close, 103);
});
ok('parseCandles отбрасывает строки с битой датой', () => {
  const bars = parseCandles(candlePage([[1, 1, 1, 1, 0, 1, 'not-a-date', '']]));
  assert.strictEqual(bars.length, 0);
});

/* --- aggregate: 1-мин → 5-мин --- */
ok('aggregate собирает 5-минутку из минуток (OHLCV корректно)', () => {
  const t0 = Date.parse('2026-07-01T07:00:00Z');   // кратно 5 мин
  const min = (i, o, h, l, c, v) => ({ timestamp: t0 + i * 60000, open: o, high: h, low: l, close: c, volume: v });
  const bars = [min(0, 10, 12, 9, 11, 1), min(1, 11, 15, 10, 14, 2), min(2, 14, 14, 8, 9, 3),
    min(3, 9, 11, 9, 10, 4), min(4, 10, 13, 10, 12, 5), min(5, 12, 12, 11, 11, 6)];  // 5 в первом бакете, 1 во втором
  const agg = aggregate(bars, 5);
  assert.strictEqual(agg.length, 2);
  assert.deepStrictEqual(agg[0], { timestamp: t0, open: 10, high: 15, low: 8, close: 12, volume: 15 });
  assert.strictEqual(agg[1].open, 12);
});

/* --- pickFront: ближний фьючерс, фильтр опционов и истёкших, много страниц --- */
const secCols = ['SECID', 'ASSETCODE', 'LASTDELDATE'];
const secPage = (rows) => ({ securities: { columns: secCols, data: rows } });
ok('pickFront выбирает ближайшую неистёкшую экспирацию нужного актива', () => {
  const today = '2026-08-02';
  const p1 = secPage([
    ['SiM6', 'Si', '2026-06-18'],          // истёк — отбрасываем
    ['SiU6', 'Si', '2026-09-17'],          // ближний
    ['Si90000BX6', 'Si', '2026-12-17'],    // опцион — отбрасываем (не 4 симв.)
    ['CRU6', 'CNY', '2026-09-15'],         // другой актив
  ]);
  const p2 = secPage([
    ['SiZ6', 'Si', '2026-12-17'],          // дальний
    ['SiU6', 'Si', '2026-09-17'],          // дубль — не двоим
    ['', null, null],
  ]);
  const list = pickFront([p1, p2], 'Si', today);
  assert.strictEqual(list[0].ticker, 'SiU6');
  assert.deepStrictEqual(list.map((x) => x.ticker), ['SiU6', 'SiZ6']);
});
ok('pickFront по CNY возвращает CRU6', () => {
  const list = pickFront(secPage([['CRU6', 'CNY', '2026-09-15'], ['CRZ6', 'CNY', '2026-12-15']]), 'CNY', '2026-08-02');
  assert.strictEqual(list[0].ticker, 'CRU6');
});

console.log(`\nOK — ${passed} проверок пройдено`);
