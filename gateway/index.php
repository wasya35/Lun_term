<?php
/* =============================================================================
 *  AG-TS AlgoPack Gateway  (деплой: Timeweb Cloud App Platform, из GitHub)
 * =============================================================================
 *  Держит ключ MOEX ALGOPACK и ходит на apim.moex.com с Authorization: Bearer.
 *  Терминал сам ключ НЕ видит: браузер → api.php (SprintHost, проверяет логин)
 *  → ЭТОТ шлюз (проверяет общий секрет) → apim.moex.com → данные назад.
 *
 *  Переменные окружения (задаются в панели Timeweb, НЕ в коде/git):
 *    ALGOPACK_KEY     — API-ключ ALGOPACK (Bearer)
 *    GATEWAY_SECRET   — общий секрет между api.php и шлюзом (длинная строка)
 *    PORT             — порт (Timeweb обычно задаёт сам; иначе 8080)
 *
 *  Контракт: GET /moex/iss/....json?...  +  заголовок  X-Gate-Secret: <секрет>
 *  Шлюз подставляет хост apim + Bearer и форвардит. Белый список путей ниже —
 *  чтобы даже при утечке секрета это не был открытый прокси.
 * ===========================================================================*/

$KEY    = trim((string)getenv('ALGOPACK_KEY'));
$SECRET = trim((string)getenv('GATEWAY_SECRET'));

$reqUri = $_SERVER['REQUEST_URI'] ?? '/';
$path   = parse_url($reqUri, PHP_URL_PATH) ?: '/';

// health-check (Timeweb пингует корень)
if ($path === '/' || $path === '/health') { header('Content-Type: text/plain'); echo 'ok'; exit; }

header('Content-Type: application/json; charset=utf-8');

// только префикс /moex/...
if (strncmp($path, '/moex/', 6) !== 0) { http_response_code(404); echo '{"error":"not found"}'; exit; }

// общий секрет
$got = $_SERVER['HTTP_X_GATE_SECRET'] ?? '';
if ($SECRET === '' || !is_string($got) || !hash_equals($SECRET, $got)) { http_response_code(403); echo '{"error":"forbidden"}'; exit; }
if ($KEY === '') { http_response_code(500); echo '{"error":"gateway has no ALGOPACK_KEY"}'; exit; }

// ISS-путь = всё после /moex (начинается с /iss/...), сохраняем query как есть
$issPath = substr($reqUri, strlen('/moex'));
$p = parse_url($issPath, PHP_URL_PATH) ?: '';

// белый список: только AlgoPack/аналитика/движки ISS
$allow = ['/iss/analyticalproducts/futoi/', '/iss/datashop/algopack/', '/iss/engines/'];
$ok = false; foreach ($allow as $a) { if (strncmp($p, $a, strlen($a)) === 0) { $ok = true; break; } }
if (!$ok) { http_response_code(400); echo '{"error":"path not allowed"}'; exit; }

// лёгкий рейт-лимит (файловый, минутное окно)
$win = sys_get_temp_dir() . '/agts_gw_' . intdiv(time(), 60);
$cnt = is_file($win) ? (int)@file_get_contents($win) : 0;
if ($cnt > 400) { http_response_code(429); header('Retry-After: 20'); echo '{"error":"rate limited"}'; exit; }
@file_put_contents($win, (string)($cnt + 1), LOCK_EX);

// форвард на apim с Bearer
$url = 'https://apim.moex.com' . $issPath;
$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true,
  CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 12,
  CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $KEY, 'Accept: application/json'],
  CURLOPT_USERAGENT => 'AG-TS-gateway/1.0',
]);
$body = curl_exec($ch);
$code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);
curl_close($ch);

if ($body === false) { http_response_code(502); echo json_encode(['error' => 'gateway curl: ' . $err], JSON_UNESCAPED_UNICODE); exit; }
http_response_code($code ?: 502);
echo $body;
