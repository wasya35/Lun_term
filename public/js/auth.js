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
  // доступ открыт только подтверждённому аккаунту (владелец — всегда admin/approved)
  const unlocked = () => !!(user && (user.approved === 1 || user.group === 'admin'));
  // спрятать/показать сам терминал (без аккаунта не показываем ничего)
  function setAppHidden(hide) {
    ['.menubar', '#sym-title', '#chart', '.statusbar'].forEach((sel) => { const e = document.querySelector(sel); if (e) e.style.visibility = hide ? 'hidden' : ''; });
  }
  // единая обработка ответа входа/регистрации: разблокировать или показать «ожидание»
  function onAuth(r) {
    user = r.user; csrf = r.csrf || csrf; render();
    if (unlocked()) { hideGate(); if (window.LUN_APPLY_WS) window.LUN_APPLY_WS(true); }
    else showPending();
  }
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
      if (user.group === 'admin') drop.appendChild(dItem('👥 Аккаунты (админ)', accountsModal, '#8fe0b8'));
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
      try { const r = await api(mode, { email, password }); bg.remove(); onAuth(r); }
      catch (e) { errEl.textContent = e.message; }
    };
  }

  /* ---- шлюз входа: без аккаунта терминал не показываем совсем ---- */
  let gateEl = null;
  function hideGate() { if (gateEl) { gateEl.remove(); gateEl = null; } setAppHidden(false); }
  function showPending() {
    hideGate(); setAppHidden(true);
    const bg = el('div', 'position:fixed;inset:0;background:#04070c;z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px');
    const m = el('div', 'background:#121722;border:1px solid #232b3a;border-radius:12px;max-width:400px;width:100%;color:#d7deea;box-shadow:0 12px 40px rgba(0,0,0,.6);padding:22px;text-align:center');
    m.innerHTML = `
      <div style="font-size:22px;font-weight:700;letter-spacing:.5px">AG-TS</div>
      <div style="color:#8b93a7;font-size:12px;margin:2px 0 16px">астро-ганновская торговая система · ag-ts.ru</div>
      <div style="font-size:15px;margin-bottom:6px">⏳ Аккаунт ожидает подтверждения</div>
      <div style="color:#8b93a7;font-size:13px;line-height:1.5">Доступ открывает владелец вручную. Ваш e-mail: <b>${(user && user.email) || ''}</b>.<br>Попробуйте войти позже или свяжитесь с администратором.</div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:16px">
        <button id="pg-refresh" style="background:#1f2b3d;color:#9cc7f0;border:1px solid #3aa0ff;border-radius:6px;padding:8px 14px;cursor:pointer">Проверить снова</button>
        <button id="pg-logout" style="background:#2a1720;color:#ef8a88;border:1px solid #5a2b33;border-radius:6px;padding:8px 14px;cursor:pointer">Выйти</button>
      </div>`;
    bg.appendChild(m); document.body.appendChild(bg); gateEl = bg;
    m.querySelector('#pg-refresh').onclick = async () => { try { const r = await api('me'); user = r.user; csrf = r.csrf || csrf; render(); if (unlocked()) { hideGate(); if (window.LUN_APPLY_WS) window.LUN_APPLY_WS(true); } } catch (e) {} };
    m.querySelector('#pg-logout').onclick = logout;
  }
  function showGate() {
    if (gateEl) { gateEl.style.display = 'flex'; return; }
    setAppHidden(true);
    const bg = el('div', 'position:fixed;inset:0;background:#04070c;z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px');
    const m = el('div', 'background:#121722;border:1px solid #232b3a;border-radius:12px;max-width:400px;width:100%;color:#d7deea;box-shadow:0 12px 40px rgba(0,0,0,.6);overflow:hidden');
    const inp = 'width:100%;background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:9px 10px;font-size:14px;margin-top:8px';
    const tab = (t, on) => `<button class="ga-tab" data-t="${t}" style="flex:1;background:${on ? '#1a2130' : 'transparent'};color:${on ? '#d7deea' : '#8b93a7'};border:0;border-bottom:2px solid ${on ? '#3aa0ff' : 'transparent'};padding:11px;cursor:pointer;font-size:14px">${t === 'login' ? 'Вход' : 'Регистрация'}</button>`;
    m.innerHTML = `
      <div style="padding:18px 18px 6px;text-align:center">
        <div style="font-size:22px;font-weight:700;letter-spacing:.5px">AG-TS</div>
        <div style="color:#8b93a7;font-size:12px;margin-top:2px">астро-ганновская торговая система · ag-ts.ru</div>
      </div>
      <div style="display:flex">${tab('login', true)}${tab('register', false)}</div>
      <div style="padding:16px 18px">
        <input id="ga-email" type="email" placeholder="e-mail" style="${inp}">
        <input id="ga-pass" type="password" placeholder="пароль (мин. 8)" style="${inp}">
        <div id="ga-err" style="color:#ef8a88;font-size:12px;min-height:16px;margin-top:8px"></div>
        <button id="ga-go" style="width:100%;background:#3aa0ff;color:#04121f;border:0;border-radius:6px;padding:10px;cursor:pointer;font-weight:600;font-size:14px;margin-top:6px">Войти</button>
        <p style="color:#6b7280;font-size:11px;margin:12px 0 0">Доступ к терминалу — только для зарегистрированных. Аккаунт хранит вашу разметку, индикаторы и настройки на сервере.</p>
      </div>`;
    bg.appendChild(m); document.body.appendChild(bg); gateEl = bg;
    let mode = 'login';
    const set = (t) => { mode = t; m.querySelectorAll('.ga-tab').forEach((x) => { const on = x.dataset.t === t; x.style.color = on ? '#d7deea' : '#8b93a7'; x.style.background = on ? '#1a2130' : 'transparent'; x.style.borderBottom = '2px solid ' + (on ? '#3aa0ff' : 'transparent'); }); m.querySelector('#ga-go').textContent = t === 'login' ? 'Войти' : 'Создать аккаунт'; };
    m.querySelectorAll('.ga-tab').forEach((x) => x.onclick = () => set(x.dataset.t));
    const go = async () => {
      const email = m.querySelector('#ga-email').value.trim(), password = m.querySelector('#ga-pass').value;
      const errEl = m.querySelector('#ga-err'); errEl.textContent = '';
      try { const r = await api(mode, { email, password }); if (mode === 'register') errEl.style.color = '#8fe0b8'; onAuth(r); }
      catch (e) { errEl.textContent = e.message; }
    };
    m.querySelector('#ga-go').onclick = go;
    m.querySelector('#ga-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    m.querySelector('#ga-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  async function saveSettings() {
    try { const s = JSON.parse(localStorage.getItem(SKEY) || 'null'); await api('save', { settings: s }); alert('Настройки сохранены в аккаунт.'); }
    catch (e) { alert('Не удалось сохранить: ' + e.message); }
  }
  async function loadSettings() {
    try { const r = await api('load'); if (!r.settings) { alert('В аккаунте пока нет сохранённых настроек.'); return; } localStorage.setItem(SKEY, JSON.stringify(r.settings)); if (confirm('Настройки загружены. Перезагрузить страницу, чтобы применить?')) location.reload(); }
    catch (e) { alert('Не удалось загрузить: ' + e.message); }
  }
  async function logout() { try { await api('logout', {}); } catch (e) {} user = null; render(); hideGate(); showGate(); }

  /* ---- админ: управление аккаунтами (только владелец/admin) ---- */
  async function accountsModal() {
    let data = { users: [] };
    try { data = await api('users_list'); } catch (e) { alert('Не удалось получить список: ' + e.message); return; }
    const bg = el('div', 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1500;display:flex;align-items:center;justify-content:center;padding:20px');
    const m = el('div', 'background:#121722;border:1px solid #232b3a;border-radius:10px;max-width:640px;width:100%;max-height:84vh;overflow:auto;color:#d7deea;box-shadow:0 12px 40px rgba(0,0,0,.55)');
    const rows = (data.users || []).map((u) => {
      const dt = u.created ? new Date(u.created * 1000).toLocaleDateString('ru-RU') : '';
      const badge = u.owner ? '<span style="color:#f0c040">владелец</span>' : (u.group === 'admin' ? '<span style="color:#8fe0b8">admin</span>' : u.group);
      const appr = u.approved ? '<span style="color:#26a69a">✓ доступ</span>' : '<span style="color:#e0a030">⏳ ждёт</span>';
      const actions = u.owner ? '' :
        `<button data-act="toggle" data-id="${u.id}" data-v="${u.approved ? 0 : 1}" style="background:${u.approved ? '#3a1a20' : '#123a2a'};color:${u.approved ? '#ef8a88' : '#8fe0b8'};border:1px solid ${u.approved ? '#5a2a30' : '#2a5a3a'};border-radius:5px;padding:3px 8px;cursor:pointer;font-size:12px">${u.approved ? 'Забрать' : 'Дать доступ'}</button>
         <button data-act="admin" data-id="${u.id}" data-v="${u.group === 'admin' ? 'free' : 'admin'}" style="background:#1f2b3d;color:#9cc7f0;border:1px solid #3aa0ff;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:12px">${u.group === 'admin' ? '− admin' : '+ admin'}</button>
         <button data-act="del" data-id="${u.id}" style="background:#2a1720;color:#ef8a88;border:1px solid #5a2b33;border-radius:5px;padding:3px 8px;cursor:pointer;font-size:12px">Удалить</button>`;
      return `<tr style="border-top:1px solid #1c2230"><td style="padding:6px 8px">${u.email}</td><td style="padding:6px 8px">${badge}</td><td style="padding:6px 8px">${appr}</td><td style="padding:6px 8px;color:#8b93a7">${dt}</td><td style="padding:6px 8px;white-space:nowrap;display:flex;gap:5px">${actions}</td></tr>`;
    }).join('');
    m.innerHTML = `<h2 style="margin:0;padding:12px 16px;border-bottom:1px solid #232b3a;font-size:15px;display:flex;justify-content:space-between;align-items:center">👥 Аккаунты<span class="x" style="cursor:pointer;font-size:20px;color:#8b93a7">×</span></h2>
      <div style="padding:8px 12px 14px">
        <p style="color:#8b93a7;font-size:12px;margin:6px 2px">Новые аккаунты закрыты, пока вы не дадите доступ. Контроль — на вашей стороне.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="color:#8b93a7;text-align:left"><th style="padding:4px 8px">E-mail</th><th style="padding:4px 8px">Роль</th><th style="padding:4px 8px">Статус</th><th style="padding:4px 8px">Создан</th><th style="padding:4px 8px"></th></tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    bg.appendChild(m); document.body.appendChild(bg);
    const close = () => bg.remove();
    m.querySelector('.x').onclick = close; bg.onclick = (e) => { if (e.target === bg) close(); };
    m.querySelectorAll('button[data-act]').forEach((b) => b.onclick = async () => {
      const id = +b.dataset.id, act = b.dataset.act;
      try {
        if (act === 'toggle') await api('user_set', { id, approved: +b.dataset.v });
        else if (act === 'admin') await api('user_set', { id, group: b.dataset.v });
        else if (act === 'del') { if (!confirm('Удалить аккаунт?')) return; await api('user_del', { id }); }
        close(); accountsModal();
      } catch (e) { alert('Ошибка: ' + e.message); }
    });
  }

  async function init() {
    mountButton();
    setAppHidden(true);                 // прячем терминал сразу — до проверки сессии
    try { const r = await api('me'); user = r.user; csrf = r.csrf || ''; render(); }
    catch (e) { /* нет PHP — вход невозможен, покажем шлюз с ошибкой при попытке */ }
    // Вход в сайт — только по подтверждённому аккаунту.
    if (unlocked()) { setAppHidden(false); if (window.LUN_APPLY_WS) window.LUN_APPLY_WS(); }
    else if (user) showPending();
    else showGate();
  }
  window.LunAuth = { init, get user() { return user; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
