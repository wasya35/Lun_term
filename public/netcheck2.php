<?php
/* netcheck2.php — уточняем, почему MOEX недоступен: IPv6 vs IPv4 vs блок диапазона.
 * Открой: https://ag-ts.ru/netcheck2.php?t=CHANGE_ME_TOKEN  · пришли вывод · удали файл. */
header('Content-Type: text/plain; charset=utf-8');
const NET_TOKEN = 'CHANGE_ME_TOKEN';
if (($_GET['t'] ?? '') !== NET_TOKEN) { http_response_code(403); exit("forbidden: ?t=ТОКЕН\n"); }

echo "netcheck2 · " . date('Y-m-d H:i:s') . " · PHP " . PHP_VERSION . "\n" . str_repeat('=', 64) . "\n";

// 1) DNS-записи MOEX: есть ли у них IPv4 (A) и IPv6 (AAAA)
foreach (['iss.moex.com', 'apim.moex.com'] as $h) {
  echo "DNS $h:\n";
  $a = @dns_get_record($h, DNS_A); $aaaa = @dns_get_record($h, DNS_AAAA);
  echo "  A (IPv4):  " . implode(', ', array_map(fn($r) => $r['ip'] ?? '?', $a ?: [])) . (($a === false || $a === []) ? '(нет/недоступно)' : '') . "\n";
  echo "  AAAA(IPv6):" . implode(', ', array_map(fn($r) => $r['ipv6'] ?? '?', $aaaa ?: [])) . (($aaaa === false || $aaaa === []) ? '(нет)' : '') . "\n";
}
echo str_repeat('-', 64) . "\n";

// 2) Пробуем достучаться тремя способами: как есть / только IPv4 / только IPv6
function tryc($url, $mode) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8, CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_SSL_VERIFYPEER => true, CURLOPT_USERAGENT => 'AG-TS-netcheck2/1.0', CURLOPT_NOBODY => true,
  ]);
  if ($mode === 'v4') curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
  if ($mode === 'v6') curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V6);
  $t = microtime(true); curl_exec($ch);
  $c = curl_getinfo($ch, CURLINFO_HTTP_CODE); $ip = curl_getinfo($ch, CURLINFO_PRIMARY_IP);
  $e = curl_error($ch); $ms = round((microtime(true) - $t) * 1000); curl_close($ch);
  return [$c, $ip, $e, $ms];
}
foreach (['https://iss.moex.com/iss.json', 'https://apim.moex.com/'] as $u) {
  echo "▶ $u\n";
  foreach (['как_есть' => 'default', 'только_IPv4' => 'v4', 'только_IPv6' => 'v6'] as $label => $mode) {
    [$c, $ip, $e, $ms] = tryc($u, $mode);
    echo "  [$label] HTTP $c · {$ms}ms · peer " . ($ip ?: '—') . ($e ? " · ERR: $e" : '') . "\n";
  }
  echo "\n";
}
echo str_repeat('=', 64) . "\nГотово. Пришли вывод, потом удали netcheck2.php\n";
