/* =============================================================================
 *  auth.js — вход/регистрация и личные настройки (window.LunAuth)
 * =============================================================================
 *  Ходит на auth.php (тот же домен). Кнопка аккаунта — справа в меню.
 *  Вошедший пользователь может сохранить/загрузить свои настройки на сервер
 *  (то, что settings.js держит в localStorage 'lun_settings_v1').
 * ===========================================================================*/
(function () {
  const SKEY = 'lun_settings_v1';
  let user = null, csrf = '';
  const api = async (fn, body) => {
    const res = await fetch('auth.php?fn=' + fn, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json', 'X-CSRF': csrf } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let j = {}; try { j = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
    return j;
  };

  /* ---- UI ---- */
  function el(tag, css, html) { const e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }
  let btn = null, drop = null;
  function mountButton() {
    const bar = document.querySelector('.menubar'); if (!bar) return;
    const wrap = el('div', 'position:relative;margin-left:4px');
    btn = el('button', 'background:transparent;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px;white-space:nowrap');
    drop = el('div', 'display:none;position:absolute;top:100%;right:0;margin-top:4px;z-index:60;background:#121722;border:1px solid #232b3a;border-radius:8px;padding:6px;min-width:200px;box-shadow:0 10px 30px rgba(0,0,0,.5)');
    wrap.appendChild(btn); wrap.appendChild(drop); bar.appendChild(wrap);
    btn.onclick = (e) => { e.stopPropagation(); if (!user) { openModal(); return; } drop.style.display = drop.style.display === 'none' ? 'block' : 'none'; };
    document.addEventListener('click', () => { if (drop) drop.style.display = 'none'; });
    render();
  }
  const dItem = (label, onclick, color) => { const b = el('button', 'display:block;width:100%;text-align:left;background:transparent;color:' + (color || '#d7deea') + ';border:0;border-radius:6px;padding:7px 10px;cursor:pointer;font-size:13px', label); b.onmouseenter = () => b.style.background = '#1a2130'; b.onmouseleave = () => b.style.background = 'transparent'; b.onclick = (e) => { e.stopPropagation(); drop.style.display = 'none'; onclick(); }; return b; };
  function render() {
    if (!btn) return;
    btn.textContent = user ? ('👤 ' + user.email.split('@')[0] + (user.group !== 'free' ? ' · ' + user.group : '')) : '👤 Войти';
    drop.innerHTML = '';
    if (user) {
      drop.appendChild(el('div', 'padding:6px 10px;color:#8b93a7;font-size:11px;border-bottom:1px solid #232b3a;margin-bottom:4px', user.email + '<br>тариф: ' + user.group));
      drop.appendChild(dItem('💾 Сохранить настройки в аккаунт', saveSettings));
      drop.appendChild(dItem('📥 Загрузить настройки', loadSettings));
      drop.appendChild(dItem('🚪 Выйти', logout, '#ef8a88'));
    }
  }

  function openModal() {
    const bg = el('div', 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px');
    const m = el('div', 'background:#121722;border:1px solid #232b3a;border-radius:10px;max-width:380px;width:100%;color:#d7deea;box-shadow:0 12px 40px rgba(0,0,0,.55);overflow:hidden');
    const inp = 'width:100%;background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:8px 10px;font-size:14px;margin-top:6px';
    const tab = (t, on) => `<button class="au-tab" data-t="${t}" style="flex:1;background:${on ? '#1a2130' : 'transparent'};color:${on ? '#d7deea' : '#8b93a7'};border:0;border-bottom:2px solid ${on ? '#3aa0ff' : 'transparent'};padding:10px;cursor:pointer;font-size:14px">${t === 'login' ? 'Вход' : 'Регистрация'}</button>`;
    m.innerHTML = `<div style="display:flex">${tab('login', true)}${tab('register', false)}</div>
      <div style="padding:16px 18px">
        <input id="au-email" type="email" placeholder="e-mail" style="${inp}">
        <input id="au-pass" type="password" placeholder="пароль (мин. 8)" style="${inp}">
        <div id="au-err" style="color:#ef8a88;font-size:12px;min-height:16px;margin-top:8px"></div>
        <button id="au-go" style="width:100%;background:#3aa0ff;color:#04121f;border:0;border-radius:6px;padding:9px;cursor:pointer;font-weight:600;font-size:14px;margin-top:6px">Войти</button>
        <p style="color:#6b7280;font-size:11px;margin:10px 0 0">Аккаунт хранит ваши настройки (цвета, зоны, индикаторы) на сервере. Тарифы (расширенная история, алерты) — позже.</p>
      </div>`;
    bg.appendChild(m); document.body.appendChild(bg);
    bg.onclick = (e) => { if (e.target === bg) bg.remove(); };
    let mode = 'login';
    const set = (t) => { mode = t; m.querySelectorAll('.au-tab').forEach((x) => { const on = x.dataset.t === t; x.style.color = on ? '#d7deea' : '#8b93a7'; x.style.background = on ? '#1a2130' : 'transparent'; x.style.borderBottom = '2px solid ' + (on ? '#3aa0ff' : 'transparent'); }); m.querySelector('#au-go').textContent = t === 'login' ? 'Войти' : 'Создать аккаунт'; };
    m.querySelectorAll('.au-tab').forEach((x) => x.onclick = () => set(x.dataset.t));
    m.querySelector('#au-go').onclick = async () => {
      const email = m.querySelector('#au-email').value.trim(), password = m.querySelector('#au-pass').value;
      const errEl = m.querySelector('#au-err'); errEl.textContent = '';
      try { const r = await api(mode, { email, password }); user = r.user; csrf = r.csrf || csrf; render(); bg.remove(); if (window.LUN_APPLY_WS) window.LUN_APPLY_WS(); }
      catch (e) { errEl.textContent = e.message; }
    };
  }

  async function saveSettings() {
    try { const s = JSON.parse(localStorage.getItem(SKEY) || 'null'); await api('save', { settings: s }); alert('Настройки сохранены в аккаунт.'); }
    catch (e) { alert('Не удалось сохранить: ' + e.message); }
  }
  async function loadSettings() {
    try { const r = await api('load'); if (!r.settings) { alert('В аккаунте пока нет сохранённых настроек.'); return; } localStorage.setItem(SKEY, JSON.stringify(r.settings)); if (confirm('Настройки загружены. Перезагрузить страницу, чтобы применить?')) location.reload(); }
    catch (e) { alert('Не удалось загрузить: ' + e.message); }
  }
  async function logout() { try { await api('logout', {}); } catch (e) {} user = null; render(); }

  async function init() {
    mountButton();
    try { const r = await api('me'); user = r.user; csrf = r.csrf || ''; render(); }
    catch (e) { /* нет PHP — кнопка просто откроет форму, покажет ошибку */ }
    // восстановить рабочий стол: вошедшему — с сервера, иначе локальную копию
    // (разметка/индикаторы сохраняются между сессиями и без входа)
    if (window.LUN_APPLY_WS) window.LUN_APPLY_WS();
  }
  window.LunAuth = { init, get user() { return user; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
