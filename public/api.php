<?php
/* =============================================================================
 *  api.php — прокси к MOEX ISS на PHP (для шаред-хостинга: СпринтХост/Таймвеб)
 * =============================================================================
 *  Тот же контракт, что у Node-сервера, но без Node — работает на любом
 *  обычном хостинге с PHP. Кладётся в корень поддомена рядом с index.html.
 *
 *  Вызовы:
 *    api.php?fn=front&asset=Si
 *    api.php?fn=candles&secid=SiU6&iss=60&from=2026-07-01&till=2026-07-31
 *  (фронтенд ходит на /api/front и /api/candles — их на api.php заворачивает
 *   .htaccess; если mod_rewrite недоступен, фронтенд сам зовёт api.php?fn=...)
 * ===========================================================================*/

/* ----------------------------- чистые функции ----------------------------- */

// "YYYY-MM-DD HH:MM:SS" (МСК, UTC+3) -> epoch ms
function msk_to_ms($s) {
  $t = strtotime(str_replace('T', ' ', $s) . ' +0300');
  return $t === false ? null : $t * 1000;
}

// строки ISS-таблицы -> массив ассоц. массивов по именам колонок
function rows_to_objects($table) {
  if (!$table || empty($table['columns']) || !isset($table['data'])) return [];
  $cols = $table['columns'];
  $out = [];
  foreach ($table['data'] as $row) {
    $o = [];
    foreach ($cols as $i => $name) $o[$name] = $row[$i] ?? null;
    $out[] = $o;
  }
  return $out;
}

// страницы candles.json -> бары KLineChart
function parse_candles($pages) {
  $out = [];
  foreach ($pages as $j) {
    foreach (rows_to_objects($j['candles'] ?? null) as $o) {
      $ts = msk_to_ms($o['begin']);
      if ($ts !== null) $out[] = [
        'timestamp' => $ts,
        'open' => $o['open'], 'high' => $o['high'], 'low' => $o['low'],
        'close' => $o['close'], 'volume' => $o['volume'],
      ];
    }
  }
  return $out;
}

// агрегация минуток в N-минутные свечи
function aggregate_bars($bars, $n) {
  $step = $n * 60000;
  $out = []; $cur = null;
  foreach ($bars as $b) {
    $bucket = intdiv((int)$b['timestamp'], $step) * $step;
    if ($cur === null || $cur['timestamp'] !== $bucket) {
      if ($cur !== null) $out[] = $cur;
      $cur = ['timestamp' => $bucket, 'open' => $b['open'], 'high' => $b['high'],
              'low' => $b['low'], 'close' => $b['close'], 'volume' => $b['volume'] ?: 0];
    } else {
      $cur['high'] = max($cur['high'], $b['high']);
      $cur['low']  = min($cur['low'], $b['low']);
      $cur['close'] = $b['close'];
      $cur['volume'] += $b['volume'] ?: 0;
    }
  }
  if ($cur !== null) $out[] = $cur;
  return $out;
}

// выбрать ближний фьючерс актива из страниц securities.json
function pick_front($pages, $asset, $today) {
  $seen = []; $list = [];
  foreach ($pages as $j) {
    foreach (rows_to_objects($j['securities'] ?? null) as $o) {
      if (($o['ASSETCODE'] ?? null) !== $asset) continue;
      $secid = $o['SECID'] ?? '';
      if (!preg_match('/^[A-Za-z]{1,3}[FGHJKMNQUVXZ]\d$/', $secid)) continue; // фьючерсы, без опционов
      $ldd = $o['LASTDELDATE'] ?? '';
      if ($ldd === '' || $ldd < $today) continue;
      if (isset($seen[$secid])) continue; $seen[$secid] = true;
      $list[] = ['ticker' => $secid, 'lastDelDate' => $ldd];
    }
  }
  usort($list, fn($a, $b) => strcmp($a['lastDelDate'], $b['lastDelDate']));
  return $list;
}

/* ------------------------------- сеть (ISS) ------------------------------- */

function http_get($url) {
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 10,
      CURLOPT_USERAGENT => 'Astro-Gann/1.0',
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($body === false) throw new Exception('curl: ' . $err);
    if ($code !== 200) throw new Exception('ISS HTTP ' . $code);
    return $body;
  }
  $ctx = stream_context_create(['http' => ['timeout' => 20, 'user_agent' => 'Astro-Gann/1.0']]);
  $body = @file_get_contents($url, false, $ctx);
  if ($body === false) throw new Exception('file_get_contents failed (проверьте allow_url_fopen/curl на хостинге)');
  return $body;
}

function iss_get_json($url) {
  $data = json_decode(http_get($url), true);
  if (!is_array($data)) throw new Exception('bad JSON from ISS');
  return $data;
}

