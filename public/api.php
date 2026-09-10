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

// Запрос к apim.moex.com с Bearer-ключом. На старых хостингах (CentOS 7) PHP-шный
// curl собран на NSS и падает на сертификате apim ("Unrecognized Object Identifier").
// Поэтому: пробуем curl, а при его сбое — уходим через OpenSSL-потоки PHP
// (file_get_contents), которые используют системный OpenSSL и сертификат разбирают.
// Возвращает ['body'=>string|false, 'code'=>int, 'err'=>string, 'via'=>'curl'|'stream'].
function moex_authed_get($url, $key) {
  static $skipCurl = false;   // на этом хостинге curl (NSS) не парсит сертификат apim —
                              // после первого провала ходим сразу через OpenSSL-потоки.
  $curlErr = 'skipped';
  if (!$skipCurl && function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true,
      CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 12,
      CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Accept: application/json'],
      CURLOPT_USERAGENT => 'AG-TS/1.0',
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);
    if ($body !== false && $code > 0) return ['body' => $body, 'code' => $code, 'err' => '', 'via' => 'curl'];
  }
  // fallback: OpenSSL-потоки (обходят NSS).
  $ctx = stream_context_create([
    'http' => [
      'method'  => 'GET',
      'header'  => "Authorization: Bearer $key\r\nAccept: application/json\r\nUser-Agent: AG-TS/1.0\r\n",
      'timeout' => 25, 'ignore_errors' => true, 'follow_location' => 1,
    ],
    'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
  ]);
  $body = @file_get_contents($url, false, $ctx);
  if ($body === false) return ['body' => false, 'code' => 0, 'err' => 'curl: ' . $curlErr . ' | stream: тоже не удалось (allow_url_fopen?)', 'via' => 'stream'];
  $skipCurl = true;   // поток сработал — дальше не тратим время на curl
  $code = 0;
  if (isset($http_response_header) && is_array($http_response_header)) {
    foreach ($http_response_header as $h) { if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) $code = (int)$m[1]; }
  }
  return ['body' => $body, 'code' => $code ?: 200, 'err' => '', 'via' => 'stream'];
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
    // TTL отложенного кэша по типу запроса
    $ttl = 120;
    if (strpos($url, 'candles') !== false) $ttl = 45;
    elseif (strpos($url, 'securities.json') !== false) $ttl = 600;
    elseif (strpos($url, 'analyticalproducts') !== false) $ttl = 120;
    elseif (strpos($url, '/history/') !== false) $ttl = 300;
    $isJson = function ($b) { $t = ltrim((string)$b); return $t !== '' && ($t[0] === '{' || $t[0] === '['); };
    // 1) ОНЛАЙН: тот же ISS-путь, но с apim.moex.com + Bearer (реалтайм по подписке
    //    AlgoPack). Ключ — из lun_data/pk.php. Онлайн-кэш короче (свечи быстро живут).
    $keyFile = __DIR__ . '/lun_data/pk.php';
    $KEY = is_file($keyFile) ? (include $keyFile) : null;
    if (is_string($KEY) && $KEY !== '') {
      $p = parse_url($url);
      $path = ($p['path'] ?? '') . (isset($p['query']) ? '?' . $p['query'] : '');
      $onlineTtl = (strpos($url, 'candles') !== false) ? 20 : $ttl;
      $ckO = 'issO|' . $url;
      $hitO = cache_get($ckO, $onlineTtl);
      if ($hitO !== null) { header('X-Data-Source: online'); echo $hitO; exit; }
      $r = moex_authed_get('https://apim.moex.com' . $path, $KEY);
      if ((int)$r['code'] === 200 && $isJson($r['body'])) {
        cache_put($ckO, $r['body']); header('X-Data-Source: online'); echo $r['body']; exit;
      }
      // apim не дал 200/JSON — тихо падаем на отложенный ниже
    }
    // 2) ОТЛОЖЕННЫЙ (резерв): публичный iss.moex.com (T−15), server-to-server.
    $ckD = 'issD|' . $url;
    $hitD = cache_get($ckD, $ttl);
    if ($hitD !== null) { header('X-Data-Source: delayed'); echo $hitD; exit; }
    try {
      $body = http_get($url);
      if (!$isJson($body)) throw new Exception('ISS не отдал JSON');
      cache_put($ckD, $body); header('X-Data-Source: delayed'); echo $body;
    } catch (Exception $e) { http_response_code(502); echo json_encode(['error' => $e->getMessage()]); }
    exit;
  }
  // AlgoPack (по подписке, с ключом) — с сервера loki MOEX доступен напрямую, поэтому
  // ходим прямо на apim.moex.com с заголовком Authorization: Bearer <ключ>. Шлюз не
  // нужен. Пускаем ТОЛЬКО залогиненного, строим корректный ISS-путь по датасету, кэшируем.
  // Ключ лежит в НЕ-гит файле public/lun_data/pk.php (`<?php return 'КЛЮЧ';`) — папка
  // lun_data закрыта .htaccess наглухо (Require all denied / F,L), в git не попадает.
  if ($fn === 'algopack') {
    @session_start();
    header('Content-Type: application/json; charset=utf-8');
    send_cors();
    if (empty($_SESSION['uid'])) { http_response_code(401); echo json_encode(['error' => 'login required']); exit; }
    if (!rate_ok('algopack', 300, 60)) too_many();
    $keyFile = __DIR__ . '/lun_data/pk.php';
    $KEY = is_file($keyFile) ? (include $keyFile) : null;
    if (!is_string($KEY) || $KEY === '') { http_response_code(500); echo json_encode(['error' => 'algopack key not configured (lun_data/pk.php)']); exit; }
    $ds = $_GET['ds'] ?? '';
    $secid = preg_replace('/[^A-Za-z0-9._-]/', '', (string)($_GET['secid'] ?? ''));
    $mkt = in_array(($_GET['mkt'] ?? 'fo'), ['eq', 'fo', 'fx'], true) ? ($_GET['mkt'] ?? 'fo') : 'fo';
    $q = [];
    foreach (['date', 'from', 'till', 'start', 'latest', 'interval'] as $k) {
      if (isset($_GET[$k]) && $_GET[$k] !== '') $q[$k] = preg_replace('/[^A-Za-z0-9:_.\-]/', '', (string)$_GET[$k]);
    }
    $qs = $q ? ('?' . http_build_query($q)) : '';
    if ($ds === 'futoi') {
      $issPath = $secid !== '' ? "/iss/analyticalproducts/futoi/securities/$secid.json$qs" : "/iss/analyticalproducts/futoi/securities.json$qs";
    } elseif (in_array($ds, ['tradestats', 'obstats', 'orderstats', 'hi2', 'alerts'], true)) {
      $issPath = $secid !== '' ? "/iss/datashop/algopack/$mkt/$ds/$secid.json$qs" : "/iss/datashop/algopack/$mkt/$ds.json$qs";
    } else { http_response_code(400); echo json_encode(['error' => 'bad ds']); exit; }
    $ttl = ($ds === 'futoi') ? 60 : 90;
    $ck = 'algopack|' . $issPath;
    $hit = cache_get($ck, $ttl);
    if ($hit !== null) { echo $hit; exit; }
    $url = 'https://apim.moex.com' . $issPath;
    try {
      $r = moex_authed_get($url, $KEY);
      if ($r['body'] === false) { http_response_code(502); echo json_encode(['error' => 'moex: ' . $r['err']]); exit; }
      if ($r['code'] === 200) { $t = ltrim($r['body']); if ($t !== '' && ($t[0] === '{' || $t[0] === '[')) cache_put($ck, $r['body']); }
      http_response_code($r['code'] ?: 502); echo $r['body'];
    } catch (Exception $e) { http_response_code(502); echo json_encode(['error' => $e->getMessage()]); }
    exit;
  }
  // ВРЕМЕННАЯ ДИАГНОСТИКА: серверный само-тест доступности apim (realtime) vs iss
  // (delayed) по разным путям. Только залогиненному. Открой api.php?fn=algotest и
  // пришли JSON — по нему проектируем единую схему источника. Потом удалим.
  if ($fn === 'algotest') {
    @session_start();
    header('Content-Type: application/json; charset=utf-8'); send_cors();
    if (empty($_SESSION['uid'])) { http_response_code(401); echo json_encode(['error' => 'login required']); exit; }
    $keyFile = __DIR__ . '/lun_data/pk.php';
    $KEY = is_file($keyFile) ? (include $keyFile) : null;
    $hasKey = is_string($KEY) && $KEY !== '';
    if (!$hasKey) { echo json_encode(['error' => 'no key']); exit; }
    // Разбор гранулярности FUTOI: сколько строк и какие ВРЕМЕНА возвращает apim
    // при разных запросах (за сегодня, вчера, диапазон). Так видно, есть ли 5-мин
    // внутридневные снимки физ/юр (нужны для показа по бару M5).
    $probe = function ($path) use ($KEY) {
      $r = moex_authed_get('https://apim.moex.com' . $path, $KEY);
      $res = ['code' => $r['code'], 'via' => $r['via']];
      $j = json_decode($r['body'], true);
      $tbl = null;
      if (is_array($j)) foreach ($j as $k => $v) { if (is_array($v) && isset($v['columns'], $v['data']) && in_array('clgroup', $v['columns'], true)) { $tbl = $v; break; } }
      if (!$tbl) { $res['rows'] = 0; $res['note'] = 'нет таблицы futoi'; $res['raw'] = mb_substr(preg_replace('/\s+/', ' ', (string)$r['body']), 0, 160); return $res; }
      $ci = array_flip($tbl['columns']);
      $rows = $tbl['data'];
      $res['rows'] = count($rows);
      // соберём (date time clgroup) первых 4 и последних 8 строк
      $fmt = function ($row) use ($ci) { return ($row[$ci['tradedate']] ?? '?') . ' ' . ($row[$ci['tradetime']] ?? '?') . ' ' . ($row[$ci['clgroup']] ?? '?'); };
      $res['first'] = array_map($fmt, array_slice($rows, 0, 4));
      $res['last'] = array_map($fmt, array_slice($rows, -8));
      // уникальные времена только для FIZ за последнюю дату (оценка шага)
      $lastDate = null; foreach (array_reverse($rows) as $row) { $d = $row[$ci['tradedate']] ?? null; if ($d) { $lastDate = $d; break; } }
      $times = [];
      foreach ($rows as $row) { if (($row[$ci['tradedate']] ?? '') === $lastDate && ($row[$ci['clgroup']] ?? '') === 'FIZ') $times[] = $row[$ci['tradetime']] ?? '?'; }
      $res['lastDate'] = $lastDate; $res['lastDate_FIZ_times'] = array_slice($times, 0, 40); $res['lastDate_FIZ_count'] = count($times);
      return $res;
    };
    $today = gmdate('Y-m-d'); $y1 = gmdate('Y-m-d', time() - 86400); $y3 = gmdate('Y-m-d', time() - 3 * 86400);
    $out = ['server_time' => gmdate('c'), 'today' => $today, 'probes' => [
      'date_today'      => $probe("/iss/analyticalproducts/futoi/securities/Si.json?date=$today"),
      'date_yesterday'  => $probe("/iss/analyticalproducts/futoi/securities/Si.json?date=$y1"),
      'date_3daysAgo'   => $probe("/iss/analyticalproducts/futoi/securities/Si.json?date=$y3"),
      'from_today_till_today' => $probe("/iss/analyticalproducts/futoi/securities/Si.json?from=$today&till=$today"),
      'from_3d_till_today'    => $probe("/iss/analyticalproducts/futoi/securities/Si.json?from=$y3&till=$today"),
    ]];
    echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT); exit;
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
