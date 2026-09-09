<?php
/* =============================================================================
 *  probe.php — РАЗОВЫЙ диагностический скрипт для AlgoPack (read-only).
 *  Цель: увидеть, какие эндпоинты и поля реально отдаёт подписка, и что хостинг
 *  достаёт apim.moex.com. Ключ НЕ печатается и НЕ хранится в коде.
 *
 *  Как пользоваться:
 *   1) Создай рядом файл algopack_secret.php с содержимым:
 *        <?php return 'ТВОЙ_API_КЛЮЧ';
 *      (если открыть его в браузере — PHP выполнит и отдаст пусто, ключ не утечёт)
 *      Либо задай переменную окружения ALGOPACK_KEY.
 *   2) Открой:  https://ag-ts.ru/probe.php?t=CHANGE_ME_TOKEN
 *   3) Скопируй ВЕСЬ вывод (в нём нет ключа) и пришли мне.
 *   4) После — удали probe.php и algopack_secret.php с хостинга.
 * ===========================================================================*/

header('Content-Type: text/plain; charset=utf-8');

// --- простая защита от посторонних: смени токен на свой ---
const PROBE_TOKEN = 'CHANGE_ME_TOKEN';
if (($_GET['t'] ?? '') !== PROBE_TOKEN) { http_response_code(403); exit("forbidden: добавь ?t=ТОКЕН (и смени PROBE_TOKEN в файле)\n"); }

// --- ключ: env → файл-секрет (в код не пишем) ---
$KEY = getenv('ALGOPACK_KEY') ?: '';
if (!$KEY && is_file(__DIR__ . '/algopack_secret.php')) { $KEY = (string)(include __DIR__ . '/algopack_secret.php'); }
$KEY = trim($KEY);
echo "AlgoPack probe · " . date('Y-m-d H:i:s') . "\n";
echo "ключ найден: " . ($KEY ? 'да (' . strlen($KEY) . " симв.)" : 'НЕТ — задай algopack_secret.php или ALGOPACK_KEY') . "\n";
echo "PHP " . PHP_VERSION . " · curl " . (function_exists('curl_version') ? curl_version()['version'] : 'нет!') . "\n";
echo str_repeat('=', 78) . "\n";

function fetch($url, $key) {
  $isApim = strpos($url, 'apim.moex.com') !== false;
  $ch = curl_init($url);
  $hdr = ['Accept: application/json'];
  if ($isApim && $key) { $hdr[] = 'Authorization: Bearer ' . $key; }  // ключ уходит ТОЛЬКО на apim
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $hdr,
    CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 12,
    CURLOPT_SSL_VERIFYPEER => true, CURLOPT_ENCODING => '',
    CURLOPT_USERAGENT => 'AG-TS-probe/1.0',
  ]);
  $body = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err  = curl_error($ch);
  curl_close($ch);
  return [$code, $body, $err];
}

// Разбор ISS-JSON: печатаем блоки, их колонки и 1 строку-образец.
function summarize($body) {
  $j = json_decode($body, true);
  if (!is_array($j)) { echo "  (не JSON) первые 300 симв: " . substr(preg_replace('/\s+/', ' ', (string)$body), 0, 300) . "\n"; return; }
  foreach ($j as $block => $val) {
    if (!is_array($val)) continue;
    $cols = $val['columns'] ?? null;
    $data = $val['data'] ?? null;
    if ($cols === null && $data === null) continue;
    echo "  блок «$block»";
    if (is_array($data)) echo " · строк: " . count($data);
    echo "\n";
    if (is_array($cols)) echo "    колонки: " . implode(', ', $cols) . "\n";
    if (is_array($data) && count($data)) echo "    образец: " . substr(json_encode($data[0], JSON_UNESCAPED_UNICODE), 0, 700) . "\n";
  }
}

// Матрица кандидатов — что вернёт 200, то и есть у нас. Разные формы путей нарочно.
$SI = ['SiU6', 'SiZ6'];          // ближний/следующий фьючерс Si (пробуем оба)
$targets = [];
// FUTOI (фьючерсы) — разные формы
$targets[] = ['FUTOI fo (без secid)',   'https://apim.moex.com/iss/datashop/algopack/fo/futoi.json?iss.meta=on&limit=3'];
foreach ($SI as $s) $targets[] = ["FUTOI fo/$s", "https://apim.moex.com/iss/datashop/algopack/fo/futoi/$s.json?iss.meta=on&limit=3"];
$targets[] = ['FUTOI fo asset=Si',      'https://apim.moex.com/iss/datashop/algopack/fo/futoi.json?asset=Si&iss.meta=on&limit=3'];
// TradeStats (фьючерсы)
$targets[] = ['TradeStats fo (без secid)', 'https://apim.moex.com/iss/datashop/algopack/fo/tradestats.json?iss.meta=on&limit=3'];
foreach ($SI as $s) $targets[] = ["TradeStats fo/$s", "https://apim.moex.com/iss/datashop/algopack/fo/tradestats/$s.json?iss.meta=on&limit=3"];
// HI2 (фьючерсы)
foreach ($SI as $s) $targets[] = ["HI2 fo/$s", "https://apim.moex.com/iss/datashop/algopack/fo/hi2/$s.json?iss.meta=on&limit=3"];
// Акции — tradestats / obstats / orderstats
$targets[] = ['TradeStats eq/SBER', 'https://apim.moex.com/iss/datashop/algopack/eq/tradestats/SBER.json?iss.meta=on&limit=3'];
$targets[] = ['OBStats eq/SBER',    'https://apim.moex.com/iss/datashop/algopack/eq/obstats/SBER.json?iss.meta=on&limit=3'];
$targets[] = ['OrderStats eq/SBER', 'https://apim.moex.com/iss/datashop/algopack/eq/orderstats/SBER.json?iss.meta=on&limit=3'];
// На случай, если ключ работает и через iss-хост (Passport-стиль)
$targets[] = ['FUTOI через iss-хост', 'https://iss.moex.com/iss/datashop/algopack/fo/futoi.json?iss.meta=on&limit=3'];
// Опционная доска (без ключа, публично) — колонки (нужны для GEX: THEORPRICE/IV/греки?)
$targets[] = ['Опц.доска securities', 'https://iss.moex.com/iss/engines/futures/markets/options/securities.json?iss.meta=on&iss.only=securities&limit=2'];
$targets[] = ['Опц.доска marketdata', 'https://iss.moex.com/iss/engines/futures/markets/options/securities.json?iss.meta=on&iss.only=marketdata&limit=2'];

foreach ($targets as [$name, $url]) {
  [$code, $body, $err] = fetch($url, $KEY);
  echo "\n▶ $name\n  URL: " . preg_replace('/([?&])/', '$1', $url) . "\n";
  echo "  HTTP $code" . ($err ? "  CURL-ERR: $err" : '') . "\n";
  if ($code == 200 && $body) summarize($body);
  elseif ($body) echo "  тело(300): " . substr(preg_replace('/\s+/', ' ', $body), 0, 300) . "\n";
}
echo "\n" . str_repeat('=', 78) . "\nГотово. Пришли этот вывод. Потом удали probe.php и algopack_secret.php.\n";
