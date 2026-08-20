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
    let txt = null;
    // 1) свой серверный RSS-прокси (без CORS, если есть PHP на хостинге)
    for (const u of ['api.php?fn=rss&url=' + encodeURIComponent(feed.url), '/api/rss?url=' + encodeURIComponent(feed.url)]) {
      try { const res = await fetch(u); if (res.ok) { const t = await res.text(); if (t && t.indexOf('<') >= 0) { txt = t; break; } } } catch (e) { /* нет PHP — идём на публичные шлюзы */ }
    }
    // 2) публичные CORS-шлюзы
    if (!txt) { try { txt = await window.LunFetchText(feed.url); } catch (e) { return []; } }
    if (!txt) return [];
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

  // тон заголовка по словарю (RU+EN): + позитив / − негатив
  const POS = ['рост', 'выросл', 'вырос', 'подорожал', 'укреп', 'рекорд', 'прибыл', 'ралли', 'растут', 'восстанов', 'подъём', 'gain', 'surge', 'rally', 'jump', 'soar', 'beat', 'profit', 'rise', 'rises', 'bull', 'record', 'high'];
  const NEG = ['паден', 'упал', 'обвал', 'снизил', 'снижен', 'кризис', 'санкц', 'убыт', 'дефолт', 'распрод', 'обвалил', 'просад', 'drop', 'fall', 'plunge', 'loss', 'crash', 'cut', 'warn', 'slump', 'bear', 'sell-off', 'recession', 'default', 'tumble'];
  function scoreTitle(t) { const s = ' ' + t.toLowerCase() + ' '; let sc = 0; for (const w of POS) if (s.indexOf(w) >= 0) sc++; for (const w of NEG) if (s.indexOf(w) >= 0) sc--; return sc; }

  async function fetchNews(opts) {
    opts = opts || {};
    const feeds = (opts.feeds && opts.feeds.length) ? opts.feeds : ((window.LUN.NEWS && window.LUN.NEWS.feeds) || []);
    const chunks = await Promise.all(feeds.map((f) => fetchFeed(f).catch(() => [])));
    const all = chunks.reduce((a, x) => a.concat(x), []);
    const kw = (opts.keywords && opts.keywords.length) ? opts.keywords.map((k) => k.toLowerCase()) : null;
    const filtered = kw ? all.filter((it) => { const t = it.title.toLowerCase(); return kw.some((k) => t.indexOf(k) >= 0); }) : all.slice();
    // если по ключам инструмента пусто — показываем последние по рынку (не пустоту)
    let items = filtered, fallback = false;
    if (kw && !filtered.length && all.length) { items = all.slice(); fallback = true; }
    const seen = new Set();
    items = items.filter((it) => { const k = it.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    items.forEach((it) => { const sc = scoreTitle(it.title); it.score = sc; it.sent = sc > 0 ? 1 : (sc < 0 ? -1 : 0); });
    items.sort((a, b) => b.ts - a.ts);
    items = items.slice(0, 40);
    let pos = 0, neg = 0, neu = 0;
    items.forEach((it) => { if (it.sent > 0) pos++; else if (it.sent < 0) neg++; else neu++; });
    const net = (pos + neg) ? (pos - neg) / (pos + neg) : 0;
    return { items, total: all.length, matched: filtered.length, fallback, mood: { pos, neg, neu, net } };
  }

  window.LunNews = { fetch: fetchNews, scoreTitle };
})();
