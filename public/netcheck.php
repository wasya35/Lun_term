<?php
/* netcheck.php — быстрая проверка исходящей связности сервера (без ключа).
 * Открой:  https://ag-ts.ru/netcheck.php?t=ТВОЙ_ТОКЕН   (смени токен ниже)
 * Пришли вывод. Потом удали файл. */
header('Content-Type: text/plain; charset=utf-8');
const NET_TOKEN = 'CHANGE_ME_TOKEN';
if (($_GET['t'] ?? '') !== NET_TOKEN) { http_response_code(403); exit("forbidden: ?t=ТОКЕН (смени NET_TOKEN)\n"); }

echo "netcheck · " . date('Y-m-d H:i:s') . " · PHP " . PHP_VERSION . "\n";
echo "curl: " . (function_exists('curl_version') ? curl_version()['version'] : 'НЕТ') . "\n";
echo "allow_url_fopen: " . (ini_get('allow_url_fopen') ? 'on' : 'off') . "\n";
echo str_repeat('=', 70) . "\n";

function ping($url, $timeout = 8) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => $timeout,
    CURLOPT_SSL_VERIFYPEER => true, CURLOPT_USERAGENT => 'AG-TS-netcheck/1.0',
    CURLOPT_HTTPHEADER => ['Accept: */*'],
  ]);
  $t0 = microtime(true);
  $b = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $ip = curl_getinfo($ch, CURLINFO_PRIMARY_IP);
  $err = curl_error($ch);
  $ms = round((microtime(true) - $t0) * 1000);
  curl_close($ch);
  return [$code, $b, $err, $ip, $ms];
}

$tests = [
  'НЕЙТРАЛЬНЫЙ (github)'      => 'https://api.github.com/',
  'IP/страна сервера'        => 'https://ipapi.co/json/',
  'MOEX iss (доска и свечи)' => 'https://iss.moex.com/iss.json',
  'MOEX apim (AlgoPack)'     => 'https://apim.moex.com/',
];
foreach ($tests as $label => $url) {
  [$code, $b, $err, $ip, $ms] = ping($url);
  echo "▶ $label\n  $url\n  HTTP $code · {$ms}ms · peer-IP: " . ($ip ?: '—') . ($err ? "\n  ERR: $err" : '') . "\n";
  if ($label === 'IP/страна сервера' && $code == 200) {
    $j = json_decode($b, true);
    if (is_array($j)) echo "  → сервер: " . ($j['ip'] ?? '?') . " · " . ($j['country_name'] ?? $j['country'] ?? '?') . " · " . ($j['org'] ?? '') . "\n";
  }
  echo "\n";
}
echo str_repeat('=', 70) . "\nГотово. Пришли вывод, потом удали netcheck.php\n";
