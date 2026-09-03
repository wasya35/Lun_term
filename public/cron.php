<?php
/* =============================================================================
 *  cron.php — серверная проверка алертов (без включённого терминала).
 * =============================================================================
 *  Запускать по расписанию хостинга каждые 1–5 мин. Пример cron-строки
 *  (каждые 2 минуты): «minute=2-звёздочка/шаг, дальше 4 звёздочки», команда:
 *     php /home/USER/ttl/cron.php
 *  или HTTP-крон: https://ttl.vikirnik.ru/cron.php?key=СЕКРЕТ
 *  (секрет — положить в lun_data/cron_key.txt; при HTTP-вызове обязателен).
 *
 *  Проверяет:
 *    price — текущая цена инструмента vs уровень (тянет MOEX/Bybit/Yahoo);
 *    astro — наступило ли заранее вычисленное время события (fire_ts).
 *  Шлёт e-mail (mail()) и/или Telegram (если положен токен в lun_data/tg_token.txt).
 *  Telegram-привязка: юзер шлёт боту «/start КОД», cron ловит через getUpdates.
 * ===========================================================================*/

define('LUN_NO_DISPATCH', true);
require __DIR__ . '/api.php';            // http_get()

$dir = __DIR__ . '/lun_data';
$isCli = (php_sapi_name() === 'cli');
$keyFile = $dir . '/cron_key.txt';
// HTTP-вызов разрешён ТОЛЬКО с верным ключом. Если ключа нет — закрыто наглухо
// (fail-closed): иначе любой мог бы дёргать рассылку алертов. CLI — без ключа.
if (!$isCli) {
  $key = file_exists($keyFile) ? trim(@file_get_contents($keyFile)) : '';
  if ($key === '' || !hash_equals($key, (string)($_GET['key'] ?? ''))) { http_response_code(403); exit('forbidden'); }
}

try { $pdo = new PDO('sqlite:' . $dir . '/users.db'); $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); }
catch (Exception $e) { exit('db: ' . $e->getMessage()); }

$TG = file_exists($dir . '/tg_token.txt') ? trim(@file_get_contents($dir . '/tg_token.txt')) : '';

/* ---- привязка Telegram через getUpdates ---- */
function tg_link($pdo, $token, $dir) {
  $offFile = $dir . '/tg_offset.txt';
  $offset = (int)@file_get_contents($offFile);
  try { $j = json_decode(http_get('https://api.telegram.org/bot' . $token . '/getUpdates?timeout=0&offset=' . ($offset + 1)), true); }
  catch (Exception $e) { return; }
  if (empty($j['result'])) return;
  foreach ($j['result'] as $upd) {
    $offset = max($offset, (int)$upd['update_id']);
    $msg = $upd['message'] ?? null; if (!$msg) continue;
    $chat = $msg['chat']['id'] ?? null; $text = trim($msg['text'] ?? '');
    if ($chat && preg_match('/([A-F0-9]{6})/i', $text, $m)) {
      $code = strtoupper($m[1]);
      $st = $pdo->prepare('UPDATE users SET tg_chat = ?, tg_code = NULL WHERE tg_code = ?');
      $st->execute([(string)$chat, $code]);
      if ($st->rowCount() && $token) tg_send($token, $chat, '✅ Telegram привязан к Astro-Gann. Сюда будут приходить алерты.');
    }
  }
  @file_put_contents($offFile, $offset);
}
function tg_send($token, $chat, $text) {
  try { http_get('https://api.telegram.org/bot' . $token . '/sendMessage?chat_id=' . rawurlencode($chat) . '&text=' . rawurlencode($text)); } catch (Exception $e) {}
}

/* ---- текущая цена инструмента ---- */
function current_price($provider, $instrument) {
  try {
    if ($provider === 'bybit') {
      $j = json_decode(http_get('https://api.bybit.com/v5/market/tickers?category=spot&symbol=' . rawurlencode($instrument)), true);
      return isset($j['result']['list'][0]['lastPrice']) ? (float)$j['result']['list'][0]['lastPrice'] : null;
    }
    if ($provider === 'yahoo') {
      $j = json_decode(http_get('https://query1.finance.yahoo.com/v8/finance/chart/' . rawurlencode($instrument) . '?interval=1d&range=1d'), true);
      $r = $j['chart']['result'][0]['meta']['regularMarketPrice'] ?? null;
      return $r !== null ? (float)$r : null;
    }
    // MOEX фьючерс — последняя цена из marketdata
    $j = json_decode(http_get('https://iss.moex.com/iss/engines/futures/markets/forts/securities/' . rawurlencode($instrument) . '.json?iss.meta=off&iss.only=marketdata&marketdata.columns=LAST'), true);
    $rows = $j['marketdata']['data'] ?? [];
    foreach ($rows as $row) if (isset($row[0]) && $row[0] !== null) return (float)$row[0];
    return null;
  } catch (Exception $e) { return null; }
}

/* ---- уведомление ---- */
function notify($pdo, $TG, $a) {
  $subject = 'Astro-Gann алерт: ' . $a['title'];
  $body = $a['title'] . "\n" . ($a['kind'] === 'price'
    ? ('Цена ' . $a['instrument'] . ' ' . $a['op'] . ' ' . $a['level'])
    : ('Астро-событие наступило: ' . date('Y-m-d H:i', (int)($a['fire_ts'] / 1000))));
  if ($a['channel'] === 'telegram' && $TG && !empty($a['tg_chat'])) tg_send($TG, $a['tg_chat'], '🔔 ' . $body);
  else if (!empty($a['email'])) @mail($a['email'], $subject, $body, 'From: no-reply@' . ($_SERVER['HTTP_HOST'] ?? 'lun-term'));
}

if ($TG) tg_link($pdo, $TG, $dir);

$alerts = $pdo->query("SELECT a.*, u.email, u.tg_chat FROM alerts a JOIN users u ON u.id = a.user_id WHERE a.status = 'active'")->fetchAll(PDO::FETCH_ASSOC);
$priceCache = []; $nowMs = time() * 1000; $fired = 0;
foreach ($alerts as $a) {
  $go = false;
  if ($a['kind'] === 'astro') { $go = ((int)$a['fire_ts'] > 0 && $nowMs >= (int)$a['fire_ts']); }
  else {
    $key = $a['provider'] . ':' . $a['instrument'];
    if (!array_key_exists($key, $priceCache)) $priceCache[$key] = current_price($a['provider'], $a['instrument']);
    $p = $priceCache[$key];
    if ($p !== null) $go = ($a['op'] === '>=' ? $p >= $a['level'] : $p <= $a['level']);
  }
  if ($go) {
    notify($pdo, $TG, $a); $fired++;
    if ($a['rpt']) $pdo->prepare('UPDATE alerts SET created = ? WHERE id = ?')->execute([time(), $a['id']]);
    else $pdo->prepare("UPDATE alerts SET status = 'fired' WHERE id = ?")->execute([$a['id']]);
  }
}
echo 'ok, checked ' . count($alerts) . ', fired ' . $fired;
