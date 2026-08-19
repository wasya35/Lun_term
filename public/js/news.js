/* =============================================================================
 *  news.js — новости по инструменту (window.LunNews)
 * =============================================================================
 *  Тянем RSS крупных СМИ (LUN.NEWS.feeds) через шлюзы, парсим XML, фильтруем
 *  заголовки по ключевым словам инструмента. Недоступные ленты пропускаем.
 *  Кэш ленты на несколько минут — не долбим шлюзы на каждое переключение.
 * ===========================================================================*/
(function () {
  const CACHE_MS = 4 * 60 * 1000;
  const cache = new Map();   // url -> { ts, items }

  async function fetchFeed(feed) {
    const c = cache.get(feed.url);
    if (c && (Date.now() - c.ts) < CACHE_MS) return c.items;
    let txt; try { txt = await window.LunFetchText(feed.url); } catch (e) { return []; }
    let doc; try { doc = new DOMParser().parseFromString(txt, 'text/xml'); } catch (e) { return []; }
    const nodes = doc.querySelectorAll('item, entry');
    const items = [];
    nodes.forEach((it, i) => {
      if (i >= 50) return;
      const q = (sel) => { const el = it.querySelector(sel); return el ? (el.textContent || '').trim() : ''; };
      const title = q('title');
      let link = q('link'); if (!link) { const a = it.querySelector('link'); if (a && a.getAttribute) link = a.getAttribute('href') || ''; }
      const ts = Date.parse(q('pubDate') || q('published') || q('updated') || '') || 0;
      if (title) items.push({ title, link, ts, source: feed.name });
    });
    cache.set(feed.url, { ts: Date.now(), items });
    return items;
  }

  async function fetchNews(keywords) {
    const feeds = (window.LUN.NEWS && window.LUN.NEWS.feeds) || [];
    const chunks = await Promise.all(feeds.map((f) => fetchFeed(f).catch(() => [])));
    const all = chunks.reduce((a, x) => a.concat(x), []);
    const kw = (keywords && keywords.length) ? keywords.map((k) => k.toLowerCase()) : null;
    let items = kw ? all.filter((it) => { const t = it.title.toLowerCase(); return kw.some((k) => t.indexOf(k) >= 0); }) : all.slice();
    const seen = new Set();
    items = items.filter((it) => { const k = it.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    items.sort((a, b) => b.ts - a.ts);
    return { items: items.slice(0, 40), total: all.length, matched: items.length };
  }

  window.LunNews = { fetch: fetchNews };
})();
