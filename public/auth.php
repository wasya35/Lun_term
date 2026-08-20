<?php
/* =============================================================================
 *  auth.php — учётные записи (MVP): регистрация, вход, выход, профиль,
 *             сохранение/загрузка личных настроек. PHP + SQLite (PDO).
 * =============================================================================
 *  Требования хостинга: PHP 7.4+ с PDO SQLite (обычно включён), права на запись
 *  в папку lun_data/ рядом с этим файлом. БД и .htaccess-запрет создаются сами.
 *  Пароли — password_hash (bcrypt). Сессия — httponly + SameSite=Lax.
 *  Роли (group): 'free' по умолчанию, 'pro', 'admin' — задел под тарифы.
 *
 *  Эндпоинты (POST JSON, кроме me):
 *    auth.php?fn=register  {email, password}
 *    auth.php?fn=login     {email, password}
 *    auth.php?fn=logout
 *    auth.php?fn=me        -> {user|null, csrf}
 *    auth.php?fn=save      {settings}   (личные настройки, для вошедших)
 *    auth.php?fn=load      -> {settings}
 * ===========================================================================*/

header('Content-Type: application/json; charset=utf-8');

/* ---- сессия (httponly, SameSite=Lax) ---- */
session_set_cookie_params(['lifetime' => 60 * 60 * 24 * 30, 'httponly' => true, 'samesite' => 'Lax']);
session_start();

function out($data, $code = 200) { http_response_code($code); echo json_encode($data); exit; }
function body() { $j = json_decode(file_get_contents('php://input'), true); return is_array($j) ? $j : []; }

/* ---- защита от чужого источника для изменяющих запросов ---- */
function same_origin() {
  $o = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($o === '') return true;                    // прямые запросы/старые браузеры
  $oh = parse_url($o, PHP_URL_HOST);
  return $oh !== null && strcasecmp($oh, $_SERVER['HTTP_HOST'] ?? '') === 0;
}

/* ---- БД ---- */
function db() {
  static $pdo = null;
  if ($pdo) return $pdo;
  $dir = __DIR__ . '/lun_data';
  if (!is_dir($dir)) @mkdir($dir, 0770, true);
  if (!file_exists($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
  try {
    $pdo = new PDO('sqlite:' . $dir . '/users.db');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, grp TEXT NOT NULL DEFAULT "free", settings TEXT, created INTEGER)');
    @$pdo->exec('ALTER TABLE users ADD COLUMN tg_chat TEXT');   // привязка Telegram (может уже быть)
    @$pdo->exec('ALTER TABLE users ADD COLUMN tg_code TEXT');
    @$pdo->exec('ALTER TABLE users ADD COLUMN workspace TEXT');  // рабочий стол (последнее состояние)
    $pdo->exec('CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT, title TEXT, instrument TEXT, provider TEXT, op TEXT, level REAL, fire_ts INTEGER, channel TEXT, rpt INTEGER DEFAULT 0, status TEXT DEFAULT "active", created INTEGER)');
  } catch (Exception $e) { out(['error' => 'Хранилище недоступно: ' . $e->getMessage() . ' (нужен PDO SQLite и запись в lun_data/)'], 500); }
  return $pdo;
}

function public_user($row) { return $row ? ['id' => (int)$row['id'], 'email' => $row['email'], 'group' => $row['grp']] : null; }
function current_user() {
  if (empty($_SESSION['uid'])) return null;
  $st = db()->prepare('SELECT * FROM users WHERE id = ?'); $st->execute([$_SESSION['uid']]);
  return $st->fetch(PDO::FETCH_ASSOC) ?: null;
}
function csrf() { if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16)); return $_SESSION['csrf']; }

$fn = $_GET['fn'] ?? '';

if ($fn === 'me') { out(['user' => public_user(current_user()), 'csrf' => csrf()]); }

/* дальше — изменяющие запросы */
if (!same_origin()) out(['error' => 'origin'], 403);

if ($fn === 'register') {
  $b = body(); $email = strtolower(trim($b['email'] ?? '')); $pass = (string)($b['password'] ?? '');
  if (!filter_var($email, FILTER_VALIDATE_EMAIL)) out(['error' => 'Неверный e-mail'], 400);
  if (strlen($pass) < 8) out(['error' => 'Пароль минимум 8 символов'], 400);
  try {
    $st = db()->prepare('INSERT INTO users (email, pass, grp, created) VALUES (?,?,?,?)');
    $st->execute([$email, password_hash($pass, PASSWORD_DEFAULT), 'free', time()]);
  } catch (Exception $e) { out(['error' => 'Такой e-mail уже зарегистрирован'], 409); }
  $_SESSION['uid'] = (int)db()->lastInsertId();
  out(['user' => public_user(current_user()), 'csrf' => csrf()]);
}

