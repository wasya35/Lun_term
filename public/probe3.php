<?php
/* probe3.php — проверяет СИСТЕМНЫЙ curl (как в SSH), а не PHP-cURL.
 * Открой: https://ag-ts.ru/probe3.php?t=CHANGE_ME_TOKEN · пришли вывод · удали файл.
 * Ключ НЕ нужен. */
header('Content-Type: text/plain; charset=utf-8');
const P3_TOKEN = 'CHANGE_ME_TOKEN';
if (($_GET['t'] ?? '') !== P3_TOKEN) { http_response_code(403); exit("forbidden: ?t=ТОКЕН\n"); }

echo "probe3 · " . date('Y-m-d H:i:s') . " · PHP " . PHP_VERSION . "\n" . str_repeat('=', 66) . "\n";

// какие функции запуска процессов доступны на хостинге
$disabled = array_map('trim', explode(',', (string)ini_get('disable_functions')));
$runner = null;
foreach (['shell_exec', 'exec', 'proc_open'] as $fn) {
  if (function_exists($fn) && !in_array($fn, $disabled, true)) { $runner = $fn; break; }
}
echo "disable_functions: " . (ini_get('disable_functions') ?: '(пусто)') . "\n";
echo "доступный запуск процессов: " . ($runner ?: 'НЕТ (shell_exec/exec/proc_open отключены)') . "\n";
echo str_repeat('-', 66) . "\n";

if (!$runner) {
  echo "Системный curl запустить нельзя (хостинг запретил exec).\n";
  echo "Тогда тест делаем по SSH — напиши мне, дам шаги.\n";
  exit;
}

function run_cmd($cmd, $runner) {
  if ($runner === 'shell_exec') return (string)shell_exec($cmd . ' 2>&1');
  if ($runner === 'exec')       { $out = []; @exec($cmd . ' 2>&1', $out); return implode("\n", $out); }
  // proc_open
  $d = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
  $p = @proc_open($cmd, $d, $pipes);
  if (!is_resource($p)) return '(proc_open не смог)';
  $o = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
  fclose($pipes[1]); fclose($pipes[2]); proc_close($p);
  return $o;
}

// есть ли вообще бинарник curl
echo "▶ версия системного curl:\n" . run_cmd('curl --version', $runner) . "\n" . str_repeat('-', 66) . "\n";

// сами проверки: код ответа + время + код завершения curl (28 = таймаут коннекта, 0 = ок)
$tests = [
  'GOOGLE (нейтраль)' => 'https://www.google.com',
  'MOEX iss'          => 'https://iss.moex.com/iss/engines.json',
  'MOEX apim'         => 'https://apim.moex.com/iss/engines.json',
];
foreach ($tests as $label => $url) {
  $cmd = 'curl -4 -sS -o /dev/null -w "http=%{http_code} time=%{time_total}s" --connect-timeout 10 ' . escapeshellarg($url);
  $out = run_cmd($cmd, $runner);
  echo "▶ $label\n  $url\n  $out\n\n";
}
echo str_repeat('=', 66) . "\nГотово. Пришли весь вывод, потом удали probe3.php\n";
