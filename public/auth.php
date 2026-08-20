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

out(['error' => 'unknown fn'], 400);