if ($fn === 'login') {
  $b = body(); $email = strtolower(trim($b['email'] ?? '')); $pass = (string)($b['password'] ?? '');
  $st = db()->prepare('SELECT * FROM users WHERE email = ?'); $st->execute([$email]);
  $u = $st->fetch(PDO::FETCH_ASSOC);
  if (!$u || !password_verify($pass, $u['pass'])) out(['error' => 'Неверный e-mail или пароль'], 401);
  session_regenerate_id(true);
  $_SESSION['uid'] = (int)$u['id'];
  out(['user' => public_user($u), 'csrf' => csrf()]);
}

if ($fn === 'logout') { $_SESSION = []; session_destroy(); out(['ok' => true]); }

if ($fn === 'save') {
  $u = current_user(); if (!$u) out(['error' => 'Не авторизован'], 401);
  $b = body(); $s = json_encode($b['settings'] ?? null);
  if (strlen($s) > 200000) out(['error' => 'Слишком большой профиль'], 413);
  db()->prepare('UPDATE users SET settings = ? WHERE id = ?')->execute([$s, $u['id']]);
  out(['ok' => true]);
}

if ($fn === 'load') {
  $u = current_user(); if (!$u) out(['error' => 'Не авторизован'], 401);
  out(['settings' => $u['settings'] ? json_decode($u['settings'], true) : null]);
}

/* ---- рабочий стол (последнее состояние терминала) ---- */
if ($fn === 'ws_save') {
  $u = current_user(); if (!$u) out(['error' => 'Не авторизован'], 401);
  $s = json_encode(body()['ws'] ?? null);
  if (strlen($s) > 2000000) out(['error' => 'Слишком большой рабочий стол'], 413);
  db()->prepare('UPDATE users SET workspace = ? WHERE id = ?')->execute([$s, $u['id']]);
  out(['ok' => true]);
}
if ($fn === 'ws_load') {
  $u = current_user(); if (!$u) out(['ws' => null]);
  out(['ws' => $u['workspace'] ? json_decode($u['workspace'], true) : null]);
}

/* ---- Алерты ---- */
if ($fn === 'alert_add') {
  $u = current_user(); if (!$u) out(['error' => 'Войдите, чтобы ставить алерты'], 401);
  $b = body();
  $kind = ($b['kind'] ?? '') === 'astro' ? 'astro' : 'price';
  $st = db()->prepare('INSERT INTO alerts (user_id, kind, title, instrument, provider, op, level, fire_ts, channel, rpt, status, created) VALUES (?,?,?,?,?,?,?,?,?,?,"active",?)');
  $st->execute([$u['id'], $kind, substr((string)($b['title'] ?? ''), 0, 200), (string)($b['instrument'] ?? ''), (string)($b['provider'] ?? 'moex'),
    (($b['op'] ?? '') === '<=' ? '<=' : '>='), (float)($b['level'] ?? 0), (int)($b['fire_ts'] ?? 0),
    (($b['channel'] ?? 'email') === 'telegram' ? 'telegram' : 'email'), !empty($b['rpt']) ? 1 : 0, time()]);
  out(['ok' => true, 'id' => (int)db()->lastInsertId()]);
}
if ($fn === 'alert_list') {
  $u = current_user(); if (!$u) out(['alerts' => [], 'tg' => false]);
  $st = db()->prepare('SELECT * FROM alerts WHERE user_id = ? ORDER BY id DESC'); $st->execute([$u['id']]);
  out(['alerts' => $st->fetchAll(PDO::FETCH_ASSOC), 'tg' => !empty($u['tg_chat'])]);
}
if ($fn === 'alert_del') {
  $u = current_user(); if (!$u) out(['error' => 'Не авторизован'], 401);
  db()->prepare('DELETE FROM alerts WHERE id = ? AND user_id = ?')->execute([(int)(body()['id'] ?? 0), $u['id']]);
  out(['ok' => true]);
}
// код для привязки Telegram: пользователь отправляет /start <код> боту, cron ловит
if ($fn === 'tg_code') {
  $u = current_user(); if (!$u) out(['error' => 'Не авторизован'], 401);
  $code = $u['tg_code']; if (!$code) { $code = strtoupper(bin2hex(random_bytes(3))); db()->prepare('UPDATE users SET tg_code = ? WHERE id = ?')->execute([$code, $u['id']]); }
  out(['code' => $code, 'linked' => !empty($u['tg_chat'])]);
}

out(['error' => 'unknown fn'], 400);