// постранично тянем ?start=N, пока таблица $table не иссякнет
function iss_get_all_pages($baseUrl, $table, $maxPages = 40) {
  $pages = []; $start = 0;
  for ($i = 0; $i < $maxPages; $i++) {
    $sep = (strpos($baseUrl, '?') !== false) ? '&' : '?';
    $j = iss_get_json($baseUrl . $sep . 'start=' . $start);
    $pages[] = $j;
    $rows = isset($j[$table]['data']) ? count($j[$table]['data']) : 0;
    if ($rows === 0) break;
    $start += $rows;
  }
  return $pages;
}

function fetch_candles($secid, $interval, $from, $till) {
  $base = 'https://iss.moex.com/iss/engines/futures/markets/forts/securities/'
    . rawurlencode($secid) . '/candles.json?interval=' . rawurlencode($interval)
    . '&from=' . rawurlencode($from) . '&till=' . rawurlencode($till) . '&iss.reverse=false';
  return parse_candles(iss_get_all_pages($base, 'candles'));
}

function fetch_front($asset, $today) {
  $base = 'https://iss.moex.com/iss/engines/futures/markets/forts/securities.json'
    . '?iss.meta=off&securities.columns=SECID,ASSETCODE,LASTDELDATE';
  return pick_front(iss_get_all_pages($base, 'securities'), $asset, $today);
}

/* --------------------- защита: IP, кэш, лимит, CORS ----------------------- */

// реальный IP клиента (за Cloudflare — CF-Connecting-IP; иначе REMOTE_ADDR).
// XFF намеренно НЕ доверяем (спуфится) — только доверенный заголовок CF.
function client_ip() {
  if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) return $_SERVER['HTTP_CF_CONNECTING_IP'];
  return $_SERVER['REMOTE_ADDR'] ?? '0';
}

function lun_priv_dir($sub) {
  $d = __DIR__ . '/lun_data/' . $sub;
  if (!is_dir($d)) @mkdir($d, 0770, true);
  return $d;
}

// серверный кэш ответов (файловый). Ключ — строка запроса, TTL — секунды.
function cache_get($key, $ttl) {
  $f = lun_priv_dir('cache') . '/' . md5($key);
  if (is_file($f) && (time() - filemtime($f) < $ttl)) { $v = @file_get_contents($f); if ($v !== false) return $v; }
  return null;
}
function cache_put($key, $val) {
  @file_put_contents(lun_priv_dir('cache') . '/' . md5($key), $val, LOCK_EX);
  // раз в ~50 запросов подчищаем протухшее (>1ч), чтобы папка не пухла.
  if (mt_rand(1, 50) === 1) { foreach (glob(lun_priv_dir('cache') . '/*') ?: [] as $g) { if (time() - filemtime($g) > 3600) @unlink($g); } }
}

// rate-limit по IP (фикс. окно). true = можно, false = превышено.
function rate_ok($bucket, $max, $win) {
  $d = lun_priv_dir('rl');
  $ip = client_ip();
  $winId = intdiv(time(), $win);
  $f = $d . '/' . md5($bucket . '|' . $ip . '|' . $winId);
  $n = is_file($f) ? (int)@file_get_contents($f) : 0;
  $n++;
  @file_put_contents($f, (string)$n, LOCK_EX);
  if (mt_rand(1, 50) === 1) { foreach (glob($d . '/*') ?: [] as $g) { if (time() - filemtime($g) > 2 * $win) @unlink($g); } }
  return $n <= $max;
}

// CORS: отвечаем ТОЛЬКО своему источнику (same-origin). Чужие сайты не смогут
// читать прокси из браузера. Свой фронтенд ходит same-origin — ему ок.
function send_cors() {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin !== '') {
    $oHost = strtolower((string)parse_url($origin, PHP_URL_HOST));
    $host = strtolower($_SERVER['HTTP_HOST'] ?? '');
    if ($oHost !== '' && $oHost === $host) { header('Access-Control-Allow-Origin: ' . $origin); header('Vary: Origin'); }
  }
}

function too_many() { http_response_code(429); header('Retry-After: 30'); header('Content-Type: application/json'); echo json_encode(['error' => 'rate limited']); exit; }

/* ------------------------------- диспетчер ------------------------------- */

if (!defined('LUN_NO_DISPATCH')) {
  $fn = $_GET['fn'] ?? '';
  // RSS-прокси новостей: тянет ленту на сервере (без CORS у клиента). Хосты —
  // по белому списку, чтобы не быть открытым прокси.
  if ($fn === 'rss') {
    send_cors();
    if (!rate_ok('rss', 40, 60)) too_many();
    $url = $_GET['url'] ?? '';
    $allow = ['rbc.ru', 'ria.ru', '1prime.ru', 'lenta.ru', 'finam.ru', 'investing.com', 'oilprice.com', 'mining.com', 'coindesk.com', 'cointelegraph.com', 'finance.yahoo.com'];
    $host = strtolower(parse_url($url, PHP_URL_HOST) ?? '');
    $ok = false; foreach ($allow as $h) { if ($host === $h || substr($host, -(strlen($h) + 1)) === '.' . $h) { $ok = true; break; } }
    if (!$ok) { http_response_code(400); header('Content-Type: application/json'); echo json_encode(['error' => 'host not allowed']); exit; }
    $ck = 'rss|' . $url;
    $hit = cache_get($ck, 300);                       // ленты кэшируем на 5 мин
    if ($hit !== null) { header('Content-Type: application/xml; charset=utf-8'); echo $hit; exit; }
    try { $body = http_get($url); cache_put($ck, $body); header('Content-Type: application/xml; charset=utf-8'); echo $body; }
    catch (Exception $e) { http_response_code(502); header('Content-Type: application/json'); echo json_encode(['error' => $e->getMessage()]); }
    exit;
  }
  // Универсальный серверный проксик к MOEX ISS: браузер шлёт готовый ISS-URL,
  // сервер ходит на него server-to-server (без CORS и публичных шлюзов) и кэширует.
  // Через него идёт ВЕСЬ трафик ISS (свечи, склейка непрерывного фьючерса, ближний
  // контракт, ОИ/FUTOI, поиск бумаг) — это и есть «бесплатное укрепление» MOEX.
  // Хост жёстко ограничен iss.moex.com, чтобы не быть открытым прокси.
  if ($fn === 'iss') {
    send_cors();
    if (!rate_ok('iss', 600, 60)) too_many();          // склейка фьючерса даёт много страниц
    $url = $_GET['url'] ?? '';
    $host = strtolower((string)parse_url($url, PHP_URL_HOST));
    header('Content-Type: application/json; charset=utf-8');
    if ($host !== 'iss.moex.com') { http_response_code(400); echo json_encode(['error' => 'host not allowed']); exit; }
    $ttl = 120;
    if (strpos($url, 'candles') !== false) $ttl = 45;
    elseif (strpos($url, 'securities.json') !== false) $ttl = 600;
    elseif (strpos($url, 'analyticalproducts') !== false) $ttl = 120;
    elseif (strpos($url, '/history/') !== false) $ttl = 300;
    $ck = 'iss|' . $url;
    $hit = cache_get($ck, $ttl);
    if ($hit !== null) { echo $hit; exit; }
    try {
      $body = http_get($url); $t = ltrim($body);
      if ($t === '' || ($t[0] !== '{' && $t[0] !== '[')) throw new Exception('ISS не отдал JSON');
      cache_put($ck, $body); echo $body;
    } catch (Exception $e) { http_response_code(502); echo json_encode(['error' => $e->getMessage()]); }
    exit;
  }
  header('Content-Type: application/json; charset=utf-8');
  send_cors();
  if (!rate_ok('api', 120, 60)) too_many();           // 120 запросов/мин на IP
  try {
    if ($fn === 'front') {
      $asset = $_GET['asset'] ?? '';
      if ($asset === '') { http_response_code(400); echo json_encode(['error' => 'bad params']); exit; }
      $today = gmdate('Y-m-d');
      $ck = 'front|' . $asset . '|' . $today;
      $hit = cache_get($ck, 3600);                    // ближний контракт меняется редко → 1ч
      if ($hit !== null) { echo $hit; exit; }
      $list = fetch_front($asset, $today);
      if (!$list) { http_response_code(404); echo json_encode(['error' => 'no front contract for ' . $asset]); exit; }
      $out = json_encode(['ticker' => $list[0]['ticker'], 'lastDelDate' => $list[0]['lastDelDate'], 'contracts' => $list]);
      cache_put($ck, $out); echo $out;
    } elseif ($fn === 'candles') {
      $secid = $_GET['secid'] ?? ''; $iss = $_GET['iss'] ?? '';
      $from = $_GET['from'] ?? ''; $till = $_GET['till'] ?? '';
      if ($secid === '' || $iss === '' || $from === '' || $till === '') { http_response_code(400); echo json_encode(['error' => 'bad params']); exit; }
      // TTL: интрадей — коротко (реалтайм догрузит поток), дневки — длиннее.
      $ttl = ($iss === '24') ? 900 : (($iss === '60') ? 120 : 45);
      $ck = 'candles|' . $secid . '|' . $iss . '|' . $from . '|' . $till;
      $hit = cache_get($ck, $ttl);
      if ($hit !== null) { echo $hit; exit; }
      if ($iss === '5' || $iss === '15') $bars = aggregate_bars(fetch_candles($secid, '1', $from, $till), (int)$iss);
      else $bars = fetch_candles($secid, $iss, $from, $till);
      $out = json_encode($bars);
      cache_put($ck, $out); echo $out;
    } else {
      http_response_code(400); echo json_encode(['error' => 'unknown fn']);
    }
  } catch (Exception $e) {
    http_response_code(502); echo json_encode(['error' => $e->getMessage()]);
  }
}
