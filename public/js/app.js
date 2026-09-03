/* =============================================================================
 *  app.js — сборка терминала Lun_term
 * =============================================================================*/
(function () {
  const kc = window.klinecharts;

  const PERIOD_MS = { minute: 60000, hour: 3600000, day: 86400000 };
  const periodMillis = (tf) => (PERIOD_MS[tf.type] || 3600000) * tf.span;

  /* горячие клавиши: key(lower) -> fn. Регистрируем при сборке кнопок,
   * срабатывают, если не набираем текст и не открыта модалка. */
  const hotkeys = {};
  const regHotkey = (k, fn) => { if (k) hotkeys[k.toLowerCase()] = fn; };
  // канонический токен по ФИЗИЧЕСКОЙ клавише (e.code) — работает на любой
  // раскладке (рус/eng): KeyL->'l', Digit1->'1', Equal->'=', Minus->'-'.
  function keyFromEvent(e) {
    const c = e.code || '';
    if (c.indexOf('Key') === 0) return c.slice(3).toLowerCase();
    if (c.indexOf('Digit') === 0) return c.slice(5);
    if (c.indexOf('Numpad') === 0) { const n = c.slice(6); if (n === 'Add') return '+'; if (n === 'Subtract') return '-'; if (/^\d$/.test(n)) return n; }
    if (c === 'Equal') return '=';
    if (c === 'Minus') return '-';
    if (c === 'Backquote') return '`';       // тильда/ё — левее «1»
    if (c === 'Space') return 'space';
    if (c === 'Tab') return 'tab';
    return (e.key || '').toLowerCase();
  }

  function closeMenus() { document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); }

  // простая модалка (класс lun-modal-bg — чтобы хоткеи глушились, пока открыта)
  function openModal(title, html) {
    const bg = document.createElement('div'); bg.className = 'lun-modal-bg';
    bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
    const m = document.createElement('div');
    m.style.cssText = 'background:#121722;border:1px solid #232b3a;border-radius:10px;max-width:760px;width:100%;max-height:84vh;overflow:auto;color:#d7deea;box-shadow:0 12px 40px rgba(0,0,0,.55)';
    m.innerHTML = '<h2 style="margin:0;padding:12px 16px;border-bottom:1px solid #232b3a;font-size:15px;display:flex;justify-content:space-between;align-items:center">' + title + '<span class="x" style="cursor:pointer;font-size:20px;color:#8b93a7">×</span></h2><div style="padding:14px 18px;font-size:13px;line-height:1.55">' + html + '</div>';
    bg.appendChild(m); document.body.appendChild(bg);
    const close = () => bg.remove();
    m.querySelector('.x').onclick = close; bg.onclick = (e) => { if (e.target === bg) close(); };
  }
  // Справочник: список статей по инструментам (window.LUN_HELP)
  function helpArticlesModal(openId) {
    const arts = window.LUN_HELP || [];
    if (!arts.length) { openModal('Справочник', '<p>Справочник не загрузился.</p>'); return; }
    const cats = []; arts.forEach((a) => { if (cats.indexOf(a.cat) < 0) cats.push(a.cat); });
    const listHtml = cats.map((c) => '<div class="hlp-sub">' + c + '</div>' + arts.filter((a) => a.cat === c).map((a) => `<button class="hlp-item" data-id="${a.id}">${a.title}</button>`).join('')).join('');
    openModal('📖 Справочник', `
      <style>
        .hlp-wrap{display:flex;gap:14px}
        .hlp-list{flex:0 0 240px;max-height:64vh;overflow:auto;border-right:1px solid #232b3a;padding-right:8px}
        .hlp-sub{color:#8b93a7;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:10px 4px 3px}
        .hlp-item{display:block;width:100%;text-align:left;background:transparent;color:#d7deea;border:0;border-radius:6px;padding:6px 8px;cursor:pointer;font-size:13px}
        .hlp-item:hover,.hlp-item.active{background:#1a2130}
        .hlp-body{flex:1;max-height:64vh;overflow:auto;line-height:1.6}
        .hlp-body h4{color:#3aa0ff;margin:12px 0 3px;font-size:13px}
        .hlp-body p{margin:5px 0}
        @media(max-width:700px){.hlp-wrap{flex-direction:column}.hlp-list{flex:none;border-right:0;border-bottom:1px solid #232b3a;padding-right:0;max-height:none}}
      </style>
      <div class="hlp-wrap"><div class="hlp-list">${listHtml}</div><div class="hlp-body" id="hlp-body"></div></div>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    const show = (id) => {
      const a = arts.find((x) => x.id === id) || arts[0];
      bg.querySelector('#hlp-body').innerHTML = '<h3 style="margin:2px 0 8px;font-size:15px">' + a.title + '</h3>' + a.body
        + '<p style="color:#6b7280;font-size:11px;margin-top:14px;border-top:1px solid #232b3a;padding-top:8px">Исследовательский материал. Терминал не обещает доход — даёт данные и методы для проверки.</p>';
      bg.querySelectorAll('.hlp-item').forEach((b) => b.classList.toggle('active', b.dataset.id === a.id));
    };
    bg.querySelectorAll('.hlp-item').forEach((b) => { b.onclick = () => show(b.dataset.id); });
    show(openId || arts[0].id);
  }
  function helpModal() {
    const h = (t) => `<h3 style="margin:14px 0 4px;color:#3aa0ff;font-size:13px">${t}</h3>`;
    openModal('Справка — как работают инструменты', `
      <p><b>Lun_term</b> — исследовательский астро-трейдинг терминал. Данные MOEX ISS / крипта Bybit / США Yahoo прямо из браузера. Меню сверху: Инструменты · ТФ · Период (глубина истории) · Индикаторы · Рисование · Ганн · Коннекторы (реалтайм) · Настройки · Экраны (мультичарт).</p>

      ${h('🌙 Астро')}
      <p><b>Луна в знаках</b> (Астро → ☾ Луна в знаках) — верхняя лента: цвет по знаку зодиака, текущий градус. Тумблер показать/скрыть.</p>
      <p><b>Циклы (1…6)</b> — торговые зоны лонг/шорт по долготе тела (Луна/Солнце/…). Зоны и цвета правятся в ⚙ Настройках (долгота 0°=Овен).</p>
      <p><b>Аспекты к Солнцу</b> — полоса на планету (☉/☿ по умолч.), Луна = фазы (соединение=новолуние, оппозиция=полнолуние). Цвета аспектов — в Настройках (соед. оранж, квадрат красн, оппоз. фиол, трин зелён, 60° голуб). Орб 2–6°.</p>
      <p><b>Узлы ☾</b> — ингрессии (0°) и середины (15°) знаков Луны на цене. <b>Прогноз</b> (F) — продлевает астро-полосы вправо до ближайшего аспекта ☉–♅.</p>

      ${h('📐 Ганн')}
      <p><b>Геометрия</b> (2 клика — угол→охват): <b>Gann Box / Квадрат</b> (единая форма — рамка с делениями 1/8·1/3·1/2 или сетка N×N: 8 = квадрат, 12 = «144»). <b>Линия Ганна</b> — луч из т1 через т2; в свойствах объекта можно задать точный <b>угол</b> (цена/бар) от закреплённой т1.</p>
      <p><b>Квадраты (калькулятор)</b> — уровни поддержки/сопротивления по √-спирали: база 9 (крест 45°), шестиугольник (60°), круг 360° (15°), натуральные. «Нанести на график» — рисует уровни.</p>
      <p><b>Уровни/циклы</b>: ретрейсменты 1/8·1/3·1/2; <b>мастер-циклы</b> — вертикали 30·45·60·90·144·180·360 баров от пивота (клик = пивот на любой экстремум, можно двигать). <b>Сквоузинг 1×1</b> — линии баланса цены и времени.</p>
      <p><b>Астро-Ганн</b>: планетарные линии→цена (долгота как ценовой уровень), ингрессии, ретроградности, веер долготы, Sq9 в градусах планет, затмения, космограмма (колесо на дату).</p>
      <p><b>Прогностика</b>: <b>Астро-фит</b> (какие астро-события совпадают с разворотами — lift/z), <b>прогноз циклов</b> (спектр цены вперёд), <b>композит</b> (среднее движение по фазе/знаку), <b>Астро-факторы на экстремумах</b> (взвешенные астро-факторы на вершинах/основаниях волны), <b>Барометр аспектов</b> (сидерограф).</p>

      ${h('📊 Открытый интерес и поток')}
      <p><b>ОИ физ/юр</b> — открытый интерес и чистые позиции физиков/юриков (MOEX FUTOI, дневной). Красные/зелёные вертикали = экстремальный ΔОИ по порогам (Si: 5k·40k·100k). Точки на юриках = COT-экстремумы (контр-сигнал). <b>Базис к споту</b> — фьюч − спот исходного товара (регрессией) + z. <b>Арбитраж</b> (Инструменты) — синтетика/спред + z.</p>

      ${h('🔬 Бэктест и исследование')}
      <p><b>Исследование сигналов</b> (Настройки) — выбираемый бэктест на текущих данных: объём ≥2×/3×, EMA-пересечения, RSI, пробой, лунные зоны, фейд по астро/Sq9. Метрики: win%, средняя доходность, t-стат; <b>издержки %/сделку</b> и <b>out-of-sample</b> (посл. ⅓ с меткой устойчивости ✓/✗). win>55% и |t|≥2 при ≥30 входах = перевес, иначе шум.</p>
      <p><b>Бэктест</b> (B) — сверка лунных зон/аспектов, сила+поглощение с издержками и OOS, марковские режимы, синтез «зона×режим».</p>

      ${h('✏️ Рисование и прочее')}
      <p>Уровень, трендовая, прямоугольник, стрелка, текст, луч ⨯N (обрезка по пересечениям), профиль объёма. У каждого объекта — панель свойств (цвет/толщина/тип линии/заливка/🔒 замок). <b>Новости</b> (Настройки → 📰) — правая колонка по исходному товару с сентимент-метками. <b>Коннекторы</b> — реалтайм (крипта — настоящий, MOEX/США — опрос).</p>

      <p style="color:#8b93a7;margin-top:12px">Важно: все статистики — <b>исследовательские</b>. Малые выборки честно помечаются; астро/Ганн-гипотезы проверяйте бэктестом с издержками и OOS, а не на веру. Данные MOEX — с задержкой ~15 мин.</p>`);
  }
  function guideModal() {
    const h = (t) => `<h3 style="margin:16px 0 6px;color:#3aa0ff;font-size:14px">${t}</h3>`;
    const step = (rows) => '<ol style="margin:4px 0 0;padding-left:18px">' + rows.map((r) => `<li style="margin:3px 0">${r}</li>`).join('') + '</ol>';
    openModal('📚 Как пользоваться — Астро · Ганн · Бэктест', `
      <p style="color:#8b93a7;margin-top:0">Три рабочих блока. Общий принцип: <b>гипотеза → проверка бэктестом с издержками и out-of-sample → только потом доверие</b>. Малая выборка — не сигнал.</p>

      ${h('🌙 Астро — как пользоваться')}
      ${step([
        '<b>Луна в знаках</b> (Астро → ☾ Луна в знаках) — верхняя лента. Цвет = знак, цифра = градус. Смена знака Луны ≈ смена краткосрочного настроения; включай/выключай тумблером.',
        '<b>Циклы-зоны</b> (Астро → Циклы 1…6): зелёная зона = склонность к лонгу, красная = к шорту. Это <b>фон-фильтр направления</b>, а не вход. Долготы/цвета зон правишь в ⚙ Настройки.',
        '<b>Аспекты к Солнцу</b> (Астро → планета): жёсткие (□90°/☍180°) = коррекция/разворот, мягкие (⚹60°/△120°) = продолжение. Орб 2–6°, цвета — в Настройках.',
        '<b>Прогноз</b> (F) — продлевает полосы вправо до ближайшего аспекта ☉–♅: видно, где ждать следующего астро-события.',
        '<b>Проверка</b>: прежде чем верить — прогони «Астро-фит» и «Исследование сигналов» на этом инструменте.',
      ])}

      ${h('📐 Ганн — как пользоваться')}
      ${step([
        '<b>Линия Ганна</b> (Рисование → Ган 1×1): 2 клика — т1 (опора) и т2 (направление). Точный угол: выдели линию → в панели свойств поле <b>∠</b> (цена на 1 бар); т1 закреплена.',
        '<b>Gann Box / Квадрат</b> (Ганн → Геометрия): выбери Box (деления по осям) или сетку N×N (8 = квадрат, 12 = «144»), затем 2 клика — угол → охват. Линии деления = потенциальные уровни цены/времени.',
        '<b>Калькулятор квадратов</b> (Ганн → Квадраты): введи цену-пивот, база 9/шестиугольник/360/натуральные → таблица уровней S/R, «Нанести на график».',
        '<b>Мастер-циклы</b> (Ганн → Уровни/циклы → клик-пивот): поставь пивот на важный экстремум истории (можно перетаскивать). Вертикали 30·60·90·144·180·360 = кандидаты на разворот по времени.',
        '<b>Астро-Ганн</b>: планетарные линии→цена, Sq9 в градусах планет, веер долготы, затмения, барометр аспектов — читаются вместе с астро-фитом.',
      ])}

      ${h('🔬 Бэктест и исследование — как пользоваться')}
      ${step([
        '<b>Исследование сигналов</b> (Настройки → 🔬): отметь сигналы (объём ≥2×, EMA, RSI, пробой, лунные зоны, фейд по астро/Sq9), задай горизонты и <b>издержки %/сделку</b>, включи <b>out-of-sample</b>. Читай: <b>win>55% и |t|≥2 при ≥30 входах</b> = перевес; <b>✓</b> при OOS = устойчиво на новых данных. Остальное — шум.',
        '<b>Астро-фит</b> (Ганн → Прогностика): какие астро-события совпадают с разворотами инструмента (lift/z). Кнопка 📍 — вынести событие на график.',
        '<b>Астро-факторы на экстремумах</b> (там же): взвешенные астро-факторы на вершинах/основаниях волны (по фильтрованной волне).',
        '<b>Бэктест</b> (B) — лунные зоны/аспекты, сила+поглощение, Марков, синтез «зона×режим».',
        '<b>Методика</b>: бери <b>D1, 2–3 года</b> (меню 🗓 Период), проверяй с издержками и OOS. Перевес считается только если он <b>устойчив вне выборки</b>.',
      ])}

      <p style="color:#8b93a7;margin-top:14px">Всё — исследовательские метрики, не гарантии. Астрология/Ганн здесь — <b>гипотезы для проверки</b>, а не догма.</p>`);
  }
  function hotkeysModal() {
    const row = (k, d) => `<tr><td style="padding:3px 12px 3px 0;color:#3aa0ff;white-space:nowrap"><b>${k}</b></td><td style="padding:3px 0">${d}</td></tr>`;
    openModal('Горячие клавиши', `
      <p style="color:#8b93a7;margin-top:0">Работают на русской и английской раскладке (по физической клавише).</p>
      <table style="border-collapse:collapse">
        ${row('1 · 2 · 3 · 4', 'таймфрейм M5 / M15 / H1 / D1')}
        ${row('+ / −', 'приблизить / отдалить график')}
        ${row('T', 'уровень')}${row('L', 'трендовая')}${row('R', 'прямоугольник')}
        ${row('A', 'стрелка')}${row('X', 'текст')}${row('G', 'линия Ганна')}
        ${row('H', 'горизонтальный луч ⨯N')}${row('D', 'профиль объёма (гор. объём)')}
        ${row('клик', 'выделить объект')}${row('Delete', 'удалить выделенный объект')}
        ${row('Ctrl+C / Ctrl+V', 'копировать / вставить объект')}
        ${row('Ctrl+перетаскивание', 'копия объекта на новое место')}
        ${row('Ctrl+S', 'скрин графика (PNG)')}
        ${row('F', 'прогноз шкал вперёд')}${row('M', 'марковский режим')}
        ${row('U', 'аспекты Урана ко всем')}
        ${row('S', 'настройки')}${row('B', 'бэктест')}
        ${row('W', 'симуляция (реплей) вкл/выкл')}${row('K', 'играть / пауза')}
        ${row('N', 'реплей: +1 бар')}${row('J', 'реплей: +10 баров')}
      </table>`);
  }

  // Правила / конфиденциальность / отказ от ответственности.
  function legalModal() {
    const h = (t) => `<h3 style="margin:16px 0 4px;color:#3aa0ff;font-size:13px">${t}</h3>`;
    const site = (location && location.host) ? location.host : 'этот сайт';
    openModal('📜 Правила, конфиденциальность и отказ от ответственности', `
      <p style="margin-top:0"><b>Коротко:</b> Lun_term — это <b>исследовательский инструмент</b>. Мы даём данные и методы для самостоятельного анализа рынка. Мы <b>не даём инвестиционных рекомендаций и не обещаем никакого дохода</b>. Все решения и их последствия — только ваши.</p>

      ${h('1. Отказ от ответственности')}
      <ul style="margin:4px 0;padding-left:18px;line-height:1.6">
        <li>Материалы сайта (графики, индикаторы, астро- и Ганн-инструменты, статистика, бэктесты, сигналы, новости) носят <b>информационно-образовательный и исследовательский характер</b> и <b>не являются</b> индивидуальной инвестиционной рекомендацией, офертой, призывом покупать/продавать или гарантией результата.</li>
        <li>Мы <b>не обещаем и не гарантируем прибыль</b>. Торговля на финансовых рынках и производных инструментах сопряжена с <b>высоким риском и возможностью потерять весь капитал</b>. Прошлые результаты не определяют будущие.</li>
        <li>Астрологические, циклические и статистические методы носят <b>гипотетический, экспериментальный</b> характер, их эффективность научно не доказана. Малые выборки помечаются; проверяйте гипотезы сами.</li>
        <li>Данные могут содержать ошибки, задержки и пропуски. Сервис предоставляется «<b>как есть</b>» (as is), без гарантий точности, полноты и бесперебойной работы.</li>
        <li>Администрация <b>не несёт ответственности</b> за любые прямые или косвенные убытки, возникшие в связи с использованием сайта. Используя сайт, вы принимаете эти условия и действуете на свой страх и риск.</li>
        <li>Сайт <b>не является</b> брокером, дилером, доверительным управляющим или инвестиционным советником; не управляет вашими средствами и не имеет к ним доступа.</li>
      </ul>

      ${h('2. Источники данных')}
      <p style="margin:4px 0;line-height:1.6">Рыночные данные поступают из внешних источников (MOEX ISS, Bybit, Yahoo Finance) и принадлежат их правообладателям; показываются для личного ознакомления, возможны задержки. Новости — это заголовки со ссылкой на первоисточник (СМИ), права на статьи принадлежат их изданиям. Астрономические расчёты — по открытым эфемеридам.</p>

      ${h('3. Конфиденциальность')}
      <ul style="margin:4px 0;padding-left:18px;line-height:1.6">
        <li><b>Без аккаунта</b> сайт работает полностью; ваши настройки и разметка хранятся <b>локально в браузере</b> (localStorage) и никуда не отправляются.</li>
        <li><b>С аккаунтом</b> (по желанию) на нашем сервере хранятся: e-mail, пароль (в виде необратимого хэша), ваши настройки/рабочий стол и алерты. Пароли в открытом виде <b>не хранятся</b>.</li>
        <li>Для алертов по желанию вы указываете e-mail или привязываете Telegram (храним chat id) — только чтобы прислать уведомление.</li>
        <li>Мы <b>не продаём и не передаём</b> ваши данные третьим лицам и не используем их вне работы сервиса. Реклама/аналитика, если появятся, будут отмечены отдельно.</li>
        <li>Данные хранятся, пока существует аккаунт. Удаление аккаунта и данных — по запросу (см. «Контакты»).</li>
        <li>Используются технические cookie/localStorage, необходимые для работы (сессия, сохранение состояния). Без них часть функций недоступна.</li>
      </ul>

      ${h('4. Условия использования')}
      <ul style="margin:4px 0;padding-left:18px;line-height:1.6">
        <li>Сервис для лиц <b>18+</b>. Используя ${site}, вы подтверждаете, что осознаёте риски рынка и принимаете эти правила.</li>
        <li>Запрещены: автоматический массовый сбор данных (парсинг/скрейпинг), чрезмерная нагрузка, обход ограничений и попытки навредить сервису или другим пользователям.</li>
        <li>Условия могут обновляться; действует редакция, размещённая на сайте.</li>
      </ul>

      ${h('5. Контакты')}
      <p style="margin:4px 0;line-height:1.6">По вопросам конфиденциальности, удаления данных и работы сервиса — через форму обратной связи/почту, указанную на сайте.</p>

      <p style="margin-top:14px"><a href="/pravila.html" target="_blank" style="color:#3aa0ff">Открыть отдельной страницей ↗</a> — прямая ссылка (для рекламных площадок и модерации).</p>
      <p style="color:#6b7280;font-size:11px;margin-top:6px">Документ носит информационный характер и не заменяет юридическую консультацию. Редакция от текущей даты.</p>`);
  }

  const DEFAULT_TF = window.LUN.TIMEFRAMES.find((t) => t.id === window.LUN.DEFAULT_TIMEFRAME);
  // Каждая ячейка сетки — независимый слот со своей копией структуры. `state`
  // всегда указывает на АКТИВНЫЙ слот, поэтому весь тулбар работает как раньше.
  function makeSlot(i) {
    return {
      slotId: i, chart: null, cellEl: null, loader: null,
      instrument: window.LUN.INSTRUMENTS[0], tf: DEFAULT_TF,
      signPane: null, signPanes: {}, volumePane: null, aspectPanes: {}, allAspectPane: null,
      deltaPane: null, cyclePanes: {}, uranusPane: null, markovPanes: null, markovTimer: null,
      overlayIds: {}, candleInds: {}, selectedOverlayId: null, selectedOverlay: null, forecastOn: false, paneWish: {},
      compareInstrument: null, comparePane: false, oiPane: null, arbPane: null, arbBundle: null,
      retroPane: null, bradleyPane: null, basisPane: null, drawings: {},
    };
  }
  let slots = [];
  let activeIdx = 0;
  let state = makeSlot(0);   // переустанавливается при активации ячейки
  let autoConnect = false;           // авто-коннектор: поток под рынок инструмента
  const connBtns = {};               // кнопки коннекторов по имени
  let autoConnBtn = null;
  function applyAutoConnect() {
    if (!autoConnect || !window.LunStream) return;
    const conn = window.LunStream.connFor(state.instrument.provider || 'moex');
    if (!conn) return;
    if (window.LunStream.enabled && window.LunStream.enabled[conn]) return;   // уже включён
    window.LunStream.setConnector(conn, true, slots);
    const b = connBtns[conn]; if (b) b.classList.add('active');
  }

  const THEME = {
    grid: { horizontal: { color: '#1c2230' }, vertical: { color: '#1c2230' } },
    candle: {
      bar: {
        upColor: '#26a69a', downColor: '#ef5350',
        upBorderColor: '#26a69a', downBorderColor: '#ef5350',
        upWuckColor: '#26a69a', downWuckColor: '#ef5350',
      },
      priceMark: { last: { text: { color: '#0b0e14' } } },
    },
    xAxis: { axisLine: { color: '#2a3242' }, tickText: { color: '#8b93a7' } },
    yAxis: { axisLine: { color: '#2a3242' }, tickText: { color: '#8b93a7' } },
    crosshair: {
      horizontal: { line: { color: '#6b7280' }, text: { backgroundColor: '#334155' } },
      vertical: { line: { color: '#6b7280' }, text: { backgroundColor: '#334155' } },
    },
  };
  // светлая тема графика (chrome — через CSS class body.light)
  const THEME_LIGHT = {
    grid: { horizontal: { color: '#e7e9f0' }, vertical: { color: '#e7e9f0' } },
    candle: { bar: { upColor: '#1a9e8f', downColor: '#e5484d', upBorderColor: '#1a9e8f', downBorderColor: '#e5484d', upWuckColor: '#1a9e8f', downWuckColor: '#e5484d' }, priceMark: { last: { text: { color: '#ffffff' } } } },
    xAxis: { axisLine: { color: '#c8ccd6' }, tickText: { color: '#5b6270' } },
    yAxis: { axisLine: { color: '#c8ccd6' }, tickText: { color: '#5b6270' } },
    crosshair: { horizontal: { line: { color: '#9aa0ad' }, text: { backgroundColor: '#5b6270' } }, vertical: { line: { color: '#9aa0ad' }, text: { backgroundColor: '#5b6270' } } },
  };
  // внешний вид: тема (dark/light) + тип свечей (candle_solid/ohlc=бары)
  let LOOK = { theme: 'dark', candle: 'candle_solid' };
  try { const s = JSON.parse(localStorage.getItem('lun_look') || 'null'); if (s) LOOK = Object.assign(LOOK, s); } catch (e) {}
  function applyChartLook() {
    document.body.classList.toggle('light', LOOK.theme === 'light');
    const base = LOOK.theme === 'light' ? THEME_LIGHT : THEME;
    const styles = Object.assign({}, base, { candle: Object.assign({}, base.candle, { type: LOOK.candle }) });
    slots.forEach((s) => { try { s.chart.setStyles(styles); } catch (e) {} });
    try { localStorage.setItem('lun_look', JSON.stringify(LOOK)); } catch (e) {}
    if (typeof scheduleWsSave === 'function') scheduleWsSave();
  }
  function setTheme(t) { LOOK.theme = t; applyChartLook(); }
  function setCandleType(c) { LOOK.candle = c; applyChartLook(); }
  // единое окно оформления: тема · тип свечей · коннекторы · горизонт прогноза
  function appearanceModal() {
    const cur = LOOK;
    const on = (n) => { try { return window.LunStream ? window.LunStream.isOn(n) : true; } catch (e) { return true; } };
    const ss = 'background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:4px 8px';
    openModal('🎨 Оформление, коннекторы, прогноз', `
      <div style="display:flex;flex-direction:column;gap:16px;font-size:14px">
        <div><b>Тема</b><br>
          <label><input type="radio" name="ap-th" value="dark"${cur.theme !== 'light' ? ' checked' : ''}> тёмная</label>
          <label style="margin-left:16px"><input type="radio" name="ap-th" value="light"${cur.theme === 'light' ? ' checked' : ''}> светлая</label></div>
        <div><b>Тип свечей</b><br>
          <label><input type="radio" name="ap-cd" value="candle_solid"${cur.candle !== 'ohlc' ? ' checked' : ''}> свечи</label>
          <label style="margin-left:16px"><input type="radio" name="ap-cd" value="ohlc"${cur.candle === 'ohlc' ? ' checked' : ''}> бары (OHLC)</label></div>
        <div><b>Коннекторы (реалтайм)</b> <span style="color:#8b93a7;font-size:11px">— все вкл по умолчанию, цена всегда движется</span><br>
          <label><input type="checkbox" id="ap-crypto"${on('crypto') ? ' checked' : ''}> Крипта · Bybit (WebSocket, настоящий поток)</label><br>
          <label><input type="checkbox" id="ap-us"${on('us') ? ' checked' : ''}> Америка · Yahoo (опрос ~15–30с)</label><br>
          <label><input type="checkbox" id="ap-moex"${on('moex') ? ' checked' : ''}> MOEX · псевдо (опрос; истинный realtime у биржи платный)</label><br>
          <button id="ap-apply" style="margin-top:8px;background:#1e2636;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:6px 14px;cursor:pointer">Применить</button>
          <span id="ap-applied" style="color:#26a69a;font-size:11px;margin-left:8px"></span></div>
        <div><b>Прогноз вперёд</b><br>
          <select id="ap-fc" style="${ss}"><option value="1">1 квартал</option><option value="2">2 квартала</option></select>
          <span style="color:#8b93a7;font-size:11px">на сколько продлевать поле кнопкой «🔮 Прогноз» (в Астро)</span></div>
      </div>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    bg.querySelectorAll('[name=ap-th]').forEach((r) => r.onchange = () => { if (r.checked) setTheme(r.value); });
    bg.querySelectorAll('[name=ap-cd]').forEach((r) => r.onchange = () => { if (r.checked) setCandleType(r.value); });
    const cw = (id, name) => { const el = bg.querySelector(id); el.onchange = () => { if (window.LunStream) window.LunStream.setConnector(name, el.checked, slots); }; };
    cw('#ap-crypto', 'crypto'); cw('#ap-us', 'us'); cw('#ap-moex', 'moex');
    // «Применить» — форсировать переподписку всех коннекторов по галочкам
    const applyBtn = bg.querySelector('#ap-apply'), appliedMsg = bg.querySelector('#ap-applied');
    if (applyBtn) applyBtn.onclick = () => {
      if (!window.LunStream) return;
      [['#ap-crypto', 'crypto'], ['#ap-us', 'us'], ['#ap-moex', 'moex']].forEach(([id, name]) => {
        const el = bg.querySelector(id); if (el) window.LunStream.setConnector(name, el.checked, slots);
      });
      if (appliedMsg) { appliedMsg.textContent = '✓ применено'; setTimeout(() => { if (appliedMsg) appliedMsg.textContent = ''; }, 2000); }
    };
    const fc = bg.querySelector('#ap-fc'); fc.value = String((window.LUN.FORECAST && window.LUN.FORECAST.quarters) || 1);
    fc.onchange = () => { window.LUN.FORECAST.quarters = +fc.value; if (state.forecastOn) setForecast(true); };
  }

  /* ---------- панели ----------
   * KLineChart раскладывает новую панель асинхронно, поэтому setPaneOptions
   * сразу после createIndicator не срабатывает — копим параметры и применяем
   * их отложенно (и повторно после загрузки данных). */
  function applyPaneWishes(slot) {
    slot = slot || state; if (!slot || !slot.chart) return;
    Object.entries(slot.paneWish).forEach(([pid, o]) => {
      try { slot.chart.setPaneOptions({ id: pid, ...o }); } catch (e) { /* панель ещё не готова */ }
    });
  }
  // Загрузка данных пересобирает раскладку — применяем размеры на нескольких
  // тиках, привязываясь к КОНКРЕТНОМУ слоту (важно для нескольких графиков).
  function scheduleApply(slot) { slot = slot || state; [0, 150, 400].forEach((ms) => setTimeout(() => applyPaneWishes(slot), ms)); }
  function wishPane(id, opts) { if (id && state) { state.paneWish[id] = opts; scheduleApply(state); } }

  // ВАЖНО: createIndicator возвращает id индикатора, а НЕ id панели. Поэтому
  // задаём paneId явно — тогда мы знаем панель и можем управлять её высотой.
  function createCyclePane(cycle, order) {
    const paneId = 'pane_' + cycle.id;
    state.chart.createIndicator(
      { name: 'CycleStrip', shortName: cycle.title, extendData: { cycle }, paneId }, false);
    state.cyclePanes[cycle.id] = paneId;
    wishPane(paneId, { height: window.LUN.PANE_HEIGHTS.cycle, minHeight: 18, order });
    return paneId;
  }

  const BODY_LABEL = { Moon: '☾ Луна', Mercury: '☿ Меркурий', Sun: '☉ Солнце', Venus: '♀ Венера', Mars: '♂ Марс', Jupiter: '♃ Юпитер', Saturn: '♄ Сатурн' };
  function createSignPane(body, order) {
    const id = 'pane_sign_' + body;
    state.chart.createIndicator({ name: 'SignStrip', paneId: id, shortName: BODY_LABEL[body] || body, extendData: { body, frame: 'geo' } }, false);
    state.signPanes[body] = id;
    wishPane(id, { height: window.LUN.PANE_HEIGHTS.moonSign, minHeight: 24, order });
    return id;
  }

  // --- аспекты планета→Солнце (по полосе на планету) + сводная «все» ---
  const clampOrb = () => Math.min(6, Math.max(2, +window.LUN.ASPECTS.orb || 3));
  function createSunAspect(pl, order) {
    const id = 'pane_asp_' + pl.body;
    state.chart.createIndicator({
      name: 'AspectStrip', paneId: id, shortName: '☉/' + pl.glyph,
      extendData: { bodyA: 'Sun', bodyB: pl.body, frame: pl.frame, orb: clampOrb() },
    }, false);
    state.aspectPanes[pl.body] = id;
    wishPane(id, { height: window.LUN.PANE_HEIGHTS.cycle, minHeight: 18, order });
  }
  const ALL_ASPECT_PANE = 'pane_asp_all';
  function createAllAspect() {
    const bodies = ['Sun'].concat(window.LUN.ASPECT_PLANETS.map((p) => p.body));
    state.chart.createIndicator({
      name: 'AllAspectStrip', paneId: ALL_ASPECT_PANE, shortName: '∀ все аспекты',
      extendData: { bodies, orb: clampOrb() },
    }, false);
    state.allAspectPane = ALL_ASPECT_PANE;
    wishPane(ALL_ASPECT_PANE, { height: window.LUN.PANE_HEIGHTS.cycle + 4, minHeight: 20, order: 29 });
  }
  function createVolumePane() {
    state.volumePane = 'pane_volume';
    // calcParams: [] — объём без скользящих средних
    state.chart.createIndicator({ name: 'VOL', calcParams: [], paneId: state.volumePane }, false);
    wishPane(state.volumePane, { height: window.LUN.PANE_HEIGHTS.volume, order: 90 });
  }
  function createDeltaPane() {
    state.deltaPane = 'pane_delta';
    state.chart.createIndicator({ name: 'CumDelta', paneId: state.deltaPane }, false);
    wishPane(state.deltaPane, { height: 72, order: 91 });
  }

  /* ---------- Марков: лента режима + панель сигнала + матрица ---------- */
  const MARKOV_STRIP = 'pane_markov_strip', MARKOV_SIG = 'pane_markov_sig';
  function createMarkov() {
    state.chart.createIndicator({ name: 'MarkovStrip', paneId: MARKOV_STRIP, shortName: 'Марков-режим' }, false);
    wishPane(MARKOV_STRIP, { height: window.LUN.PANE_HEIGHTS.cycle, minHeight: 18, order: 27 });
    state.chart.createIndicator({ name: 'MarkovRegime', paneId: MARKOV_SIG, shortName: 'Марков' }, false);
    wishPane(MARKOV_SIG, { height: 64, order: 89 });
    state.markovPanes = [MARKOV_STRIP, MARKOV_SIG];
    showMarkovPanel(true);
  }
  function removeMarkov() {
    (state.markovPanes || []).forEach((p) => { try { state.chart.removeIndicator({ paneId: p }); } catch (e) {} });
    state.markovPanes = null; showMarkovPanel(false);
  }
  function markovPanelHTML() {
    const bars = state.chart.getDataList();
    if (!bars || !bars.length || !window.LunMarkov) return '<div>нет данных</div>';
    const O = window.LUN.MARKOV, step = O.step > 0 ? O.step : O.window;
    const wf = window.LunMarkov.walkForwardCached(bars, O);
    const last = bars.length - 1, price = wf.priceStates, curPrice = price[last] < 0 ? 1 : price[last];
    const pm = window.LunMarkov.transitionMatrix(price, { size: 3, step, sampleMode: O.sampleMode, upTo: last });
    const sig = window.LunMarkov.signalAt(pm, curPrice, { size: 3, priceSize: 3, horizon: O.horizon, minObs: O.minObs, deadZone: O.deadZone });
    const stat = window.LunMarkov.stationary(pm.prob, 3);
    const PN = ['BEAR', 'SIDE', 'BULL'], PCOL = ['#ef5350', '#8a8f3a', '#26a69a'];
    const pct = (x) => (x * 100).toFixed(1) + '%';
    let rows = '';
    for (let r = 0; r < 3; r++) {
      const hl = r === price[last], neff = pm.rowNeff[r], dim = neff < O.minObs;
      rows += `<tr style="${hl ? 'background:#1b2431;' : ''}${dim ? 'opacity:.5;' : ''}">
        <td style="color:${PCOL[r]}">${PN[r]}</td><td>${pct(pm.prob[r * 3])}</td><td>${pct(pm.prob[r * 3 + 1])}</td><td>${pct(pm.prob[r * 3 + 2])}</td>
        <td style="color:#8b93a7">${neff.toFixed(0)}</td><td>${hl ? '←' : ''}</td></tr>`;
    }
    const astroName = O.astroProvider === 'none' ? 'нет' : O.astroProvider;
    const curName = wf.names[wf.state[last]] || '—';
    const trad = wf.tradable[last], s = wf.signal[last];
    return `<div style="font-weight:600;margin-bottom:3px">МАРКОВ · W=${O.window} · шаг=${step} · ${O.thrMode} · астро: ${astroName}</div>
      <div style="margin-bottom:3px">Сейчас: <b style="color:${PCOL[curPrice]}">${curName}</b></div>
      <table class="mk-tbl"><thead><tr><th>сег.\\зав.</th><th>BEAR</th><th>SIDE</th><th>BULL</th><th>n_эфф</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <div style="margin-top:3px">Сигнал: <b style="color:${sig.signal > 0 ? '#26a69a' : '#ef5350'}">${(sig.signal >= 0 ? '+' : '') + pct(sig.signal)}</b> ±${pct(sig.ci)} · липкость ${pct(sig.stickiness)}</div>
      <div>Прогноз ${O.horizon} шагов: ${(sig.signalN >= 0 ? '+' : '') + pct(sig.signalN)}</div>
      <div>Вердикт (с астро): <b>${trad ? (s > 0 ? 'РАЗРЕШЁН ЛОНГ' : 'РАЗРЕШЁН ШОРТ') : 'нет сигнала'}</b></div>
      <div style="color:#8b93a7">Стационарное: bear ${pct(stat[0])} / side ${pct(stat[1])} / bull ${pct(stat[2])}</div>`;
  }
  function refreshMarkovPanel() {
    const el = document.getElementById('markov-panel');
    if (el && el.style.display !== 'none') { try { el.innerHTML = markovPanelHTML(); } catch (e) { el.innerHTML = 'Марков: ' + e.message; } }
  }
  function showMarkovPanel(on) {
    let el = document.getElementById('markov-panel');
    if (on) {
      const host = state.cellEl || document.getElementById('chart'); host.style.position = 'relative';
      if (!el) { el = document.createElement('div'); el.id = 'markov-panel'; el.className = 'markov-panel'; }
      if (el.parentElement !== host) host.appendChild(el);   // панель следует за активной ячейкой
      el.style.display = 'block'; refreshMarkovPanel();
      if (!state.markovTimer) state.markovTimer = setInterval(refreshMarkovPanel, 4000);
    } else {
      if (el) el.style.display = 'none';
      if (state.markovTimer) { clearInterval(state.markovTimer); state.markovTimer = null; }
    }
  }
  function addMarkovCss() {
    if (document.getElementById('markov-css')) return;
    const s = document.createElement('style'); s.id = 'markov-css';
    s.textContent = `.markov-panel{position:absolute;top:8px;right:8px;z-index:20;background:rgba(12,16,22,.92);border:1px solid #2a3242;border-radius:6px;padding:8px 10px;font:11px/1.35 system-ui,sans-serif;color:#cdd3df;max-width:340px}
    .markov-panel .mk-tbl{border-collapse:collapse;margin:2px 0;font-size:11px}
    .markov-panel .mk-tbl th,.markov-panel .mk-tbl td{padding:1px 6px;text-align:right}
    .markov-panel .mk-tbl th:first-child,.markov-panel .mk-tbl td:first-child{text-align:left}
    .markov-panel .mk-tbl th{color:#8b93a7;font-weight:400}`;
    document.head.appendChild(s);
  }

  function buildPanes() {
    const H = window.LUN.PANE_HEIGHTS;
    state.signPane = 'pane_sign_Moon';
    state.chart.createIndicator({ name: 'SignStrip', paneId: state.signPane, shortName: BODY_LABEL.Moon, extendData: { body: 'Moon', frame: 'geo' } }, false);
    state.signPanes.Moon = state.signPane;
    wishPane(state.signPane, { height: H.moonSign, minHeight: 26, order: 10 });
    window.LUN.CYCLES.forEach((cy, i) => { if (cy.enabled) createCyclePane(cy, 11 + i); });
    window.LUN.ASPECT_PLANETS.forEach((pl, i) => { if (pl.enabled) createSunAspect(pl, 15 + i); });  // ☉/☿ по умолчанию
    if (window.LUN.ALL_ASPECTS.enabled) createAllAspect();
    createVolumePane();
  }

  /* ---------- наложение 2-го инструмента линией ---------- */
  async function refreshCompare(slot) {
    slot = slot || state; const instr = slot.compareInstrument; if (!instr || !window.LunData.fetchFor) return;
    let bars = null; try { bars = await window.LunData.fetchFor(instr, slot.tf); } catch (e) {}
    if (!bars || !bars.length) return;
    const cb = bars.map((b) => ({ timestamp: b.timestamp, close: b.close }));
    try { slot.chart.removeIndicator({ paneId: 'candle_pane', name: 'Compare' }); } catch (e) {}
    slot.chart.createIndicator({ name: 'Compare', paneId: 'candle_pane', extendData: { bars: cb, label: instr.title || instr.ticker || instr.id, color: '#e07bd0' } }, true);
    slot.comparePane = true;
  }
  async function addCompare(instr) { if (!instr) return; state.compareInstrument = instr; await refreshCompare(state); }

  /* ---------- открытый интерес + физики/юрики (FUTOI, MOEX) ---------- */
  async function rebuildOI(slot) {
    slot = slot || state; const ins = slot.instrument;
    if ((ins.provider || 'moex') !== 'moex') { alert('Открытый интерес — только для фьючерсов MOEX.'); return false; }
    const ticker = await window.LunData.resolveTicker(ins);
    const code = ticker.replace(/[FGHJKMNQUVXZ]\d$/, '');   // SiU6 -> Si, GDU6 -> GD
    const till = new Date(), from = new Date(till.getTime() - 400 * 86400000), fmt = (d) => d.toISOString().slice(0, 10);
    const byDate = {}; let latest = null, split = false;
    try {
      const rows = await window.LunISS.fetchFUTOI(code, fmt(from), fmt(till));
      const perDate = {};
      for (const r of rows) {
        const d = r.tradedate || r.TRADEDATE; if (!d) continue;
        const g = String(r.clgroup || r.CLGROUP || '').toUpperCase();
        const L = +(r.pos_long != null ? r.pos_long : r.POS_LONG) || 0, S = +(r.pos_short != null ? r.pos_short : r.POS_SHORT) || 0;
        (perDate[d] = perDate[d] || {})[g] = { L, S };
      }
      Object.keys(perDate).sort().forEach((d) => {
        const o = perDate[d], fiz = o.FIZ || { L: 0, S: 0 }, yur = o.YUR || { L: 0, S: 0 };
        const rec = { fizNet: fiz.L - fiz.S, yurNet: yur.L - yur.S, oi: fiz.L + yur.L };
        byDate[d] = rec; latest = Object.assign({ date: d }, rec);
      });
      split = !!latest;
    } catch (e) { /* ниже фолбэк */ }
    if (!split) {
      try { const rows = await window.LunISS.fetchOIHistory(ticker, fmt(from), fmt(till)); rows.forEach((r) => { byDate[r.date] = { oi: r.oi }; latest = { date: r.date, oi: r.oi }; }); } catch (e) {}
    }
    if (!Object.keys(byDate).length) { alert('ОИ не получен для ' + code + ' (проверь строку данных / коды).'); return false; }
    // ΔОИ день-к-дню + пороги экстремумов (по коду или авто по квантилям)
    const sortedD = Object.keys(byDate).sort(); let prevOi = null;
    sortedD.forEach((d) => { const oi = byDate[d].oi; if (oi != null && prevOi != null) byDate[d].dOI = oi - prevOi; if (oi != null) prevOi = oi; });
    if (latest && byDate[latest.date]) latest.dOI = byDate[latest.date].dOI;
    // COT-экстремумы нетто-юриков: скользящий ранг за 60 дней (0.9/0.1 = крайности)
    if (split) {
      const win = 60;
      for (let a = 0; a < sortedD.length; a++) {
        const cur = byDate[sortedD[a]].yurNet, lo0 = Math.max(0, a - win); let below = 0, cnt = 0;
        for (let x = lo0; x < a; x++) { cnt++; if (byDate[sortedD[x]].yurNet <= cur) below++; }
        if (cnt >= 20) { const pr = below / cnt; byDate[sortedD[a]].cot = pr >= 0.9 ? 1 : (pr <= 0.1 ? -1 : 0); }
      }
    }
    const T = window.LUN.OI_EXTREMES || {};
    let thr = (T.thresholds && T.thresholds[code]) || null;
    if (!thr) {
      const arr = sortedD.map((d) => Math.abs(byDate[d].dOI || 0)).filter((x) => x > 0).sort((a, b) => a - b);
      const q = (p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0;
      const pc = T.autoPct || [0.85, 0.95, 0.99]; thr = [q(pc[0]), q(pc[1]), q(pc[2])];
    }
    const paneId = 'pane_oi';
    try { slot.chart.removeIndicator({ paneId }); } catch (e) {}
    slot.chart.createIndicator({ name: 'OpenInterest', paneId, shortName: 'ОИ ' + code + (split ? ' физ/юр' : ''), extendData: { byDate, latest, split, thr } }, false);
    slot.oiPane = paneId; wishPane(paneId, { height: 92, order: 92 });
    return true;
  }
  function removeOI(slot) {
    slot = slot || state;
    if (slot.oiPane) { try { slot.chart.removeIndicator({ paneId: slot.oiPane }); } catch (e) {} slot.oiPane = null; }
    try { slot.chart.removeIndicator({ paneId: 'candle_pane', name: 'OIExtremes' }); } catch (e) {}
    delete slot.candleInds.OIExtremes; window.LUN_OI_EXTREMES = null;
  }

  /* ---------- базис к споту (фьюч − спот, регрессией) ---------- */
  async function rebuildBasis(slot) {
    slot = slot || state; const ins = slot.instrument;
    const sp = (window.LUN.SPOT_MAP || {})[ins.id];
    if ((ins.provider || 'moex') !== 'moex' || !sp) { alert('Базис доступен для фьючерсов MOEX с известным спотом (Si, CNY, золото, серебро).'); return false; }
    const list = slot.chart.getDataList(); if (!list || list.length < 20) { alert('Мало данных для базиса.'); return false; }
    const from = new Date(list[0].timestamp).toISOString().slice(0, 10), till = new Date(list[list.length - 1].timestamp).toISOString().slice(0, 10);
    let spot = [];
    try { spot = await window.LunISS.fetchCandlesFrom(sp.engine, sp.market, sp.secid, 24, from, till, 100); } catch (e) {}
    if (!spot || !spot.length) { alert('Спот ' + sp.secid + ' не получен.'); return false; }
    const dOf = (ts) => new Date(ts + 3 * 3600000).toISOString().slice(0, 10);
    const spotByDate = {}; spot.forEach((b) => { spotByDate[dOf(b.timestamp)] = b.close; });
    // точки (fut, spot) по датам → регрессия fut = k·spot + c
    const pts = [];
    for (const b of list) { const s = spotByDate[dOf(b.timestamp)]; if (s != null && s > 0) pts.push([b.close, s, b.timestamp]); }
    if (pts.length < 20) { alert('Мало общих дат фьюч/спот.'); return false; }
    let n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(([f, s]) => { sx += s; sy += f; sxx += s * s; sxy += s * f; });
    const den = n * sxx - sx * sx, k = den ? (n * sxy - sx * sy) / den : 0, c = (sy - k * sx) / n;
    const byTs = {}; const vals = [];
    pts.forEach(([f, s, ts]) => { const r = f - (k * s + c); byTs[ts] = r; vals.push(r); });
    const mean = vals.reduce((a, x) => a + x, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, x) => a + (x - mean) * (x - mean), 0) / vals.length) || 1e-9;
    const paneId = 'pane_basis';
    try { slot.chart.removeIndicator({ paneId }); } catch (e) {}
    slot.chart.createIndicator({ name: 'ArbSpread', paneId, shortName: 'Базис ' + ins.id + '−' + sp.secid, extendData: { byTs, mean, std, title: 'Базис ' + (ins.title || ins.id) + ' − ' + sp.title, formula: 'basis', last: vals[vals.length - 1] } }, false);
    slot.basisPane = paneId; wishPane(paneId, { height: 90, order: 94 });
    return true;
  }
  function removeBasis(slot) { slot = slot || state; if (slot.basisPane) { try { slot.chart.removeIndicator({ paneId: slot.basisPane }); } catch (e) {} slot.basisPane = null; } }

  /* ---------- арбитражная связка: синтетика + спред + z-score ---------- */
  async function buildArb(slot, bundle) {
    slot = slot || state; if (!bundle) return false;
    const keys = Object.keys(bundle.legs), data = {};
    for (const k of keys) { try { data[k] = await window.LunData.fetchFor(bundle.legs[k], slot.tf); } catch (e) { data[k] = null; } }
    if (keys.some((k) => !data[k] || !data[k].length)) { alert('Арбитраж «' + bundle.title + '»: не все ноги загрузились (проверь коды/данные).'); return false; }
    const maps = {}; keys.forEach((k) => { const m = new Map(); data[k].forEach((b) => m.set(b.timestamp, b.close)); maps[k] = m; });
    const series = [];
    for (const b of data[keys[0]]) {
      const ts = b.timestamp, cl = {}; let ok = true;
      for (const k of keys) { const v = maps[k].get(ts); if (v == null || !(v > 0)) { ok = false; break; } cl[k] = v; }
      if (!ok) continue;
      let spread;
      if (bundle.formula === 'triangle') spread = cl.C - (cl.A / cl.B) * (bundle.scale || 1);
      else if (bundle.formula === 'ratio') spread = (cl.A / cl.B) * (bundle.scale || 1);
      else if (bundle.formula === 'diff') spread = cl.A - cl.B;
      else spread = cl.A;
      series.push({ ts, spread });
    }
    if (series.length < 20) { alert('Арбитраж: мало общих точек по времени.'); return false; }
    const vals = series.map((s) => s.spread), mean = vals.reduce((a, x) => a + x, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, x) => a + (x - mean) * (x - mean), 0) / vals.length) || 1e-9;
    const byTs = {}; series.forEach((s) => { byTs[s.ts] = s.spread; });
    const paneId = 'pane_arb';
    try { slot.chart.removeIndicator({ paneId }); } catch (e) {}
    slot.chart.createIndicator({ name: 'ArbSpread', paneId, shortName: bundle.title, extendData: { byTs, mean, std, title: bundle.title, formula: bundle.formula, last: series[series.length - 1].spread } }, false);
    slot.arbPane = paneId; slot.arbBundle = bundle; wishPane(paneId, { height: 92, order: 93 });
    return true;
  }
  function removeArb(slot) { slot = slot || state; if (slot.arbPane) { try { slot.chart.removeIndicator({ paneId: slot.arbPane }); } catch (e) {} slot.arbPane = null; slot.arbBundle = null; } }
  function removeCompare() {
    if (state.comparePane) { try { state.chart.removeIndicator({ paneId: 'candle_pane', name: 'Compare' }); } catch (e) {} state.comparePane = false; }
    state.compareInstrument = null;
  }

  /* ---------- инструменты Ганна ---------- */
  function removeCandInd(name) { try { state.chart.removeIndicator({ paneId: 'candle_pane', name }); } catch (e) {} delete state.candleInds[name]; }
  // запустить рисование оверлея (первый клик = пивот/угол, второй = охват)
  const defOvStyle = () => Object.assign({}, window.LUN_OVERLAY_DEF_STYLE || { color: '#f0c040', size: 1.4, dash: 'solid', fill: false, fillColor: 'rgba(240,192,64,0.14)' });
  // двойной клик в правый-нижний угол осей → последняя цена в центр экрана
  function recenterLastPrice(slot) {
    slot = slot || state; const c = slot.chart;
    try { const l = c.getDataList(); if (!l.length) return; const w = (slot.cellEl && slot.cellEl.clientWidth) || 600; c.setOffsetRightDistance(Math.max(60, Math.round(w / 2))); if (c.scrollToRealTime) c.scrollToRealTime(); else if (c.scrollToTimestamp) c.scrollToTimestamp(l[l.length - 1].timestamp);
      // в фикс-поле 1×1 — подвести последнюю цену к центру по вертикали
      const g = slot.g11; if (g && g.on && g.baseCenter != null) { g.vOffset = l[l.length - 1].close - g.baseCenter; c.scrollByDistance(0); }
    } catch (e) {}
  }
  // ===== Фиксированное поле 1×1 (истинное: своя ось цены) =====================
  // Ганн: 1×1 — расчётное соотношение «цена на бар» (первая N-волна после
  // разворота). Фикс-поле держит ЭТО соотношение постоянным: и по X (ширина
  // бара), и по Y (диапазон цены на пиксель) — геометрия углов не «разлетается»
  // при прокрутке. Поле становится безразмерным: колесо — вертикальный пан,
  // перетаскивание — горизонтальный; зум отключён. Реализовано через перехват
  // диапазона оси цены (axis.createRange) вендора KLineChart.
  let gannSpaceOn = false;
  // измерить текущий масштаб цены (px на 1 ед. цены) активной панели
  function pxPerPriceOf(c) {
    try {
      const l = c.getDataList(); if (!l.length) return null;
      const p0 = l[l.length - 1].close; const step = Math.max(Math.abs(p0) * 0.02, 1e-6);
      const y0 = c.convertToPixel({ value: p0 }, { paneId: 'candle_pane' }).y;
      const y1 = c.convertToPixel({ value: p0 + step }, { paneId: 'candle_pane' }).y;
      if (!isFinite(y0) || !isFinite(y1) || y0 === y1) return null;
      return Math.abs(y1 - y0) / step;
    } catch (e) { return null; }
  }
  function applyGannField(slot, on) {
    const c = slot.chart; if (!c) return;
    if (on) {
      const cfg = window.LUN.GANNTOOLS.scale || {};
      let upb = cfg.unitPerBar;
      if (!(upb > 0)) {                                   // авто: диапазон/бары видимого окна
        try { const l = c.getDataList(), r = c.getVisibleRange(); const f = Math.max(0, r.from), t = Math.min(l.length, Math.ceil(r.to)); let hi = -Infinity, lo = Infinity; for (let i = f; i < t; i++) { if (l[i].high > hi) hi = l[i].high; if (l[i].low < lo) lo = l[i].low; } if (hi > lo) upb = (hi - lo) / Math.max(1, t - f); } catch (e) {}
      }
      const g = slot.g11 = { on: true, upb: upb, ppp: null, vOffset: 0, fixedSpan: null, baseCenter: null };
      // перехват диапазона оси цены: на первом кадре замораживаем ТЕКУЩИЙ размах
      // (масштаб) и центр; затем в том же кадре меряем px/цену и подгоняем ширину
      // бара так, чтобы 1 бар = upb по цене (истинное 1×1). vOffset — верт. пан.
      try {
        c.setPaneOptions({ id: 'candle_pane', axis: { createRange: function (t) {
          const dr = t.defaultRange;
          if (g.fixedSpan == null) {
            g.fixedSpan = dr.range; g.baseCenter = dr.from + dr.range / 2;
            // измерить px/цену на этом же (ещё не тронутом) масштабе и выставить barSpace
            setTimeout(() => { try { const ppp = pxPerPriceOf(c); if (ppp) { g.ppp = ppp; if (g.upb > 0 && c.setBarSpace) c.setBarSpace(Math.max(1, ppp * g.upb)); } } catch (er) {} }, 0);
          }
          const center = g.baseCenter + g.vOffset, span = g.fixedSpan;
          const from = center - span / 2, to = center + span / 2;
          return { from: from, to: to, range: span, realFrom: from, realTo: to, realRange: span, displayFrom: from, displayTo: to, displayRange: span };
        } } });
      } catch (e) {}
      try { if (c.setZoomEnabled) c.setZoomEnabled(false); } catch (e) {}
      try { c.setPaneOptions({ id: 'candle_pane', axis: { scrollZoomEnabled: false } }); } catch (e) {}
      // колесо = вертикальный пан безразмерного поля
      if (slot.cellEl && !slot._g11Wheel) {
        slot._g11Wheel = (e) => {
          const gg = slot.g11; if (!gg || !gg.on) return;
          e.preventDefault(); e.stopPropagation();
          const pricePerPx = (gg.ppp && gg.ppp > 0) ? 1 / gg.ppp : (gg.fixedSpan ? gg.fixedSpan / 400 : 1);
          gg.vOffset += e.deltaY * pricePerPx;            // вниз колесо → поле вниз
          try { c.scrollByDistance(0); } catch (er) {}
        };
        slot.cellEl.addEventListener('wheel', slot._g11Wheel, { passive: false, capture: true });
      }
      try { c.scrollByDistance(0); } catch (e) {}
    } else {
      if (slot.g11) slot.g11.on = false;
      try { c.setPaneOptions({ id: 'candle_pane', axis: { createRange: function (t) { return t.defaultRange; }, scrollZoomEnabled: true } }); } catch (e) {}
      try { if (c.setZoomEnabled) c.setZoomEnabled(true); } catch (e) {}
      if (slot.cellEl && slot._g11Wheel) { slot.cellEl.removeEventListener('wheel', slot._g11Wheel, { capture: true }); slot._g11Wheel = null; }
      slot.g11 = null;
      try { c.scrollByDistance(0); } catch (e) {}
    }
  }
  function toggleGannSpace(on) {
    gannSpaceOn = on;
    slots.forEach((s) => { try { applyGannField(s, on); } catch (e) {} });
  }
  // единая форма для геометрии Ганна: Box (деления) или Квадрат-сетка N×N
  // Настройки стиля инструментов Ганна: размер текста/цифр, толщина/тип линии, цвет уровней
  function gannStyleModal() {
    const G = window.LUN.GSTYLE || (window.LUN.GSTYLE = { textSize: 11, lineWidth: 1, lineStyle: 'solid', levelColor: '#e0d060' });
    const ss = 'background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:4px 8px';
    openModal('⚙ Стиль инструментов Ганна', `
      <p style="color:#8b93a7">Общие настройки отрисовки уровней/линий Ганна (ретрейсменты, квадрат, мастер-циклы). Меняются вживую.</p>
      <div style="display:flex;flex-direction:column;gap:14px;font-size:14px">
        <label>Размер подписей и цифр уровней: <input id="gs-text" type="range" min="8" max="22" value="${G.textSize || 11}" style="vertical-align:middle"> <span id="gs-text-v">${G.textSize || 11}px</span></label>
        <label>Толщина линий: <input id="gs-lw" type="range" min="1" max="5" step="0.5" value="${G.lineWidth || 1}" style="vertical-align:middle"> <span id="gs-lw-v">${G.lineWidth || 1}</span></label>
        <label>Тип линии: <select id="gs-ls" style="${ss}"><option value="solid"${G.lineStyle !== 'dashed' ? ' selected' : ''}>сплошная</option><option value="dashed"${G.lineStyle === 'dashed' ? ' selected' : ''}>пунктир</option></select></label>
        <label>Цвет уровней: <input id="gs-col" type="color" value="${G.levelColor || '#e0d060'}" style="vertical-align:middle;width:44px;height:26px;background:#0b0e14;border:1px solid #2a3242;border-radius:6px"></label>
      </div>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    const refresh = () => { slots.forEach((s) => { try { s.chart.resize(); } catch (e) {} }); };
    const t = bg.querySelector('#gs-text'), lw = bg.querySelector('#gs-lw');
    t.oninput = () => { G.textSize = +t.value; bg.querySelector('#gs-text-v').textContent = t.value + 'px'; refresh(); };
    lw.oninput = () => { G.lineWidth = +lw.value; bg.querySelector('#gs-lw-v').textContent = lw.value; refresh(); };
    bg.querySelector('#gs-ls').onchange = (e) => { G.lineStyle = e.target.value; refresh(); };
    bg.querySelector('#gs-col').oninput = (e) => { G.levelColor = e.target.value; refresh(); };
  }
  function gannGeomModal() {
    const S = window.LUN.GANNTOOLS.boxChoice || (window.LUN.GANNTOOLS.boxChoice = { type: 'box', divisions: 8 });
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    openModal('Gann Box / Квадрат', `
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
        <label><input type="radio" name="gg-type" value="box"${S.type === 'box' ? ' checked' : ''}> <b>Box</b> — рамка с делениями (1/8·1/3·1/2) по цене и времени + диагонали</label>
        <label><input type="radio" name="gg-type" value="grid"${S.type === 'grid' ? ' checked' : ''}> <b>Квадрат-сетка N×N</b> — крест по центру + диагонали</label>
        <label>Делений (для сетки): <input id="gg-div" type="number" min="2" max="32" value="${S.divisions || 8}" style="${inp};width:80px"> <span style="color:#8b93a7">8 = квадрат, 12 = «144»</span></label>
      </div>
      <button id="gg-draw" style="${btn};border-color:#26a69a">Рисовать (2 клика: угол → охват)</button>`);
    document.getElementById('gg-draw').onclick = () => {
      const type = (document.querySelector('input[name="gg-type"]:checked') || {}).value || 'box';
      const divisions = Math.max(2, Math.min(32, +document.getElementById('gg-div').value || 8));
      window.LUN.GANNTOOLS.boxChoice = { type, divisions };
      const bg = document.querySelector('.lun-modal-bg'); if (bg) bg.remove();
      if (type === 'grid') startOverlay('lun_gannsquare', { divisions }); else startOverlay('lun_gannbox');
    };
  }
  function startOverlay(name, extendData) { closeMenus(); const ev = overlayEvents(); state.chart.createOverlay(Object.assign({ name, extendData: Object.assign({ style: defOvStyle() }, extendData) }, ev)); }
  // масштаб 1×1 (цена на бар) для сквоузинга: авто / ручной
  function scaleModal() {
    const cfg = window.LUN.GANNTOOLS.scale || (window.LUN.GANNTOOLS.scale = {});
    let autoHint = '';
    try { const l = state.chart.getDataList(); const r = state.chart.getVisibleRange(); const f = Math.max(0, r.from), t = Math.min(l.length, Math.ceil(r.to)); let hi = -Infinity, lo = Infinity; for (let i = f; i < t; i++) { if (l[i].high > hi) hi = l[i].high; if (l[i].low < lo) lo = l[i].low; } if (hi > lo) autoHint = ((hi - lo) / Math.max(1, t - f)).toFixed(3); } catch (e) {}
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    openModal('Масштаб 1×1 (цена на бар)', `
      <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap">
        <label>Цена на 1 бар (пусто = авто)<br><input id="sc-val" type="number" step="any" value="${cfg.unitPerBar != null ? cfg.unitPerBar : ''}" placeholder="авто ≈ ${autoHint}" style="${inp};width:180px"></label>
        <button id="sc-apply" style="${btn};border-color:#26a69a">Применить</button>
      </div>
      <p style="color:#8b93a7;margin:10px 0 0">Линия 1×1 — баланс цены и времени по Ганну. «Авто» берёт диапазон/бары видимого окна (≈ ${autoHint}). Впишите точное значение для классического масштаба (напр. 1 пункт = 1 бар).</p>`);
    document.getElementById('sc-apply').onclick = () => {
      const v = document.getElementById('sc-val').value.trim();
      cfg.unitPerBar = v === '' ? null : (+v || null);
      if (state.candleInds.GannSquaring) { try { state.chart.removeIndicator({ paneId: 'candle_pane', name: 'GannSquaring' }); state.chart.createIndicator({ name: 'GannSquaring', paneId: 'candle_pane' }, true); } catch (e) {} }
    };
  }

  // Прогностика: какие астро-события реально совпадают с разворотами
  function astroFitModal() {
    let bars = []; try { bars = state.chart.getDataList() || []; } catch (e) {}
    if (bars.length < 60 || !window.LunTS) { alert('Мало истории для анализа. Поставьте период больше (D1, 1–3 года) в меню «🗓 Период».'); return; }
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    openModal('Астро-фит — что реально работает на инструменте', `
      <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">
        <label>Орб (дней)<br><input id="af-orb" type="number" min="1" max="10" value="3" style="${inp};width:80px"></label>
        <label>Свинг ±баров<br><input id="af-k" type="number" min="2" max="10" value="3" style="${inp};width:80px"></label>
        <button id="af-run" style="${btn}">Пересчитать</button>
      </div>
      <div id="af-out" style="color:#8b93a7">Считаю…</div>`);
    const vcol = { 'значимо': '#26a69a', 'слабо': '#e0a030', 'шум': '#8b93a7', 'мало данных': '#8b93a7' };
    const run = () => {
      const orbDays = +document.getElementById('af-orb').value || 3, k = +document.getElementById('af-k').value || 3;
      const R = window.LunTS.computeAstroFit(bars, { orbDays, pivotK: k });
      lastFit = R;
      const rows = R.features.map((f, idx) => `<tr>`
        + `<td style="padding:2px 8px 2px 0"><span class="af-mark" data-i="${idx}" title="Показать на графике" style="cursor:pointer;color:#c77dff">📍</span></td>`
        + `<td style="padding:2px 10px 2px 0">${f.name}</td>`
        + `<td style="padding:2px 10px 2px 0;color:#8b93a7">${f.count}</td>`
        + `<td style="padding:2px 10px 2px 0">${f.hits}/${R.pivots}</td>`
        + `<td style="padding:2px 10px 2px 0">${(f.hitRate * 100).toFixed(0)}%</td>`
        + `<td style="padding:2px 10px 2px 0;color:#8b93a7">${(f.coverage * 100).toFixed(0)}%</td>`
        + `<td style="padding:2px 10px 2px 0"><b>${f.lift.toFixed(2)}×</b></td>`
        + `<td style="padding:2px 10px 2px 0">${f.z.toFixed(1)}</td>`
        + `<td style="padding:2px 0;color:${vcol[f.verdict]}">${f.verdict}</td></tr>`).join('');
      const fromS = new Date(R.from).toISOString().slice(0, 10), tillS = new Date(R.till).toISOString().slice(0, 10);
      document.getElementById('af-out').innerHTML = `<p style="margin:0 0 8px">${fromS} … ${tillS} · разворотов: <b style="color:#d7deea">${R.pivots}</b> · орб ±${R.orbDays}д. <b>lift>1</b> и <b>z≥2</b> = событие реально притягивает развороты. 📍 — вынести событие на график. <span id="af-clear" style="cursor:pointer;color:#8b93a7;text-decoration:underline">убрать метки</span></p>`
        + `<div style="max-height:340px;overflow:auto"><table style="border-collapse:collapse;font-size:12px">`
        + `<thead><tr style="color:#8b93a7;text-align:left"><th></th><th style="padding-right:10px">Астро-событие</th><th style="padding-right:10px">шт</th><th style="padding-right:10px">попад.</th><th style="padding-right:10px">hit%</th><th style="padding-right:10px">охват</th><th style="padding-right:10px">lift</th><th style="padding-right:10px">z</th><th>вердикт</th></tr></thead>`
        + `<tbody>${rows}</tbody></table></div>`;
      [...document.querySelectorAll('.af-mark')].forEach((el) => { el.onclick = () => { const f = lastFit.features[+el.dataset.i]; showAstroMarks(f.name, f.events); }; });
      const cl = document.getElementById('af-clear'); if (cl) cl.onclick = clearAstroMarks;
    };
    document.getElementById('af-run').onclick = run;
    setTimeout(run, 30);
  }
  let lastFit = null;
  function showAstroMarks(name, events) {
    window.LUN_ASTRO_MARKS = { name, events };
    if (!state.candleInds.AstroEventMarks) { try { state.chart.createIndicator({ name: 'AstroEventMarks', paneId: 'candle_pane' }, true); state.candleInds.AstroEventMarks = true; } catch (e) {} }
    else { try { state.chart.removeIndicator({ paneId: 'candle_pane', name: 'AstroEventMarks' }); state.chart.createIndicator({ name: 'AstroEventMarks', paneId: 'candle_pane' }, true); } catch (e) {} }
  }
  function clearAstroMarks() { window.LUN_ASTRO_MARKS = null; removeCandInd('AstroEventMarks'); }

  // исследование сигналов: выбираемый бэктест на загруженных данных
  function researchModal() {
    let bars = []; try { bars = state.chart.getDataList() || []; } catch (e) {}
    if (bars.length < 60 || !window.LunResearch) { alert('Мало данных. Поставьте период больше (напр. D1, 1–3 года) в меню «🗓 Период».'); return; }
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    const groups = {}; window.LunResearch.SIGNALS.forEach((s) => { (groups[s.group] = groups[s.group] || []).push(s); });
    const checksHtml = Object.keys(groups).map((g) => `<div style="margin:2px 0"><span style="color:#8b93a7;font-size:11px">${g}</span><br>`
      + groups[g].map((s) => `<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 12px 2px 0"><input type="checkbox" class="rs-sig" value="${s.key}" checked> ${s.name}</label>`).join('') + '</div>').join('');
    openModal('🔬 Исследование сигналов (бэктест по выбору)', `
      <div style="margin-bottom:8px">${checksHtml}</div>
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px">
        <label>Горизонты (баров)<br><input id="rs-h" type="text" value="1, 3, 5, 10" style="${inp};width:130px"></label>
        <label>Издержки %/сделку<br><input id="rs-cost" type="number" step="any" value="0.02" style="${inp};width:90px"></label>
        <label style="display:inline-flex;align-items:center;gap:5px"><input id="rs-oos" type="checkbox"> out-of-sample (посл. ⅓)</label>
        <button id="rs-run" style="${btn};border-color:#26a69a">Прогнать</button>
        <span style="color:#8b93a7">${bars.length} баров · ${state.instrument.title || ''} · ${state.tf.title}</span>
      </div>
      <div id="rs-out" style="color:#8b93a7">…</div>`);
    const run = () => {
      const keys = [...document.querySelectorAll('.rs-sig')].filter((c) => c.checked).map((c) => c.value);
      const H = document.getElementById('rs-h').value.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => n > 0);
      const costPct = (parseFloat(document.getElementById('rs-cost').value) || 0) / 100;
      const oos = document.getElementById('rs-oos').checked;
      const R = window.LunResearch.run(bars, keys, H.length ? H : [1, 3, 5, 10], { costPct, oos });
      const head = '<tr style="color:#8b93a7;text-align:left"><th style="padding-right:10px">Сигнал</th><th style="padding-right:10px">входов</th>'
        + R.horizons.map((h) => `<th style="padding-right:10px" colspan="2">+${h}: win / ср% (t)</th>`).join('') + '</tr>';
      const rows = R.rows.map((r) => {
        let tds = `<td style="padding:2px 10px 2px 0">${r.name}</td><td style="padding:2px 10px 2px 0;color:#8b93a7">${r.count}</td>`;
        R.horizons.forEach((h) => {
          const s = r.perH[h];
          if (!s || !s.n) { tds += '<td colspan="2" style="color:#6b7280">—</td>'; return; }
          const sig = s.n >= 30 && Math.abs(s.t) >= 2;
          const wcol = s.win > 0.55 ? '#26a69a' : (s.win < 0.45 ? '#ef5350' : '#d7deea');
          // при OOS: ✓ если знак на train и test совпал (устойчиво)
          let rob = '';
          if (R.oos && r.trainH && r.trainH[h] && r.trainH[h].n) { const tr = r.trainH[h]; rob = (tr.avg > 0 && s.avg > 0) ? '<span style="color:#26a69a"> ✓</span>' : '<span style="color:#ef5350"> ✗</span>'; }
          tds += `<td style="padding:2px 4px 2px 0;color:${wcol}">${(s.win * 100).toFixed(0)}%</td>`
            + `<td style="padding:2px 12px 2px 0;color:${s.avg >= 0 ? '#26a69a' : '#ef5350'}">${(s.avg * 100).toFixed(2)}%<span style="color:${sig ? '#e0c040' : '#6b7280'}"> (${s.t.toFixed(1)})</span>${rob}</td>`;
        });
        return `<tr>${tds}</tr>`;
      }).join('');
      document.getElementById('rs-out').innerHTML = `<p style="margin:0 0 8px">Направленный вход, доходность вперёд за вычетом издержек. <b>win>55%</b> и <b>|t|≥2</b> при ≥30 входах = перевес. ${R.oos ? '<b>OOS</b>: только последняя ⅓; ✓ = знак совпал с train (устойчиво).' : ''} Считается на текущем инструменте/ТФ/периоде.</p>`
        + `<div style="max-height:340px;overflow:auto"><table style="border-collapse:collapse;font-size:12px"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
    };
    document.getElementById('rs-run').onclick = run;
    setTimeout(run, 30);
  }

  // Астро-факторы на экстремумах: взвешенные астро-значения на вершинах/основаниях волны
  function farModal() {
    let bars = []; try { bars = state.chart.getDataList() || []; } catch (e) {}
    if (bars.length < 80 || !window.LunTS || !window.LunTS.computeFAR) { alert('Мало истории. Поставьте период больше (D1, 2–5 лет).'); return; }
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    openModal('⚖ Астро-факторы на экстремумах волны', `
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px">
        <label>Волна ≥ %<br><input id="far-pct" type="number" step="0.5" min="1" value="3" style="${inp};width:90px"></label>
        <button id="far-run" style="${btn};border-color:#26a69a">Прогнать</button>
      </div>
      <div id="far-out" style="color:#8b93a7">…</div>`);
    const run = () => {
      const pct = parseFloat(document.getElementById('far-pct').value) || 3;
      const R = window.LunTS.computeFAR(bars, { pct });
      const col = (rows, title, c) => {
        const body = rows.length ? rows.map((r) => `<tr><td style="padding:2px 10px 2px 0">${r.factor}</td><td style="padding:2px 10px 2px 0;color:#8b93a7">${r.count}</td><td style="padding:2px 0;color:${r.lift >= 1.3 ? c : '#8b93a7'}"><b>${r.lift.toFixed(2)}×</b></td></tr>`).join('') : '<tr><td colspan="3" style="color:#6b7280">мало экстремумов</td></tr>';
        return `<div style="flex:1;min-width:240px"><div style="color:${c};margin-bottom:4px">${title}</div><table style="border-collapse:collapse;font-size:12px"><thead><tr style="color:#8b93a7;text-align:left"><th style="padding-right:10px">Фактор</th><th style="padding-right:10px">шт</th><th>lift</th></tr></thead><tbody>${body}</tbody></table></div>`;
      };
      document.getElementById('far-out').innerHTML = `<p style="margin:0 0 8px">Волна ≥ ${R.pct}% · вершин: <b style="color:#ef5350">${R.nTops}</b> · оснований: <b style="color:#26a69a">${R.nBottoms}</b>. lift = частота фактора на экстремуме / базовой. <b>lift≥1.3</b> при ≥3 попаданиях = фактор тяготеет к развороту.</p>`
        + `<div style="display:flex;gap:24px;flex-wrap:wrap">` + col(R.tops, '▼ Вершины', '#ef5350') + col(R.bottoms, '▲ Основания', '#26a69a') + `</div>`;
    };
    document.getElementById('far-run').onclick = run;
    setTimeout(run, 30);
  }

  /* ---------- СБЧ (Сарватобхадра-чакра) ---------- */
  const SBC_PANE = 'pane_sbc';
  function createSBCPane() {
    if (state.sbcPane) { try { state.chart.removeIndicator({ paneId: state.sbcPane }); } catch (e) {} }
    state.chart.createIndicator({ name: 'SBCStrip', paneId: SBC_PANE, shortName: 'СБЧ' }, false);
    state.sbcPane = SBC_PANE; wishPane(SBC_PANE, { height: 100, order: 43 });
  }
  function removeSBCPane() { if (state.sbcPane) { try { state.chart.removeIndicator({ paneId: state.sbcPane }); } catch (e) {} state.sbcPane = null; } }
  function sbcModal() {
    if (!window.LunSBC) { openModal('СБЧ', '<p>Модуль СБЧ не загрузился.</p>'); return; }
    const insTs = instrumentTs();
    const natTs = (window.LUN_SBC && window.LUN_SBC.natalTs) || insTs || Date.now();
    const natDate = new Date(natTs).toISOString().slice(0, 10);
    const insTitle = (state.instrument && (state.instrument.title || state.instrument.ticker || state.instrument.id)) || 'инструмент';
    const ss = 'background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:5px 8px;font-size:13px';
    openModal('🕉 СБЧ — Сарватобхадра-чакра (сидерика, джйотиш)', `
      <p style="color:#8b93a7">Ведха-скаляр: активация чувствительных накшатр инструмента транзитными планетами (бенефик +, малефик −), сила по достоинству/скорости. <b>Джанма</b> = накшатра натальной Луны инструмента. Выход — гладкий ряд ≈ −5…+5, это <b>не сигнал ЛОНГ/ШОРТ</b>, а ряд для проверки Монте-Карло. Сидерика — аянамша Лахири.</p>
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin:8px 0">
        <label>Дата рождения «${insTitle}»<br><input id="sbc-date" type="date" value="${natDate}" style="${ss}"></label>
        <label>Солнце-ведха<br><select id="sbc-sun" style="${ss}"><option value="all3">все 3 (Агра+Пара+Приштха)</option><option value="agra">только Агра</option></select></label>
        <button id="sbc-show" style="padding:6px 12px;background:#1c3a2a;color:#d7deea;border:1px solid #2a5a3a;border-radius:6px;cursor:pointer">Показать панель</button>
      </div>
      <div id="sbc-out" style="color:#8b93a7;font-size:12px"></div>
      <p style="color:#6b7280;font-size:11px;margin-top:8px">Дата рождения инструмента/биржи задаётся один раз и обосновывается (первые торги, генезис-блок и т.п.). Base rate у ведх высокий — проверяема лишь узкая гипотеза: экстремумы. Прогоняйте через Монте-Карло.</p>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    const upd = () => {
      const d = bg.querySelector('#sbc-date').value; const ts = d ? Date.parse(d + 'T00:00:00Z') : natTs;
      const janma = window.LunSBC.janmaOf(ts);
      bg.querySelector('#sbc-out').innerHTML = 'Джанма-накшатра: <b>' + window.LunSBC.NAK[(janma - 1) % 27] + '</b> (№' + janma + ')';
      return { ts, janma };
    };
    bg.querySelector('#sbc-date').onchange = upd; upd();
    bg.querySelector('#sbc-show').onclick = () => {
      const d = bg.querySelector('#sbc-date').value; const ts = d ? Date.parse(d + 'T00:00:00Z') : natTs;
      const janma = window.LunSBC.janmaOf(ts);
      window.LUN_SBC = { janma, natalTs: ts, sunVedha: bg.querySelector('#sbc-sun').value, title: insTitle };
      createSBCPane(); scheduleWsSave(); bg.remove(); closeMenus();
    };
  }

  /* ---------- Монте-Карло: проверка гипотезы ---------- */
  function mcModal() {
    if (!window.LunMC) { openModal('Монте-Карло', '<p>Движок не загрузился.</p>'); return; }
    let bars = []; try { bars = state.chart.getDataList() || []; } catch (e) {}
    if (bars.length < 120) { alert('Мало истории. Поставьте период больше (D1, 2–5 лет) в «🗓 Период».'); return; }
    const ss = 'background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:5px 8px;font-size:13px';
    const sources = [];
    if (window.LunSBC && window.LUN_SBC && window.LUN_SBC.janma) sources.push(['sbc', 'Экстремумы СБЧ (текущий инструмент)']);
    if (window.LunSynastry && window.LUN_SYNASTRY && window.LUN_SYNASTRY.points) sources.push(['syn', 'Экстремумы синастрии']);
    if (window.LunCycle) { sources.push(['stages', 'Этапы цикла Меркурий–Солнце']); sources.push(['moonstages', 'Этапы цикла Луна–Солнце (фазы)']); }
    if (window.LunSBC) sources.push(['merc', 'Меркурий ретроградный']);
    if (!sources.length) { openModal('🎲 Монте-Карло', '<p>Сначала включите ряд: СБЧ / синастрию / цикл (в «Прогностика» / «Личные данные»).</p>'); return; }
    openModal('🎲 Монте-Карло — проверка гипотезы', `
      <p style="color:#8b93a7">Вопрос: цена разворачивается у дат события чаще, чем при случайности? <b>lift</b> = P(разворот|окно)/P(разворот), <b>p</b> = доля из 2000 случайных выборок с lift ≥ наблюдаемого. p≥0.05 — «не отличается от шума». Лучше на D1.</p>
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin:8px 0">
        <label>Событие<br><select id="mc-src" style="${ss}">${sources.map((s) => `<option value="${s[0]}">${s[1]}</option>`).join('')}</select></label>
        <label>Разворот ≥ %<br><input id="mc-pct" type="number" step="0.5" min="1" value="4" style="${ss};width:80px"></label>
        <label>Окно ±бар<br><input id="mc-win" type="number" min="0" max="10" value="2" style="${ss};width:70px"></label>
        <label>Доля событий<br><input id="mc-frac" type="number" step="0.05" min="0.02" max="0.5" value="0.1" style="${ss};width:80px"></label>
        <button id="mc-run" style="padding:6px 12px;background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;cursor:pointer">Прогнать</button>
      </div>
      <div id="mc-out" style="color:#8b93a7;font-size:13px;line-height:1.6">…</div>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    const spanDays = (bars[bars.length - 1].timestamp - bars[0].timestamp) / 86400000;
    const noMoon = spanDays > 45;
    const run = () => {
      const src = bg.querySelector('#mc-src').value;
      const pct = parseFloat(bg.querySelector('#mc-pct').value) || 4;
      const win = Math.max(0, parseInt(bg.querySelector('#mc-win').value) || 2);
      const frac = Math.min(0.5, Math.max(0.02, parseFloat(bg.querySelector('#mc-frac').value) || 0.1));
      const out = bg.querySelector('#mc-out'); out.innerHTML = 'Считаю…';
      setTimeout(() => {
        const piv = window.LunMC.detectPivots(bars, pct); const near = window.LunMC.nearMask(bars.length, piv, win);
        let series = null, eventIdx = null, ctrl = '';
        if (src === 'sbc') series = bars.map((b) => window.LunSBC.scoreAt(b.timestamp, { janma: window.LUN_SBC.janma, sunVedha: window.LUN_SBC.sunVedha }));
        else if (src === 'syn') series = bars.map((b) => window.LunSynastry.riAt(b.timestamp, window.LUN_SYNASTRY.points, 6, noMoon));
        else if (src === 'merc') { eventIdx = []; bars.forEach((b, i) => { if (window.LunSBC.planet(b.timestamp, 'Mercury').speed < 0) eventIdx.push(i); }); }
        else if (src === 'stages' || src === 'moonstages') {
          const cyc = src === 'moonstages' ? 'moon' : 'merc';
          const ev = window.LunCycle.stages(cyc, bars[0].timestamp, bars[bars.length - 1].timestamp);
          const seen = new Set(); eventIdx = [];
          ev.forEach((e) => { let lo = 0, hi = bars.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (bars[m].timestamp < e.ts) lo = m + 1; else hi = m; } if (!seen.has(lo)) { seen.add(lo); eventIdx.push(lo); } });
        }
        let R;
        if (eventIdx) R = window.LunMC.liftTest(bars.length, eventIdx, near, 2000);
        else { const ev = window.LunMC.eventsFromSeries(series, frac, true); R = window.LunMC.liftTest(bars.length, ev, near, 2000); }
        // контроль «рандомная натальная карта» для СБЧ/синастрии
        if (src === 'sbc' || src === 'syn') {
          const K = 20; let beat = 0; const realLift = R.lift || 0;
          for (let k = 0; k < K; k++) {
            let s2;
            if (src === 'sbc') { const rj = 1 + Math.floor(Math.random() * 27); s2 = bars.map((b) => window.LunSBC.scoreAt(b.timestamp, { janma: rj, sunVedha: window.LUN_SBC.sunVedha })); }
            else { const rp = []; for (let z = 0; z < 10; z++) rp.push(Math.random() * 360); s2 = bars.map((b) => window.LunSynastry.riAt(b.timestamp, rp, 6, noMoon)); }
            const ev2 = window.LunMC.eventsFromSeries(s2, frac, true); const r2 = window.LunMC.liftTest(bars.length, ev2, near, 300);
            if ((r2.lift || 0) >= realLift) beat++;
          }
          ctrl = `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #232b3a">Контроль «случайная карта»: из ${K} случайных ${src === 'sbc' ? 'джанм' : 'натальных карт'} <b>${beat}</b> дали lift ≥ реального. ${beat > K * 0.3 ? '<span style="color:#ef5350">Карта, похоже, не важна — работают сами транзиты.</span>' : '<span style="color:#26a69a">Реальная карта выделяется на фоне случайных.</span>'}</div>`;
        }
        if (R.lift == null) { out.innerHTML = 'Недостаточно данных (пивотов/событий).'; return; }
        const good = R.p < 0.05 && R.lift > 1;
        out.innerHTML = `Пивотов: ${piv.length} · событий: <b>${R.n}</b> · базовая ставка: ${(R.base * 100).toFixed(1)}%<br>`
          + `lift = <b style="font-size:16px;color:${good ? '#26a69a' : '#e0c040'}">${R.lift.toFixed(2)}×</b> · p = <b style="color:${good ? '#26a69a' : '#ef5350'}">${R.p.toFixed(3)}</b> `
          + (good ? '<span style="color:#26a69a">— отличается от шума (на этой выборке)</span>' : '<span style="color:#8b93a7">— не отличается от случайности</span>')
          + ctrl
          + `<p style="color:#6b7280;font-size:11px;margin-top:8px">Одна выборка/период — не доказательство. Проверяйте на разных инструментах и вне выборки; помните про поправку на множественные сравнения.</p>`;
      }, 30);
    };
    bg.querySelector('#mc-run').onclick = run; setTimeout(run, 40);
  }

  // прогнозная линия из циклов: тумблер (двигает офсет вправо, чтобы влезла проекция)
  function toggleProjection(on) {
    if (on) {
      try { const bar = state.chart.getBarSpace().bar || 6, proj = (window.LUN.TS && window.LUN.TS.projBars) || 120; state.chart.setOffsetRightDistance(Math.max(80, proj * bar)); } catch (e) {}
      try { state.chart.createIndicator({ name: 'CycleProjection', paneId: 'candle_pane' }, true); state.candleInds.CycleProjection = true; } catch (e) {}
    } else {
      removeCandInd('CycleProjection');
      if (!state.forecastOn) { try { state.chart.setOffsetRightDistance(80); } catch (e) {} }
    }
    try { state.chart.resize(); } catch (e) {}
  }

  // композит: среднее движение вперёд по астро-состоянию
  function compositeModal() {
    let bars = []; try { bars = state.chart.getDataList() || []; } catch (e) {}
    if (bars.length < 60 || !window.LunTS) { alert('Мало истории. Поставьте период больше (D1, 1–3 года).'); return; }
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    const order = ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
    openModal('Композит — среднее движение по астро-состоянию', `
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px">
        <label>Группировка<br><select id="cm-mode" style="${inp}"><option value="phase">Фаза Луны</option><option value="moonsign">Знак Луны</option><option value="planet">Знак планеты</option></select></label>
        <label>Планета<br><select id="cm-planet" style="${inp}">${order.map((p) => `<option value="${p}">${(window.LUN.ASTROGANN.planets[p] || {}).g || ''} ${p}</option>`).join('')}</select></label>
        <label>Горизонт (баров)<br><input id="cm-h" type="number" min="1" max="60" value="${(window.LUN.TS && window.LUN.TS.compHorizon) || 5}" style="${inp};width:90px"></label>
        <button id="cm-run" style="${btn}">Пересчитать</button>
      </div>
      <div id="cm-out" style="color:#8b93a7">…</div>`);
    const run = () => {
      const mode = document.getElementById('cm-mode').value, planet = document.getElementById('cm-planet').value, H = +document.getElementById('cm-h').value || 5;
      const R = window.LunTS.lunarComposite(bars, { mode, planet, horizon: H });
      const rows = R.rows.map((r) => {
        const col = r.avg >= 0 ? '#26a69a' : '#ef5350';
        return `<tr><td style="padding:2px 12px 2px 0">${r.key}</td>`
          + `<td style="padding:2px 12px 2px 0;color:${col}"><b>${(r.avg * 100).toFixed(2)}%</b></td>`
          + `<td style="padding:2px 12px 2px 0">${(r.winRate * 100).toFixed(0)}%</td>`
          + `<td style="padding:2px 0;color:#8b93a7">${r.cnt}</td></tr>`;
      }).join('');
      document.getElementById('cm-out').innerHTML = `<p style="margin:0 0 8px">Среднее движение за ${R.horizon} баров вперёд по группам. Отсортировано по среднему. Малые группы (мало «шт») — осторожно.</p>`
        + `<table style="border-collapse:collapse;font-size:12px"><thead><tr style="color:#8b93a7;text-align:left"><th style="padding-right:12px">Состояние</th><th style="padding-right:12px">ср. движ.</th><th style="padding-right:12px">%роста</th><th>шт</th></tr></thead><tbody>${rows}</tbody></table>`;
    };
    document.getElementById('cm-run').onclick = run;
    document.getElementById('cm-mode').onchange = run; document.getElementById('cm-planet').onchange = run;
    setTimeout(run, 30);
  }

  // Уровни квадрата Ганна. √-спираль: полный оборот (360°) = +2 к √цены.
  // base: '9'→8 делений (крест 45°), 'hex'→6 (60°), '360'→24 (15°),
  // 'natural'→квадраты натуральных чисел n² и серединные точки n²+n.
  // авто-масштаб: домножаем цену на степень 10, чтобы попасть в удобный диапазон
  // (~[300,3000]) — тогда шаг спирали Sq9 не «взрывается» на мелких ценах и не
  // грубит на крупных. Работает и для 0,01, и для 50, и для 90000.
  function gannAutoScale(price) {
    price = +price; if (!(price > 0)) return 1;
    let s = 1, p = price;
    while (p < 300 && s < 1e8) { s *= 10; p *= 10; }
    while (p > 30000 && s > 1e-8) { s /= 10; p /= 10; }
    return s;
  }
  function gannSquareLevels(price, base, turns, scale) {
    price = +price; turns = Math.max(1, Math.min(8, +turns || 3));
    if (!(price > 0)) return [];
    scale = (!scale || scale === 'auto') ? gannAutoScale(price) : +scale || 1;
    const P = price * scale;                          // считаем в масштабе, уровни делим обратно
    const out = [];
    if (base === 'natural') {
      const n = Math.round(Math.sqrt(P));
      for (let j = -turns; j <= turns; j++) {
        const m = n + j; if (m <= 0) continue;
        out.push({ price: (m * m) / scale, deg: 0, tag: m + '²' });
        out.push({ price: (m * m + m) / scale, deg: 45, tag: m + '²+' + m });
      }
      return out.sort((a, b) => a.price - b.price);
    }
    const divs = base === 'hex' ? 6 : (base === '360' ? 24 : 8);
    const stepDeg = 360 / divs, root = Math.sqrt(P), dRoot = 2 / divs;
    for (let k = -turns * divs; k <= turns * divs; k++) {
      if (k === 0) continue;
      const r = root + k * dRoot; if (r <= 0) continue;
      out.push({ price: (r * r) / scale, deg: ((k * stepDeg) % 360 + 360) % 360, k });
    }
    return out.sort((a, b) => a.price - b.price);
  }
  function applyGannSquare(levels, anchor, prec) {
    try { state.chart.removeIndicator({ paneId: 'candle_pane', name: 'GannSquareLevels' }); } catch (e) {}
    state.chart.createIndicator({ name: 'GannSquareLevels', paneId: 'candle_pane', extendData: { levels, anchor, prec } }, true);
    state.candleInds['GannSquareLevels'] = true;
  }
  function gannSquareModal() {
    let last = 0; try { const l = state.chart.getDataList(); last = l.length ? l[l.length - 1].close : 0; } catch (e) {}
    const prec = state.instrument.pricePrecision != null ? state.instrument.pricePrecision : 1;
    const S = window.LUN.GANNTOOLS.square || { base: '9', turns: 3, scale: 'auto' };
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    const opt = (v, t) => `<option value="${v}"${v === S.base ? ' selected' : ''}>${t}</option>`;
    const sc = S.scale || 'auto';
    const scOpt = (v, t) => `<option value="${v}"${String(v) === String(sc) ? ' selected' : ''}>${t}</option>`;
    openModal('Калькулятор квадратов Ганна', `
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
        <label>Цена (пивот)<br><input id="gsq-price" type="number" step="any" value="${last}" style="${inp};width:130px"></label>
        <label>База<br><select id="gsq-base" style="${inp}">
          ${opt('9', 'Квадрат 9 · крест 45°')}${opt('hex', 'Шестиугольник · 60°')}${opt('360', 'Круг 360° · 15°')}${opt('natural', 'Натуральные квадраты')}
        </select></label>
        <label>Масштаб цены<br><select id="gsq-scale" style="${inp}">
          ${scOpt('auto', 'авто (по цене)')}${scOpt('1', '×1 — крупные (5000+)')}${scOpt('100', '×100 — средние (1–1000)')}${scOpt('10000', '×10000 — мелкие (≤0,01)')}
        </select></label>
        <label>Оборотов (колец)<br><input id="gsq-turns" type="number" min="1" max="8" value="${S.turns}" style="${inp};width:80px"></label>
        <button id="gsq-calc" style="${btn}">Рассчитать</button>
      </div>
      <div id="gsq-out"></div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button id="gsq-apply" style="${btn};border-color:#26a69a">Нанести на график</button>
        <button id="gsq-clear" style="${btn};border-color:#8b93a7">Убрать уровни</button>
      </div>
      <p style="color:#8b93a7;margin:10px 0 0">Масштаб цены: для мелких инструментов (валюты, центовые, крипто-альты) Sq9 считается на домноженной цене. «Авто» подбирает степень 10 сам. Кардинальные углы (0/90/180/270°) — сильнейшие уровни.</p>`);
    const $ = (id) => document.getElementById(id);
    let levels = [];
    const recalc = () => {
      const price = +$('gsq-price').value, base = $('gsq-base').value, turns = +$('gsq-turns').value, scale = $('gsq-scale').value;
      window.LUN.GANNTOOLS.square = { base, turns, scale };
      levels = gannSquareLevels(price, base, turns, scale);
      if (!levels.length) { $('gsq-out').innerHTML = '<p style="color:#e0a030">Введите положительную цену.</p>'; return; }
      const rows = levels.map((L) => {
        const dist = (L.price - price) / price * 100, up = L.price >= price;
        return `<tr><td style="padding:2px 10px 2px 0;font-variant-numeric:tabular-nums">${L.price.toFixed(prec)}</td>`
          + `<td style="padding:2px 10px 2px 0;color:#8b93a7">${L.tag || (L.deg + '°')}</td>`
          + `<td style="padding:2px 10px 2px 0;color:${up ? '#ef5350' : '#26a69a'}">${up ? 'сопр.' : 'подд.'}</td>`
          + `<td style="padding:2px 0;color:#8b93a7">${dist > 0 ? '+' : ''}${dist.toFixed(2)}%</td></tr>`;
      }).join('');
      $('gsq-out').innerHTML = `<div style="max-height:330px;overflow:auto"><table style="border-collapse:collapse;font-size:12px">`
        + `<thead><tr style="color:#8b93a7;text-align:left"><th style="padding-right:10px">Уровень</th><th style="padding-right:10px">Угол</th><th style="padding-right:10px">Тип</th><th>Δ</th></tr></thead>`
        + `<tbody>${rows}</tbody></table></div>`;
    };
    $('gsq-calc').onclick = recalc;
    $('gsq-base').onchange = recalc; $('gsq-turns').onchange = recalc; $('gsq-price').onchange = recalc; $('gsq-scale').onchange = recalc;
    $('gsq-apply').onclick = () => { if (!levels.length) recalc(); if (levels.length) applyGannSquare(levels, +$('gsq-price').value, prec); };
    $('gsq-clear').onclick = () => removeCandInd('GannSquareLevels');
    recalc();
  }

  /* --- Астро-Ганн: панель ретроградностей + настройка планетарных линий --- */
  function createRetroPane() {
    state.retroPane = 'pane_retro';
    state.chart.createIndicator({ name: 'RetroStrip', paneId: state.retroPane }, false);
    wishPane(state.retroPane, { height: 84, order: 40 });
  }
  function removeRetroPane() { if (state.retroPane) { try { state.chart.removeIndicator({ paneId: state.retroPane }); } catch (e) {} state.retroPane = null; } }
  function createBradleyPane() {
    state.bradleyPane = 'pane_bradley';
    state.chart.createIndicator({ name: 'BradleyStrip', paneId: state.bradleyPane }, false);
    wishPane(state.bradleyPane, { height: 96, order: 41 });
  }
  function removeBradleyPane() { if (state.bradleyPane) { try { state.chart.removeIndicator({ paneId: state.bradleyPane }); } catch (e) {} state.bradleyPane = null; } }
  // Синастрия-динамика: панель RI(t) взаимоотношений выбранной пары карт.
  function createSynastryPane() {
    state.synPane = 'pane_synastry';
    state.chart.createIndicator({ name: 'RelationshipDyn', paneId: state.synPane, shortName: 'Синастрия' }, false);
    wishPane(state.synPane, { height: 100, order: 42 });
  }
  function removeSynastryPane() { if (state.synPane) { try { state.chart.removeIndicator({ paneId: state.synPane }); } catch (e) {} state.synPane = null; } }
  // спрятать/показать весь подвал: разворачиваем ценовую панель на весь экран
  // (state:'maximize' сворачивает остальные панели в 0), индикаторы НЕ удаляются.
  function togglePanesHidden(slot) {
    slot = slot || state; const c = slot.chart; if (!c) return;
    slot.panesHidden = !slot.panesHidden;
    try { c.setPaneOptions({ id: 'candle_pane', state: slot.panesHidden ? 'maximize' : 'normal' }); } catch (e) {}
    try { c.resize(); } catch (e) {}
  }

  // Космограмма: колесо зодиака с планетами и аспектами на выбранную дату.
  function cosmogramModal() {
    const AG = window.LUN.ASTROGANN, SIGNS = window.LUN.SIGNS;
    let ts = Date.now(); try { const l = state.chart.getDataList(); if (l.length) ts = l[l.length - 1].timestamp; } catch (e) {}
    const bodies = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
    const AC = window.LUN.ASPECT_COLORS || {};
    const ASP = [{ a: 0, sym: '☌', c: AC[0] || '#e0a030' }, { a: 60, sym: '⚹', c: AC[60] || '#4bb4e6' }, { a: 90, sym: '□', c: AC[90] || '#ef5350' }, { a: 120, sym: '△', c: AC[120] || '#26a69a' }, { a: 180, sym: '☍', c: AC[180] || '#9b6bff' }];
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    openModal('Космограмма', `
      <div style="display:flex;gap:14px;align-items:flex-end;margin-bottom:10px">
        <label>Дата/время (UTC)<br><input id="cg-date" type="datetime-local" style="${inp}"></label>
        <span style="color:#8b93a7">гео · знаки зодиака</span>
      </div>
      <div id="cg-body" style="display:flex;gap:18px;flex-wrap:wrap"></div>`);
    const dEl = document.getElementById('cg-date');
    dEl.value = new Date(ts).toISOString().slice(0, 16);
    const R = 150, cx = 170, cy = 170, rPlanet = 118, rSign = 138;
    const P = (ang, r) => [cx + r * Math.cos((90 - ang) * Math.PI / 180), cy - r * Math.sin((90 - ang) * Math.PI / 180)];
    const render = () => {
      const t = dEl.value ? new Date(dEl.value + ':00Z').getTime() : ts;
      const pos = {}; bodies.forEach((b) => { pos[b] = window.LunAstro.bodyInfo(b, t, 'geo').lon; });
      let svg = `<svg width="${cx * 2}" height="${cy * 2}" style="flex:0 0 auto">`;
      svg += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#0b0e14" stroke="#232b3a"/>`;
      for (let s = 0; s < 12; s++) {
        const a = s * 30, [x1, y1] = P(a, R), mid = P(a + 15, rSign);
        svg += `<line x1="${cx}" y1="${cy}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#1c2432"/>`;
        svg += `<text x="${mid[0].toFixed(1)}" y="${mid[1].toFixed(1)}" fill="${SIGNS[s].color}" font-size="13" text-anchor="middle" dominant-baseline="middle">${SIGNS[s].glyph}</text>`;
      }
      // аспектные линии
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        let d = Math.abs(pos[bodies[i]] - pos[bodies[j]]) % 360; if (d > 180) d = 360 - d;
        const A = ASP.find((x) => Math.abs(d - x.a) <= 5); if (!A || A.a === 0) continue;
        const p1 = P(pos[bodies[i]], rPlanet - 10), p2 = P(pos[bodies[j]], rPlanet - 10);
        svg += `<line x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" stroke="${A.c}" stroke-width="1" opacity="0.5"/>`;
      }
      bodies.forEach((b) => { const m = AG.planets[b], pt = P(pos[b], rPlanet); svg += `<text x="${pt[0].toFixed(1)}" y="${pt[1].toFixed(1)}" fill="${m.c}" font-size="14" text-anchor="middle" dominant-baseline="middle">${m.g}</text>`; });
      svg += `</svg>`;
      // таблица позиций
      let tbl = '<table style="border-collapse:collapse;font-size:12px">';
      bodies.forEach((b) => { const lon = pos[b], si = Math.floor(lon / 30) % 12, m = AG.planets[b];
        tbl += `<tr><td style="padding:2px 10px 2px 0;color:${m.c}">${m.g} ${b}</td><td style="padding:2px 8px 2px 0">${SIGNS[si].glyph} ${SIGNS[si].name}</td><td style="padding:2px 0;color:#8b93a7">${(lon - si * 30).toFixed(1)}°</td></tr>`; });
      tbl += '</table>';
      document.getElementById('cg-body').innerHTML = svg + '<div>' + tbl + '</div>';
    };
    dEl.onchange = render; render();
  }

  // редрав активных астро-индикаторов после смены планет/фрейма/масштаба
  function refreshAstroGann() {
    ['PlanetLines', 'PlanetIngress'].forEach((n) => { if (state.candleInds[n]) { try { state.chart.removeIndicator({ paneId: 'candle_pane', name: n }); state.chart.createIndicator({ name: n, paneId: 'candle_pane' }, true); } catch (e) {} } });
    if (state.retroPane) { try { state.chart.removeIndicator({ paneId: state.retroPane }); state.chart.createIndicator({ name: 'RetroStrip', paneId: state.retroPane }, false); } catch (e) {} }
  }
  function astroGannModal() {
    const AG = window.LUN.ASTROGANN;
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    const order = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
    const checks = order.map((p) => { const m = AG.planets[p]; const on = AG.linePlanets.indexOf(p) >= 0;
      return `<label style="display:inline-flex;align-items:center;gap:4px;margin:0 10px 6px 0;color:${m.c}"><input type="checkbox" data-p="${p}"${on ? ' checked' : ''}> ${m.g} ${p}</label>`; }).join('');
    openModal('Астро-Ганн — планетарные линии', `
      <div style="margin-bottom:10px">Планеты для линий:<br>${checks}</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">
        <label>Система<br><select id="ag-frame" style="${inp}">
          <option value="geo"${AG.frame === 'geo' ? ' selected' : ''}>Геоцентр (зодиак)</option>
          <option value="helio"${AG.frame === 'helio' ? ' selected' : ''}>Гелиоцентр</option></select></label>
        <label>Цена на 1° (пусто = авто)<br><input id="ag-scale" type="number" step="any" value="${AG.pricePerDeg != null ? AG.pricePerDeg : ''}" placeholder="авто" style="${inp};width:130px"></label>
        <button id="ag-apply" style="${btn};border-color:#26a69a">Применить</button>
      </div>
      <p style="color:#8b93a7;margin:10px 0 0">Долгота планеты переводится в цену. «Авто» разворачивает полный круг (360°) на видимый диапазон — линия всегда на экране. Задай цену на 1° для классического масштаба Ганна. Система (гео/гелио) действует и на ингрессии/ретро.</p>`);
    document.getElementById('ag-apply').onclick = () => {
      const chosen = order.filter((p) => { const el = document.querySelector('input[data-p="' + p + '"]'); return el && el.checked; });
      if (chosen.length) AG.linePlanets = chosen;
      AG.frame = document.getElementById('ag-frame').value;
      const sc = document.getElementById('ag-scale').value.trim();
      AG.pricePerDeg = sc === '' ? null : (+sc || null);
      refreshAstroGann();
    };
  }

  /* ---------- ценовые индикаторы (тумблеры) ---------- */
  function toggleOverlay(kind, on) {
    const c = state.chart, IND = window.LUN.INDICATORS;
    if (on) {
      let name, calcParams, styles;
      if (kind === 'SMA') { name = 'MA';  calcParams = IND.sma.periods; styles = { lines: IND.sma.colors.map((color) => ({ color })) }; }
      if (kind === 'EMA') { name = 'EMA'; calcParams = IND.ema.periods; styles = { lines: IND.ema.colors.map((color) => ({ color })) }; }
      if (kind === 'VWAP') { name = 'VWAP_BANDS'; }
      c.createIndicator({ name, calcParams, styles, paneId: 'candle_pane' }, true);
      state.overlayIds[kind] = name;      // удаляем по имени индикатора
    } else {
      c.removeIndicator({ paneId: 'candle_pane', name: state.overlayIds[kind] });
      delete state.overlayIds[kind];
    }
  }

  /* ---------- мульти-VWAP (день/неделя/месяц/все + полосы) ---------- */
  function applyVwap(slot) {
    slot = slot || state; const c = slot && slot.chart; if (!c) return;
    const list = window.LUN.INDICATORS.vwapList || [];
    let anyOn = false;
    for (let i = 0; i < 3; i++) {
      const name = 'VWAP_' + (i + 1);
      try { c.removeIndicator({ paneId: 'candle_pane', name }); } catch (e) {}
      if (list[i] && list[i].on) {
        // стиль передаём ЯВНО (ось = выбранный цвет, полосы производные) — надёжнее,
        // чем полагаться на styles-колбэк индикатора
        try { c.createIndicator({ name, paneId: 'candle_pane', styles: window.LUN.vwapStyle(list[i]) }, true); anyOn = true; } catch (e) {}
      }
    }
    slot.vwapOn = anyOn;
    const b = document.querySelector('[data-sync="vwapmulti"]'); if (b) b.classList.toggle('active', anyOn);
  }
  function vwapModal() {
    const IND = window.LUN.INDICATORS;
    const list = IND.vwapList || (IND.vwapList = []);
    const AX = window.LUN.VWAP_AXIS_COLOR || {}, OLD = window.LUN.VWAP_OLD_DEFAULTS || [];
    const isDefaultCol = (c) => OLD.indexOf(c) >= 0 || Object.keys(AX).some((k) => AX[k] === c);
    while (list.length < 3) list.push({ on: false, reset: 'day', bands: false, sigma: [1, 2], color: AX.day || '#1f9fe0', dash: 'dashed' });
    const anchors = [['day', 'день'], ['week', 'неделя'], ['month', 'месяц'], ['all', 'все бары']];
    const dashes = [['dashed', 'тире'], ['dotted', 'точки'], ['solid', 'линия']];
    const ss = 'background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:4px 8px';
    const row = (i) => { const v = list[i]; return `
      <div style="border:1px solid #232b3a;border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px">
        <label style="font-weight:600"><input type="checkbox" class="vw-on" data-i="${i}"${v.on ? ' checked' : ''}> VWAP ${['①', '②', '③'][i]}</label>
        <label>Якорь (сброс): <select class="vw-reset" data-i="${i}" style="${ss}">${anchors.map(([val, t]) => `<option value="${val}"${v.reset === val ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label><input type="checkbox" class="vw-bands" data-i="${i}"${v.bands ? ' checked' : ''}> полосы отклонений ±1σ / ±2σ (светлее оси)</label>
        <label>Тип линий отклонений: <select class="vw-dash" data-i="${i}" style="${ss}">${dashes.map(([val, t]) => `<option value="${val}"${(v.dash || 'dashed') === val ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Цвет оси: <input type="color" class="vw-color" data-i="${i}" value="${v.color}" style="width:44px;height:26px;background:#0b0e14;border:1px solid #2a3242;border-radius:6px;vertical-align:middle"></label>
      </div>`; };
    openModal('📊 VWAP — до трёх якорей', `
      <div style="display:flex;flex-direction:column;gap:12px;font-size:13px;max-width:420px">
        <div style="color:#8b93a7;font-size:12px">Несколько VWAP одновременно — например «день» + «месяц». Осевая линия — выбранного цвета (день — сине-голубой, неделя — тёмно-зелёный, месяц — розово-фиолетовый). Полосы 1σ вдвое светлее оси, 2σ — вдвое светлее 1σ. Тип линий отклонений — тире / точки / линия.</div>
        ${row(0)}${row(1)}${row(2)}
        <button id="vw-apply" style="background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:8px 16px;cursor:pointer">Применить</button>
      </div>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    // смена якоря подтягивает осевой цвет по типу — если цвет не менялся вручную
    bg.querySelectorAll('.vw-reset').forEach((sel) => sel.onchange = () => {
      const i = sel.dataset.i, colEl = bg.querySelector('.vw-color[data-i="' + i + '"]');
      if (colEl && isDefaultCol(colEl.value) && AX[sel.value]) colEl.value = AX[sel.value];
    });
    bg.querySelector('#vw-apply').onclick = () => {
      for (let i = 0; i < 3; i++) {
        list[i].on = bg.querySelector('.vw-on[data-i="' + i + '"]').checked;
        list[i].reset = bg.querySelector('.vw-reset[data-i="' + i + '"]').value;
        list[i].bands = bg.querySelector('.vw-bands[data-i="' + i + '"]').checked;
        list[i].dash = bg.querySelector('.vw-dash[data-i="' + i + '"]').value;
        list[i].color = bg.querySelector('.vw-color[data-i="' + i + '"]').value;
      }
      applyVwap(state); scheduleWsSave(); bg.remove();
    };
  }

  /* ---------- свинги Ганна (1/2/3-баровые) ---------- */
  function buildSwings(slot, nbars) {
    slot = slot || state; const c = slot && slot.chart; if (!c || !window.LunSwings) return;
    let list; try { list = c.getDataList(); } catch (e) { return; }
    if (!list || list.length < 2) { alert('Недостаточно баров для свингов.'); return; }
    const piv = window.LunSwings.computeSwings(list, nbars);
    if (piv.length < 2) { alert('Свинги не построились (мало движения).'); return; }
    slot.swings = { pivots: piv, buildTf: slot.tf.id, nbars: nbars };
    window.LUN.SWING.nbars = nbars;
    applySwings(slot);
    scheduleWsSave();
  }
  function applySwings(slot) {
    slot = slot || state; const c = slot && slot.chart; if (!c) return;
    try { c.removeIndicator({ paneId: 'candle_pane', name: 'GannSwings' }); } catch (e) {}
    const sw = slot.swings; if (!sw || !sw.pivots || sw.pivots.length < 2) { slot.swingsOn = false; syncSwingBtns(slot); return; }
    const SW = window.LUN.SWING || {};
    try { c.createIndicator({ name: 'GannSwings', paneId: 'candle_pane', extendData: { pivots: sw.pivots, nbars: sw.nbars, upColor: SW.upColor, dnColor: SW.dnColor, width: SW.width } }, true); slot.swingsOn = true; } catch (e) { slot.swingsOn = false; }
    syncSwingBtns(slot);
  }
  function removeSwings(slot) {
    slot = slot || state; const c = slot && slot.chart; if (!c) return;
    try { c.removeIndicator({ paneId: 'candle_pane', name: 'GannSwings' }); } catch (e) {}
    slot.swings = null; slot.swingsOn = false; syncSwingBtns(slot); scheduleWsSave();
  }
  function syncSwingBtns(slot) {
    slot = slot || state;
    if (slot !== state) return;   // кнопки отражают только активную ячейку
    const n = slot.swings && slot.swingsOn ? slot.swings.nbars : 0;
    document.querySelectorAll('[data-sync^="swing:"]').forEach((b) => { b.classList.toggle('active', +b.dataset.sync.split(':')[1] === n); });
  }

  /* ---------- настройки рисования (притяжка + Gann Box прогноз) ---------- */
  function drawSettingsModal() {
    const B = window.LUN.GANNTOOLS.box || (window.LUN.GANNTOOLS.box = {});
    const cnt = Math.max(1, Math.min(3, B.forecastCount || 2));
    const ss = 'background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:4px 8px';
    openModal('✏️ Настройки рисования', `
      <div style="display:flex;flex-direction:column;gap:14px;font-size:13px;max-width:440px">
        <label style="display:flex;gap:8px;align-items:flex-start">
          <input type="checkbox" id="ds-snap"${window.LUN.SNAP ? ' checked' : ''} style="margin-top:2px">
          <span><b>Притяжка к вершинам/низинам баров</b><br><span style="color:#8b93a7;font-size:12px">Начало линий, лучей, прямоугольников и углов Ганна прилипает к High/Low бара — но только вблизи вершины (за ~1 бар). Дальше — рисуется в месте тыка (чистое поле).</span></span>
        </label>
        <div style="border-top:1px solid #232b3a;padding-top:12px">
          <label style="display:flex;gap:8px;align-items:flex-start">
            <input type="checkbox" id="ds-fc"${B.forecast ? ' checked' : ''} style="margin-top:2px">
            <span><b>Прогнозные Gann Box по диагонали</b><br><span style="color:#8b93a7;font-size:12px">При построении Gann Box автоматически строятся его проекции вправо-вверх по диагонали.</span></span>
          </label>
          <label style="display:block;margin-top:8px">Сколько прогнозных боксов:
            <select id="ds-fc-n" style="${ss}">${[1, 2, 3].map((n) => `<option value="${n}"${n === cnt ? ' selected' : ''}>${n}</option>`).join('')}</select>
          </label>
          <label style="display:block;margin-top:8px">Направление прогноза:
            <select id="ds-fc-dir" style="${ss}">${[['auto', 'по направлению бокса'], ['up', 'вправо-вверх'], ['down', 'вправо-вниз']].map(([v, t]) => `<option value="${v}"${(B.forecastDir || 'auto') === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
          </label>
        </div>
        <button id="ds-apply" style="background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:8px 16px;cursor:pointer">Применить</button>
      </div>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    bg.querySelector('#ds-apply').onclick = () => {
      window.LUN.SNAP = bg.querySelector('#ds-snap').checked;
      B.forecast = bg.querySelector('#ds-fc').checked;
      B.forecastCount = +bg.querySelector('#ds-fc-n').value || 2;
      B.forecastDir = bg.querySelector('#ds-fc-dir').value;
      scheduleWsSave(); bg.remove();
    };
  }

  /* ---------- загрузка инструмента/ТФ ---------- */
  async function load(slot) {
    slot = slot || state;
    const c = slot.chart, ins = slot.instrument, tf = slot.tf;
    // рисунки — ПЕР-ИНСТРУМЕНТ: при смене инструмента прячем текущие в хранилище,
    // очищаем поле, а рисунки нового инструмента восстанавливаем после загрузки.
    const insId = favId(ins);
    const insChanged = !!(slot._loadedInsId && slot._loadedInsId !== insId);
    if (slot._loadedInsId && slot._loadedInsId !== insId) {
      slot.drawStore = slot.drawStore || {};
      slot.drawStore[slot._loadedInsId] = Object.values(slot.drawings || {}).map((d) => ({ name: d.name, points: clonePoints(d.points), extendData: d.extendData, styles: d.styles, lock: d.lock }));
      Object.keys(slot.drawings || {}).forEach((id) => { try { c.removeOverlay(id); } catch (e) {} });
      slot.drawings = {};
    }
    slot._loadedInsId = insId;
    const ticker = await window.LunData.resolveTicker(ins);
    // старый лоадер помечаем stale ДО setSymbol/setPeriod: их getBars идут на него
    // и не должны загрузить/перетереть прошлый ТФ (гонка «соскока» на пред. ТФ).
    if (slot.loader) slot.loader.stale = true;
    slot.loader = window.LunData.makeDataLoader();   // держим ссылку — через неё поток толкает свечи
    c.setSymbol({
      ticker, symbol: ticker, provider: ins.provider || 'moex',
      pricePrecision: ins.pricePrecision, volumePrecision: ins.volumePrecision,
      engine: ins.engine || 'futures', market: ins.market || 'forts', type: ins.type || 'futures',
    });
    c.setPeriod({ span: tf.span, type: tf.type });
    c.setDataLoader(slot.loader);
    if (slot === state) document.getElementById('sym-title').textContent = `${ins.title}  ·  ${ticker}  ·  ${tf.title}`;
    // подключить/переподключить поток после подгрузки истории (НЕ в реплее —
    // иначе живые бары «настоящего» перебьют симуляцию прошлого)
    const replaying = window.LUN_REPLAY && window.LUN_REPLAY.on;
    if (window.LunStream && !replaying) setTimeout(() => window.LunStream.attach(slot), 700);
    // авто-коннектор: включить поток нужного рынка для активного графика
    if (slot === state && !replaying) setTimeout(applyAutoConnect, 750);
    // новости: обновить список/метку настроения под новый инструмент
    if (slot === state && (newsOpen || newsMoodEnabled)) setTimeout(() => loadNews(), 400);
    // обновить наложение 2-го графика под новый ТФ/инструмент
    if (slot.compareInstrument) setTimeout(() => refreshCompare(slot), 800);
    // обновить ОИ под новый инструмент
    if (slot.oiPane) setTimeout(() => rebuildOI(slot), 900);
    // пересчитать арбитражный спред под новый ТФ
    if (slot.arbBundle) setTimeout(() => buildArb(slot, slot.arbBundle), 1000);
    // пересчитать базис к споту
    if (slot.basisPane) setTimeout(() => rebuildBasis(slot), 1100);
    // восстановить рисунки нового инструмента (после подгрузки истории)
    if (slot.drawStore && slot.drawStore[insId] && slot.drawStore[insId].length) {
      setTimeout(() => {
        (slot.drawStore[insId] || []).forEach((d) => {
          try { const id = c.createOverlay(Object.assign({ name: d.name, points: clonePoints(d.points), extendData: d.extendData, styles: d.styles, lock: d.lock }, overlayEvents())); const oid = (typeof id === 'string') ? id : (Array.isArray(id) ? id[0] : null); if (oid) slot.drawings[oid] = d; } catch (e) {}
        });
      }, 950);
    }
    if (!replaying) setTimeout(() => setInitialView(slot), 900);   // дефолт-обзор по ТФ
    // свинги: строились на своём ТФ и хранятся по timestamp — при смене ТФ они
    // остаются (не перестраиваются). При смене ИНСТРУМЕНТА (insChanged) — снимаем.
    if (insChanged) { slot.swings = null; slot.swingsOn = false; }
    setTimeout(() => { try { applySwings(slot); } catch (e) {} }, 960);
    // много-экранное зеркало рисунков (одинаковый инструмент) — после отрисовки истории
    if (slot === state && slots.length > 1) setTimeout(() => { try { mirrorToSiblings(state); } catch (e) {} }, 1050);
    if (slot === state) scheduleWsSave();   // авто-сохранение рабочего стола
  }
  // стартовый обзор: сколько истории показать по ТФ (D1 ≈ 3 мес, H1 ≈ 1 мес)
  function setInitialView(slot) {
    if (window.LUN_REPLAY && window.LUN_REPLAY.on) return;
    if (slot.g11 && slot.g11.on) return;              // фикс-поле 1×1 масштабирует само
    const c = slot.chart; let l; try { l = c.getDataList(); } catch (e) { return; } if (!l || !l.length) return;
    const tf = slot.tf;
    const bars = tf.type === 'day' ? 66 : tf.type === 'hour' ? 360 : (tf.span >= 15 ? 400 : 300);
    const w = (slot.cellEl && slot.cellEl.clientWidth) || 900;
    try { c.setBarSpace(Math.max(2, Math.min(18, w / bars))); } catch (e) {}
    try { if (!slot.forecastOn) c.setOffsetRightDistance(80); if (c.scrollToRealTime) c.scrollToRealTime(); } catch (e) {}
  }

  function reloadAllSlots() { slots.forEach((s) => load(s)); }

  /* ---------- РЕПЛЕЙ (симуляция: откат к периоду + шаг вперёд) ----------------
   * Идея: cutoff по времени (window.LUN_REPLAY.at). data.js отдаёт бары только
   * до cutoff, остальное прячет в loader.replayBuffer. Шаг вперёд «доливает»
   * следующие бары через realtime-колбэк (pushBar) — без перезагрузки. Работает
   * на ВСЕХ слотах/ТФ сразу, астро/Ганн считаются на момент cutoff. */
  window.LUN_REPLAY = window.LUN_REPLAY || { on: false, at: 0 };
  let replayTimer = null;
  const REPLAY_PERIOD_MS = { minute: 60000, hour: 3600000, day: 86400000 };
  const tfMsOf = (tf) => (REPLAY_PERIOD_MS[tf.type] || 3600000) * (tf.span || 1);
  function startReplay(atTs) {
    if (!atTs) return;
    try { if (window.LunStream) window.LunStream.detachAll(); } catch (e) {}   // глушим живой поток
    window.LUN_REPLAY = { on: true, at: atTs };
    reloadAllSlots();                       // getBars обрежет до cutoff и заполнит буферы
    // держим текущий бар около ЦЕНТРА (справа остаётся место «в будущее»),
    // а не прижимаем к правому краю. Ставим большой правый офсет.
    setTimeout(() => { slots.forEach((s) => { try { const w = (s.cellEl && s.cellEl.clientWidth) || 800; s.chart.setOffsetRightDistance(Math.round(w * 0.5)); if (s.chart.scrollToRealTime) s.chart.scrollToRealTime(); } catch (e) {} }); }, 1200);
    showReplayBar(); updateReplayBar();
  }
  // синхронизировать остальные слоты по времени до ts (у каждого свой ТФ)
  function syncSlotsTo(ts) {
    slots.forEach((o) => {
      if (o === state) return; const b = o.loader && o.loader.replayBuffer; if (!b || !b.length) return;
      let pushed = false;
      while (b.length && b[0].timestamp <= ts) { const bar = b.shift(); try { if (o.loader.pushBar) { o.loader.pushBar(bar); pushed = true; } } catch (e) {} }
      if (pushed) { try { if (o.chart.scrollToRealTime) o.chart.scrollToRealTime(); } catch (e) {} }
    });
  }
  // ШАГ вперёд: раскрываем N баров активного слота ПО СЧЁТУ (детерминированно),
  // остальные слоты подтягиваем по времени; следуем к правому краю.
  function stepReplay(nBars) {
    if (!window.LUN_REPLAY.on) return;
    const s = state, buf = s.loader && s.loader.replayBuffer;
    if (!buf || !buf.length) { pauseReplay(); return; }
    let lastTs = window.LUN_REPLAY.at, pushed = false;
    for (let k = 0; k < (nBars || 1) && buf.length; k++) { const bar = buf.shift(); try { if (s.loader.pushBar) { s.loader.pushBar(bar); pushed = true; } } catch (e) {} lastTs = bar.timestamp; }
    window.LUN_REPLAY.at = lastTs;
    if (pushed) { try { if (s.chart.scrollToRealTime) s.chart.scrollToRealTime(); } catch (e) {} }
    syncSlotsTo(lastTs);
    if (typeof simMarkStep === 'function') simMarkStep();
    updateReplayBar();
    if (!buf.length) pauseReplay();
  }
  let replaySpeed = 700;
  function playReplay() { if (replayTimer) return; replayTimer = setInterval(() => stepReplay(1), replaySpeed); updateReplayBar(); }
  function pauseReplay() { if (replayTimer) { clearInterval(replayTimer); replayTimer = null; } updateReplayBar(); }
  function stopReplay() { pauseReplay(); window.LUN_REPLAY = { on: false, at: 0 }; reloadAllSlots(); hideReplayBar(); }

  /* ---------- Paper-трейдинг: сделки, авто-закрытие по TP/SL, PnL ---------- */
  const SIM = { open: [], trades: [], settings: { rr: 2, riskPct: 1 } };
  function simOpen(dir) {
    if (!slots[activeIdx]) return;
    const c = state.chart; let l; try { l = c.getDataList(); } catch (e) { return; }
    if (!l.length) { alert('Нет данных для сделки.'); return; }
    const bar = l[l.length - 1], entry = bar.close, ts = bar.timestamp;
    const risk = entry * (SIM.settings.riskPct / 100);
    const sl = dir === 'long' ? entry - risk : entry + risk;
    const tp = dir === 'long' ? entry + risk * SIM.settings.rr : entry - risk * SIM.settings.rr;
    const dayMs = Math.max(tfMsOf(state.tf), 3600000);
    let ovId = null;
    const ed = { entry: entry, tp: tp, sl: sl, rr: SIM.settings.rr, dir: dir, entryTs: ts, endTs: ts + dayMs, style: defOvStyle() };
    try { const id = c.createOverlay(Object.assign({ name: 'lun_pos', points: [{ timestamp: ts, value: entry }], extendData: ed }, overlayEvents())); ovId = (typeof id === 'string') ? id : (Array.isArray(id) ? id[0] : null); } catch (e) {}
    SIM.open.push({ dir, entry, sl, tp, ts, ins: (state.instrument.title || state.instrument.id), slot: activeIdx, lastIdx: l.length - 1, ovId, rr: SIM.settings.rr });
    updateReplayBar();
  }
  // подвинуть правый край коробки позиции ко времени endTs (продление до закрытия)
  function posExtend(pos, endTs) {
    if (!pos.ovId) return; const s = slots[pos.slot]; if (!s) return;
    try { s.chart.overrideOverlay({ id: pos.ovId, extendData: { entry: pos.entry, tp: pos.tp, sl: pos.sl, rr: pos.rr, dir: pos.dir, entryTs: pos.ts, endTs: Math.max(endTs, pos.ts + 3600000), style: defOvStyle() } }); } catch (e) {}
  }
  function closeTrade(pos, exit, ts, reason) {
    const pnlPct = (pos.dir === 'long' ? (exit - pos.entry) / pos.entry : (pos.entry - exit) / pos.entry) * 100;
    const rMult = SIM.settings.riskPct ? pnlPct / SIM.settings.riskPct : 0;   // в R (TP=+rr, SL=−1)
    SIM.trades.push({ dir: pos.dir, ins: pos.ins, entry: pos.entry, exit, ts: pos.ts, exitTs: ts, reason, pnlPct, rMult });
    posExtend(pos, ts);                              // закрепляем коробку до даты закрытия (оставляем на графике)
  }
  // проверка открытых позиций против новых баров (вызывается на каждом шаге реплея)
  function simMarkStep() {
    if (!SIM.open.length) return;
    SIM.open = SIM.open.filter((pos) => {
      const s = slots[pos.slot]; if (!s) return true;
      let l; try { l = s.chart.getDataList(); } catch (e) { return true; }
      for (let i = pos.lastIdx + 1; i < l.length; i++) {
        const b = l[i]; pos.lastIdx = i;
        const hitSl = pos.dir === 'long' ? b.low <= pos.sl : b.high >= pos.sl;
        const hitTp = pos.dir === 'long' ? b.high >= pos.tp : b.low <= pos.tp;
        if (hitSl) { closeTrade(pos, pos.sl, b.timestamp, 'SL'); return false; }   // консервативно: стоп раньше цели
        if (hitTp) { closeTrade(pos, pos.tp, b.timestamp, 'TP'); return false; }
      }
      if (l.length) posExtend(pos, l[l.length - 1].timestamp);   // тянем коробку до текущего бара
      return true;
    });
    updateReplayBar();
  }
  function simCloseAll() {
    SIM.open.forEach((pos) => {
      const s = slots[pos.slot]; let l; try { l = s.chart.getDataList(); } catch (e) { l = null; }
      const b = l && l.length ? l[l.length - 1] : null; if (!b) return;
      closeTrade(pos, b.close, b.timestamp, 'закрыто');
    });
    SIM.open = []; updateReplayBar();
  }
  function simResultsModal() {
    const T = SIM.trades;
    const wins = T.filter((t) => t.pnlPct > 0).length, wr = T.length ? (wins / T.length * 100) : 0;
    const sumR = T.reduce((a, t) => a + t.rMult, 0), sumPnl = T.reduce((a, t) => a + t.pnlPct, 0);
    const rows = T.map((t, i) => {
      const d = new Date(t.exitTs); const dd = ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
      const c = t.pnlPct >= 0 ? '#26a69a' : '#ef5350';
      return `<tr><td>${i + 1}</td><td>${t.ins}</td><td style="color:${t.dir === 'long' ? '#26a69a' : '#ef5350'}">${t.dir === 'long' ? 'ЛОНГ' : 'ШОРТ'}</td><td style="text-align:right">${t.entry.toFixed(2)}</td><td style="text-align:right">${t.exit.toFixed(2)}</td><td style="text-align:center">${t.reason}</td><td style="text-align:right;color:${c}">${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct.toFixed(2)}%</td><td style="text-align:right;color:${c}">${t.rMult >= 0 ? '+' : ''}${t.rMult.toFixed(2)}R</td><td style="text-align:right">${dd}</td></tr>`;
    }).join('') || '<tr><td colspan="9" style="color:#6b7280;padding:8px">Сделок пока нет. Открывай Лонг/Шорт в панели симулятора.</td></tr>';
    openModal('📊 Результаты симуляции', `
      <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px">
        <div><div style="color:#8b93a7;font-size:11px">Сделок</div><b style="font-size:16px">${T.length}</b></div>
        <div><div style="color:#8b93a7;font-size:11px">Винрейт</div><b style="font-size:16px;color:${wr >= 50 ? '#26a69a' : '#e0c040'}">${wr.toFixed(0)}%</b></div>
        <div><div style="color:#8b93a7;font-size:11px">Сумма PnL</div><b style="font-size:16px;color:${sumPnl >= 0 ? '#26a69a' : '#ef5350'}">${sumPnl >= 0 ? '+' : ''}${sumPnl.toFixed(2)}%</b></div>
        <div><div style="color:#8b93a7;font-size:11px">Сумма R</div><b style="font-size:16px;color:${sumR >= 0 ? '#26a69a' : '#ef5350'}">${sumR >= 0 ? '+' : ''}${sumR.toFixed(2)}R</b></div>
        <div style="flex:1"></div>
        <button id="sim-csv" style="align-self:center;background:#123a2a;color:#8fe0b8;border:1px solid #2a5a3a;border-radius:6px;padding:5px 10px;cursor:pointer">⬇ Excel (CSV)</button>
        <button id="sim-txt" style="align-self:center;background:#1f2b3d;color:#9cc7f0;border:1px solid #3aa0ff;border-radius:6px;padding:5px 10px;cursor:pointer">⬇ TXT</button>
        <button id="sim-clear" style="align-self:center;background:#3a1a20;color:#ef8a8a;border:1px solid #5a2a30;border-radius:6px;padding:5px 10px;cursor:pointer">Очистить журнал</button>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:300px">
          <div style="color:#3aa0ff;font-size:12px;margin-bottom:4px">Кривая доходности (R, накопительно)</div>
          <canvas id="sim-eq" width="460" height="200" style="width:100%;max-width:460px;background:#0b0e14;border:1px solid #232b3a;border-radius:6px"></canvas>
        </div>
        <div style="flex:1;min-width:320px;max-height:230px;overflow:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="color:#8b93a7;text-align:left;position:sticky;top:0;background:#121722"><th>#</th><th>Инстр</th><th>Напр</th><th style="text-align:right">Вход</th><th style="text-align:right">Выход</th><th>Итог</th><th style="text-align:right">PnL</th><th style="text-align:right">R</th><th style="text-align:right">Дата</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
      <p style="color:#6b7280;font-size:11px;margin-top:8px">Авто-закрытие: касание TP/SL внутри бара (при совпадении в одном баре — сначала стоп). R:R и риск задаются в панели симулятора. Исследовательский тест — не гарантия результата.</p>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    bg.querySelector('#sim-clear').onclick = () => { SIM.trades = []; bg.remove(); updateReplayBar(); };
    bg.querySelector('#sim-csv').onclick = () => simExport('csv');
    bg.querySelector('#sim-txt').onclick = () => simExport('txt');
    // equity-кривая
    const cv = bg.querySelector('#sim-eq'); if (cv && cv.getContext) {
      const ctx = cv.getContext('2d'), W = cv.width, Hh = cv.height;
      let cum = 0; const pts = [0]; T.forEach((t) => { cum += t.rMult; pts.push(cum); });
      const mn = Math.min(0, ...pts), mx = Math.max(0.5, ...pts), rng = (mx - mn) || 1;
      const x = (i) => 6 + i * (W - 12) / Math.max(1, pts.length - 1), y = (v) => Hh - 6 - (v - mn) / rng * (Hh - 12);
      ctx.strokeStyle = '#2a3242'; ctx.beginPath(); ctx.moveTo(0, y(0)); ctx.lineTo(W, y(0)); ctx.stroke();
      ctx.strokeStyle = cum >= 0 ? '#26a69a' : '#ef5350'; ctx.lineWidth = 1.8; ctx.beginPath();
      pts.forEach((v, i) => { const px = x(i), py = y(v); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }); ctx.stroke();
    }
  }

  // экспорт журнала сделок в CSV (Excel) или TXT — скачивание файлом
  function simExport(fmt) {
    const T = SIM.trades;
    if (!T.length) { alert('Нет сделок для экспорта. Сначала проведите сделки в симуляторе.'); return; }
    const p2 = (n) => ('0' + n).slice(-2);
    const fmtTs = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); };
    const headers = ['#', 'Инструмент', 'Направление', 'Вход', 'Выход', 'Открыта', 'Закрыта', 'Итог', 'PnL_%', 'R'];
    const rows = T.map((t, i) => [i + 1, t.ins, t.dir === 'long' ? 'ЛОНГ' : 'ШОРТ', t.entry, t.exit, fmtTs(t.ts), fmtTs(t.exitTs), t.reason, t.pnlPct.toFixed(2), t.rMult.toFixed(2)]);
    const wins = T.filter((t) => t.pnlPct > 0).length, wr = T.length ? (wins / T.length * 100) : 0;
    const sumR = T.reduce((a, t) => a + t.rMult, 0), sumPnl = T.reduce((a, t) => a + t.pnlPct, 0);
    let content, mime, ext;
    if (fmt === 'csv') {
      const esc = (v) => { const s = String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const lines = [headers.join(';')];                   // ; — Excel-RU открывает по столбцам
      rows.forEach((r) => lines.push(r.map(esc).join(';')));
      lines.push('');
      lines.push(['Итого', 'сделок=' + T.length, 'винрейт=' + wr.toFixed(0) + '%', 'сумма PnL=' + sumPnl.toFixed(2) + '%', 'сумма R=' + sumR.toFixed(2)].join(';'));
      content = '﻿' + lines.join('\r\n');              // BOM — кириллица в Excel
      mime = 'text/csv;charset=utf-8'; ext = 'csv';
    } else {
      const w = [3, 12, 11, 11, 11, 17, 17, 10, 9, 8];
      const pad = (v, n) => { const s = String(v); return s.length >= n ? s : s + ' '.repeat(n - s.length); };
      const line = (arr) => arr.map((v, k) => pad(v, w[k])).join(' ');
      const lines = ['Журнал сделок — Lun_term (' + fmtTs(Date.now()) + ')', '', line(headers), '-'.repeat(w.reduce((a, b) => a + b + 1, 0))];
      rows.forEach((r) => lines.push(line(r)));
      lines.push('');
      lines.push('Сделок: ' + T.length + '   Винрейт: ' + wr.toFixed(0) + '%   Сумма PnL: ' + sumPnl.toFixed(2) + '%   Сумма R: ' + sumR.toFixed(2));
      lines.push('Исследовательский тест — не гарантия результата.');
      content = lines.join('\r\n'); mime = 'text/plain;charset=utf-8'; ext = 'txt';
    }
    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob), a = document.createElement('a'), now = new Date();
      a.href = url; a.download = 'lun_trades_' + now.getFullYear() + p2(now.getMonth() + 1) + p2(now.getDate()) + '_' + p2(now.getHours()) + p2(now.getMinutes()) + '.' + ext;
      document.body.appendChild(a); a.click();
      setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch (e) {} }, 200);
    } catch (e) { alert('Не удалось сформировать файл: ' + e.message); }
  }

  let replayBarEl = null;
  function showReplayBar() {
    if (replayBarEl) { replayBarEl.style.display = 'flex'; return; }
    const el = document.createElement('div'); el.id = 'replay-bar';
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:34px;z-index:300;display:flex;align-items:center;gap:5px;flex-wrap:wrap;justify-content:center;max-width:96vw;background:#121722;border:1px solid #2a3a4f;border-radius:10px;padding:6px 10px;box-shadow:0 8px 30px rgba(0,0,0,.5);font-size:13px;color:#d7deea';
    const mk = (t, title, fn, bg, bc) => { const b = document.createElement('button'); b.textContent = t; b.title = title; b.style.cssText = 'background:' + (bg || '#1a2130') + ';color:#d7deea;border:1px solid ' + (bc || '#2a3242') + ';border-radius:6px;padding:4px 9px;cursor:pointer;font-size:13px'; b.onclick = fn; el.appendChild(b); return b; };
    const sep = () => { const s = document.createElement('span'); s.textContent = '·'; s.style.color = '#3a4150'; el.appendChild(s); };
    // время
    mk('⏭', 'шаг вперёд (1 бар)', () => stepReplay(1));
    mk('⏩', '+10 баров', () => stepReplay(10));
    el._play = mk('▶', 'играть/пауза', () => { if (replayTimer) pauseReplay(); else playReplay(); });
    const spd = document.createElement('select'); spd.title = 'скорость'; spd.style.cssText = 'background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:3px'; [['0.3с', 300], ['0.7с', 700], ['1.5с', 1500]].forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === replaySpeed) o.selected = true; spd.appendChild(o); }); spd.onchange = () => { replaySpeed = +spd.value; if (replayTimer) { pauseReplay(); playReplay(); } }; el.appendChild(spd);
    el._time = document.createElement('span'); el._time.style.cssText = 'color:#8b93a7;min-width:118px;text-align:center'; el.appendChild(el._time);
    sep();
    // сделки: R:R, риск, лонг/шорт/закрыть
    const rr = document.createElement('select'); rr.title = 'R:R (риск:вознаграждение)'; rr.style.cssText = 'background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:3px'; [['1:1', 1], ['1:2', 2], ['1:3', 3], ['1:5', 5]].forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === SIM.settings.rr) o.selected = true; rr.appendChild(o); }); rr.onchange = () => { SIM.settings.rr = +rr.value; }; el.appendChild(rr);
    const risk = document.createElement('input'); risk.type = 'number'; risk.step = '0.1'; risk.min = '0.1'; risk.value = SIM.settings.riskPct; risk.title = 'риск, % (расстояние до стопа)'; risk.style.cssText = 'width:52px;background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:3px'; risk.onchange = () => { SIM.settings.riskPct = Math.max(0.1, +risk.value || 1); }; el.appendChild(risk);
    const rlab = document.createElement('span'); rlab.textContent = '% риск'; rlab.style.color = '#8b93a7'; el.appendChild(rlab);
    mk('🟢 Лонг', 'открыть лонг по последней цене', () => simOpen('long'), '#123a2a', '#2a5a3a');
    mk('🔴 Шорт', 'открыть шорт по последней цене', () => simOpen('short'), '#3a1a20', '#5a2a30');
    mk('✕', 'закрыть все открытые по рынку', () => simCloseAll());
    el._pos = document.createElement('span'); el._pos.style.cssText = 'color:#8b93a7;font-size:12px'; el.appendChild(el._pos);
    sep();
    mk('📊 Результаты', 'таблица сделок + кривая доходности', () => simResultsModal(), '#1f2b3d', '#3aa0ff');
    mk('■', 'выйти из реплея', () => stopReplay(), '#2a1418', '#5a2a30');
    document.body.appendChild(el); replayBarEl = el;
  }
  function hideReplayBar() { if (replayBarEl) replayBarEl.style.display = 'none'; }
  function updateReplayBar() {
    if (!replayBarEl) return;
    if (replayBarEl._play) replayBarEl._play.textContent = replayTimer ? '⏸' : '▶';
    const d = new Date(window.LUN_REPLAY.at); const p = (x) => (x < 10 ? '0' + x : x);
    if (replayBarEl._time) replayBarEl._time.textContent = window.LUN_REPLAY.on ? (p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())) : '';
    if (replayBarEl._pos) replayBarEl._pos.textContent = 'откр: ' + SIM.open.length + ' · закр: ' + SIM.trades.length;
  }
  function replayStartModal() {
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1c3a2a;color:#d7deea;border:1px solid #2a5a3a;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    let def = new Date(Date.now() - 90 * 86400000);
    try { const l = state.chart.getDataList(); if (l && l.length) def = new Date(l[Math.floor(l.length * 0.6)].timestamp); } catch (e) {}
    const ds = def.toISOString().slice(0, 10);
    openModal('🧪 Откат к периоду (реплей)', `
      <p style="color:#8b93a7">График откатится к выбранной дате; кнопками ⏭/▶ идёшь вперёд по барам. Работают <b>все ТФ, все астро и Ганн-инструменты</b> на момент отката — как реальная торговля в прошлом. Нужна загруженная история (углуби «Период»).</p>
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">
        <label>Дата отката<br><input id="rp-date" type="date" value="${ds}" style="${inp}"></label>
        <button id="rp-go" style="${btn}">Начать реплей</button>
      </div>
      <p style="color:#6b7280;font-size:11px;margin-top:8px">Шаг = один бар активного ТФ. Позиции (paper) добавим отдельным инструментом.</p>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    bg.querySelector('#rp-go').onclick = () => { const v = bg.querySelector('#rp-date').value; const ts = v ? Date.parse(v + 'T00:00:00') : 0; if (!ts) { alert('Укажите дату.'); return; } bg.remove(); startReplay(ts); };
  }
  function buildSim() {
    const wrap = document.getElementById('sim'); if (!wrap) return; wrap.innerHTML = '';
    mkBtn(wrap, '⏪ Откат к периоду (реплей)…', () => { closeMenus(); replayStartModal(); }, false, 'Откатить график к дате и идти вперёд по барам — тест стратегий на всех ТФ с астро/Ганн');
    mkBtn(wrap, '📊 Результаты (журнал + доходность)', () => { closeMenus(); simResultsModal(); }, false, 'Таблица сделок, винрейт, сумма R и кривая доходности');
    mkBtn(wrap, '■ Выйти из реплея', () => { closeMenus(); stopReplay(); }, false, 'Вернуть полные данные');
    const note = document.createElement('div'); note.className = 'menu-note';
    note.innerHTML = 'Внизу — панель симулятора: ⏭/⏩/▶ шаг вперёд, дата периода, R:R и % риска, 🟢 Лонг / 🔴 Шорт (открыть по последней цене), 📊 Результаты.<br>Сделки закрываются <b>автоматически</b> по касанию TP/SL; итог — в «Результаты» (таблица + кривая доходности в R).<br>Клавиши: <b>W</b> — реплей вкл/выкл · <b>K</b> — играть/пауза · <b>N</b> — +1 бар · <b>J</b> — +10 баров.';
    wrap.appendChild(note);
    // горячие клавиши симулятора
    // Симулятор: ` (тильда, левее «1») — старт/выход; Пробел — +1 бар; Tab — +10 баров.
    regHotkey('`', () => { if (window.LUN_REPLAY.on) stopReplay(); else replayStartModal(); });
    regHotkey('k', () => { if (window.LUN_REPLAY.on) { if (replayTimer) pauseReplay(); else playReplay(); } });
    regHotkey('space', () => { if (!window.LUN_REPLAY.on) return false; stepReplay(1); });   // false → не глушим пробел вне реплея
    regHotkey('tab', () => { if (!window.LUN_REPLAY.on) return false; stepReplay(10); });     // false → Tab работает как обычно вне реплея
  }
  // модалка выбора диапазона дат «от–до»
  function historyModal(onApply) {
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    const today = new Date().toISOString().slice(0, 10);
    const yearAgo = new Date(Date.now() - 366 * 86400000).toISOString().slice(0, 10);
    openModal('Период графика — от и до', `
      <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap">
        <label>От<br><input id="hm-from" type="date" value="${yearAgo}" max="${today}" style="${inp}"></label>
        <label>До<br><input id="hm-till" type="date" value="${today}" max="${today}" style="${inp}"></label>
        <button id="hm-apply" style="${btn};border-color:#26a69a">Загрузить</button>
      </div>
      <p style="color:#8b93a7;margin:10px 0 0">Диапазон применяется ко всем окнам. Для глубокой истории используйте D1/H1 — внутридневные M5/M15 у MOEX ограничены доступной 1-минутной историей.</p>`);
    document.getElementById('hm-apply').onclick = () => {
      const f = document.getElementById('hm-from').value, t = document.getElementById('hm-till').value;
      if (!f || !t || f >= t) { alert('Проверьте даты: «от» должно быть раньше «до».'); return; }
      onApply(f, t);
      const bg = document.querySelector('.lun-modal-bg'); if (bg) bg.remove();
    };
  }

  /* ---------- инструменты рисования ---------- */
  const DRAW_TOOLS = [
    { id: 'horizontalStraightLine', label: 'Уровень',       key: 't' },
    { id: 'segment',                label: 'Трендовая',     key: 'l' },
    { id: 'lun_rect',               label: 'Прямоугольник', key: 'r' },
    { id: 'lun_arrow',              label: 'Стрелка',       key: 'a' },
    { id: 'lun_text',               label: 'Текст',         key: 'x' },
    { id: 'lun_gann',               label: 'Ган 1×1',       key: 'g' },
    { id: 'lun_hray',               label: 'Луч ⨯N',        key: 'h' },
    { id: 'lun_vline',              label: 'Вертикаль (дата)', key: 'v' },
    { id: 'lun_pos',                label: 'Позиция ⇅ (вход→цель)', key: 'p' },
    { id: 'lun_vprofile',           label: 'Об.профиль',    key: 'd' },
  ];
  /* Ctrl + перетаскивание = скопировать оверлей: в начале переноса при зажатом
   * Ctrl создаём дубликат на СТАРОМ месте, а сам оверлей уносится мышью в новое.
   * Клон получает те же обработчики — его тоже можно копировать. */
  let ctrlDown = false;
  let lastSelTs = 0;                // время последнего выделения оверлея (для авто-скрытия панели)
  let mirroring = false;            // защита от рекурсии при зеркалировании рисунков
  const clonePoints = (pts) => (pts || []).map((p) => ({ timestamp: p.timestamp, dataIndex: p.dataIndex, value: p.value }));
  const ovOf = (event) => event && (event.overlay || event.currentOverlay);
  // Зеркалирование рисунков на другие ячейки с ТЕМ ЖЕ инструментом: рисуешь на
  // одном экране — появляется на всех с этим же инструментом (в обе стороны).
  function mirrorToSiblings(src) {
    if (mirroring || !src || slots.length < 2) return;
    mirroring = true;
    try {
      const insId = favId(src.instrument);
      slots.forEach((s) => {
        if (s === src || !s.chart || favId(s.instrument) !== insId) return;
        Object.keys(s.drawings || {}).forEach((id) => { try { s.chart.removeOverlay({ id }); } catch (e) {} });
        s.drawings = {};
        Object.values(src.drawings || {}).forEach((d) => {
          try {
            const id = s.chart.createOverlay(Object.assign({ name: d.name, points: clonePoints(d.points), extendData: d.extendData, styles: d.styles, lock: d.lock }, overlayEvents()));
            const oid = (typeof id === 'string') ? id : (Array.isArray(id) ? id[0] : null); if (oid) s.drawings[oid] = d;
          } catch (e) {}
        });
      });
    } finally { mirroring = false; }
  }
  // учёт нарисованных объектов для сохранения рабочего стола
  function recordOverlay(ov) { if (!ov || !ov.id) return; state.drawings[ov.id] = { name: ov.name, points: clonePoints(ov.points), extendData: ov.extendData, styles: ov.styles, lock: !!ov.lock }; scheduleWsSave(); }
  function forgetOverlay(id) { if (id && state.drawings[id]) { delete state.drawings[id]; scheduleWsSave(); } }
  // притяжка точки к вершине/низине бара — ТОЛЬКО вблизи (в пределах ~половины
  // высоты свечи), иначе точка остаётся в месте тыка (чистое поле).
  function snapPoint(p, list) {
    if (!window.LUN.SNAP || !p || p.dataIndex == null || p.value == null || !list || !list.length) return p;
    const i = Math.round(p.dataIndex); const b = list[i]; if (!b) return p;
    let sum = 0, n = 0;
    for (let k = Math.max(0, i - 10); k <= Math.min(list.length - 1, i + 10); k++) { const bb = list[k]; if (bb) { sum += Math.abs(bb.high - bb.low); n++; } }
    const thr = (n ? sum / n : Math.abs(b.high - b.low)) * 0.6;
    const dH = Math.abs(p.value - b.high), dL = Math.abs(p.value - b.low);
    if (dH <= dL && dH <= thr) return Object.assign({}, p, { value: b.high });
    if (dL < dH && dL <= thr) return Object.assign({}, p, { value: b.low });
    return p;
  }
  const SNAP_NAMES = { lun_gann: 1, lun_hray: 1, lun_arrow: 1, lun_rect: 1, lun_gannbox: 1, lun_gannsquare: 1, segment: 1, straightLine: 1, rayLine: 1, priceLine: 1 };
  function maybeSnap(ov) {
    if (!window.LUN.SNAP || !ov || !ov.points || !SNAP_NAMES[ov.name]) return;
    let list; try { list = state.chart.getDataList(); } catch (e) { return; }
    const snapped = ov.points.map((p) => snapPoint(p, list));
    let changed = false; for (let i = 0; i < snapped.length; i++) if (snapped[i].value !== ov.points[i].value) changed = true;
    if (changed) { try { state.chart.overrideOverlay({ id: ov.id, points: snapped }); ov.points = snapped; } catch (e) {} }
  }
  // прогнозные Gann Box'ы по диагонали вправо-вверх (1..3) — от исходного бокса
  function gannBoxForecast(ov) {
    const B = window.LUN.GANNTOOLS.box || {};
    if (!B.forecast || !ov || ov.name !== 'lun_gannbox') return;
    const ed = ov.extendData && typeof ov.extendData === 'object' ? ov.extendData : {};
    if (ed.forecast) return;                     // сам прогнозный бокс — не размножаем
    const pts = ov.points || []; if (pts.length < 2) return;
    let list; try { list = state.chart.getDataList(); } catch (e) { list = []; }
    const last = list.length ? list[list.length - 1] : null;
    const step = (list.length > 1) ? (list[list.length - 1].timestamp - list[list.length - 2].timestamp) : 0;
    const i0 = pts[0].dataIndex, i1 = pts[1].dataIndex, v0 = pts[0].value, v1 = pts[1].value;
    if (i0 == null || i1 == null || v0 == null || v1 == null) return;
    // время — всегда вперёд (вправо); направление по цене — из настройки:
    // 'auto' = по направлению построения бокса (снизу-вверх → вверх), либо явно up/down.
    const dir = B.forecastDir || 'auto';
    const goUp = dir === 'up' ? true : dir === 'down' ? false : (v1 >= v0);
    const di = Math.abs(i1 - i0), dvAbs = Math.abs(v1 - v0), dv = goUp ? dvAbs : -dvAbs;
    const tsFor = (idx) => (last && step) ? last.timestamp + (idx - (list.length - 1)) * step : undefined;
    const cnt = Math.max(1, Math.min(3, B.forecastCount || 2));
    for (let k = 1; k <= cnt; k++) {
      const np = [
        { dataIndex: i0 + k * di, value: v0 + k * dv, timestamp: tsFor(i0 + k * di) },
        { dataIndex: i1 + k * di, value: v1 + k * dv, timestamp: tsFor(i1 + k * di) },
      ];
      const stt = Object.assign({}, defOvStyle(), { dash: 'dashed' });
      const ed2 = { style: stt, forecast: true };
      try {
        const id = state.chart.createOverlay(Object.assign({ name: 'lun_gannbox', points: np, extendData: ed2 }, overlayEvents()));
        const oid = (typeof id === 'string') ? id : (Array.isArray(id) ? id[0] : null);
        if (oid) state.drawings[oid] = { name: 'lun_gannbox', points: clonePoints(np), extendData: ed2 };
      } catch (e) {}
    }
    scheduleWsSave();
  }
  function overlayEvents() {
    const sel = (event) => { const ov = ovOf(event); if (ov) { lastSelTs = Date.now(); state.selectedOverlayId = ov.id; state.selectedOverlay = ov; showStylePanel(ov); } return false; };
    const rec = (event) => { const ov = ovOf(event); if (ov) { maybeSnap(ov); recordOverlay(ov); gannBoxForecast(ov); mirrorToSiblings(state); } return false; };
    // при перетаскивании т2 у линии Ганна с фикс-углом — пересчитываем угол по
    // новому положению, чтобы т2 всегда лежала на луче, а поле угла совпадало.
    const moveEnd = (event) => {
      const ov = ovOf(event); if (!ov) return false;
      if (ov.name === 'lun_gann' && ov.extendData && typeof ov.extendData === 'object' && typeof ov.extendData.gannAngle === 'number') {
        const a = gannAngleOf(ov);
        if (a != null) { ov.extendData = Object.assign({}, ov.extendData, { gannAngle: a }); try { state.chart.overrideOverlay({ id: ov.id, extendData: ov.extendData }); } catch (e) {} }
      }
      recordOverlay(ov);
      if (state.selectedOverlay && state.selectedOverlay.id === ov.id) showStylePanel(ov);
      mirrorToSiblings(state);
      return false;
    };
    return {
      onSelected: sel, onClick: sel,
      onDrawEnd: rec, onPressedMoveEnd: moveEnd,
      onRemoved: (event) => { const ov = ovOf(event); if (ov) forgetOverlay(ov.id); return false; },
      onDeselected: () => { state.selectedOverlayId = null; state.selectedOverlay = null; hideStylePanel(); return false; },
      onPressedMoveStart: (event) => {
        sel(event);
        const ov = ovOf(event);
        if (!ctrlDown || !ov) return false;
        try { state.chart.createOverlay(Object.assign({ name: ov.name, points: clonePoints(ov.points), styles: ov.styles, extendData: ov.extendData }, overlayEvents())); }
        catch (e) { /* клонирование не должно ломать перенос */ }
        return false;   // не перехватываем — оригинал продолжает тянуться мышью
      },
    };
  }
  // Delete — удалить выделенный оверлей; Ctrl+C/V — копия в буфер и вставка со сдвигом.
  // ВАЖНО: removeOverlay без объекта-фильтра сносит ВСЕ фигуры. Удаляем строго
  // по id одной выделенной ({ id }).
  function deleteSelected() {
    const id = state.selectedOverlayId;
    if (!id || typeof id !== 'string') return;
    try { state.chart.removeOverlay({ id }); } catch (e) {}
    forgetOverlay(id);
    state.selectedOverlayId = null; state.selectedOverlay = null;
    if (stylePanelEl) stylePanelEl.style.display = 'none';
    mirrorToSiblings(state);
  }
  function copySelected() {
    const ov = state.selectedOverlay || (state.chart.getOverlayById && state.chart.getOverlayById(state.selectedOverlayId));
    if (ov) { state.clipboardOverlay = { name: ov.name, points: clonePoints(ov.points), styles: ov.styles, extendData: ov.extendData }; return true; }
    return false;
  }
  function pasteOverlay() {
    const c = state.clipboardOverlay; if (!c) return false;
    const pts = c.points.map((p) => ({ timestamp: p.timestamp, dataIndex: p.dataIndex, value: (p.value != null ? p.value * 1.004 : p.value) }));  // сдвиг ↑0.4%, чтобы копия была видна
    try { state.chart.createOverlay(Object.assign({ name: c.name, points: pts, styles: c.styles, extendData: c.extendData }, overlayEvents())); return true; } catch (e) { return false; }
  }
  // Ctrl+S — скрин активного графика (PNG). +/- — зум.
  function screenshot() {
    const c = state.chart; let url = null;
    const bg = LOOK.theme === 'light' ? '#ffffff' : '#0b0e14';
    try { if (c.getConvertPictureUrl) url = c.getConvertPictureUrl(true, 'png', bg); } catch (e) {}
    if (!url) { try { const cv = state.cellEl && state.cellEl.querySelector('canvas'); if (cv && cv.toDataURL) url = cv.toDataURL('image/png'); } catch (e) {} }
    if (!url) { alert('Скрин не удался — график ещё не готов. Попробуйте ещё раз.'); return; }
    const fname = 'ag-ts_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png';
    // авто-скачивание
    try { const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); } catch (e) {}
    // и превью с кнопками (работает даже если авто-скачивание заблокировано)
    openModal('📷 Скрин графика', `
      <div style="display:flex;flex-direction:column;gap:10px">
        <img src="${url}" style="max-width:100%;border:1px solid #232b3a;border-radius:6px">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="${url}" download="${fname}" style="text-decoration:none;background:#123a2a;color:#8fe0b8;border:1px solid #2a5a3a;border-radius:6px;padding:7px 14px">⬇ Скачать PNG</a>
          <a href="${url}" target="_blank" rel="noopener" style="text-decoration:none;background:#1f2b3d;color:#9cc7f0;border:1px solid #3aa0ff;border-radius:6px;padding:7px 14px">↗ Открыть в новой вкладке</a>
        </div>
        <div style="color:#8b93a7;font-size:11px">Если файл не скачался автоматически — нажмите «Скачать PNG» или правой кнопкой по картинке → «Сохранить изображение».</div>
      </div>`);
  }
  function zoomChart(inn) {
    const c = state.chart;
    try { if (c.zoomAtCoordinate) { c.zoomAtCoordinate(inn ? 1.15 : 0.87); return; } } catch (e) {}
    try { const bs = c.getBarSpace().bar; if (c.setBarSpace) c.setBarSpace(Math.max(1, bs * (inn ? 1.15 : 0.87))); } catch (e) {}
  }

  /* ---------- панель свойств выделенного объекта ---------- */
  let stylePanelEl = null;
  function hexToRgba(hex, a) { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); if (!m) return 'rgba(240,192,64,' + a + ')'; return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')'; }
  function ensureStylePanel() {
    if (stylePanelEl) return stylePanelEl;
    const p = document.createElement('div');
    p.id = 'lun-style-panel';
    p.style.cssText = 'position:fixed;top:96px;right:12px;z-index:45;width:214px;background:#121722;border:1px solid #232b3a;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.5);padding:10px 12px;font-size:12px;color:#d7deea;display:none';
    const row = 'display:flex;justify-content:space-between;align-items:center;margin:5px 0';
    p.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b id="sp-name">Объект</b><span id="sp-close" style="cursor:pointer;color:#8b93a7;font-size:16px">×</span></div>
      <label style="${row}">Цвет <input id="sp-color" type="color" style="width:44px;height:24px;background:none;border:1px solid #232b3a;border-radius:4px"></label>
      <label style="${row}">Толщина <input id="sp-size" type="range" min="1" max="6" step="0.5" style="width:110px"></label>
      <label style="${row}">Линия <select id="sp-dash" style="background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:4px;padding:3px"><option value="solid">сплошная</option><option value="dashed">пунктир</option><option value="dotted">точки</option></select></label>
      <label style="${row}">Заливка <input id="sp-fill" type="checkbox"></label>
      <label style="${row}">🔒 Блокировка <input id="sp-lock" type="checkbox"></label>
      <div id="sp-angle-row" style="${row};display:none;border-top:1px solid #232b3a;margin-top:6px;padding-top:8px">Угол ∠ <span><input id="sp-angle" type="number" step="any" style="width:96px;background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:4px;padding:3px"> <span id="sp-angle-clr" title="Вернуть по 2 точкам" style="cursor:pointer;color:#8b93a7">↺</span></span></div>
      <button id="sp-del" style="width:100%;margin-top:8px;background:#2a1720;color:#ef8a88;border:1px solid #5a2b33;border-radius:6px;padding:6px;cursor:pointer">Удалить (Del)</button>`;
    document.body.appendChild(p);
    p.querySelector('#sp-close').onclick = hideStylePanel;
    p.querySelector('#sp-del').onclick = () => { deleteSelected(); hideStylePanel(); };
    ['#sp-color', '#sp-size', '#sp-dash', '#sp-fill', '#sp-lock'].forEach((id) => { const el = p.querySelector(id); el.oninput = applySelStyle; el.onchange = applySelStyle; });
    p.querySelector('#sp-angle').oninput = applyGannAngle;
    p.querySelector('#sp-angle-clr').onclick = () => { p.querySelector('#sp-angle').value = ''; applyGannAngle(); };
    stylePanelEl = p; return p;
  }
  const OV_NAMES = { lun_rect: 'Прямоугольник', lun_gann: 'Линия Ганна', lun_arrow: 'Стрелка', lun_hray: 'Луч ⨯N', lun_vprofile: 'Профиль объёма', lun_gannbox: 'Gann Box', lun_gannsquare: 'Квадрат Ганна', lun_text: 'Текст', horizontalStraightLine: 'Уровень', segment: 'Трендовая' };
  function showStylePanel(ov) {
    const p = ensureStylePanel();
    const ed = ov.extendData && typeof ov.extendData === 'object' ? ov.extendData : {};
    const st = Object.assign(defOvStyle(), ed.style || {});
    p.querySelector('#sp-name').textContent = OV_NAMES[ov.name] || 'Объект';
    p.querySelector('#sp-color').value = /^#([0-9a-f]{6})$/i.test(st.color) ? st.color : '#f0c040';
    p.querySelector('#sp-size').value = st.size || 1.4;
    p.querySelector('#sp-dash').value = st.dash || 'solid';
    p.querySelector('#sp-fill').checked = !!st.fill;
    p.querySelector('#sp-lock').checked = !!ov.lock;
    // строка угла — только для линии Ганна; показываем текущий (перс./общий/по 2 точкам)
    const angleRow = p.querySelector('#sp-angle-row');
    if (ov.name === 'lun_gann') {
      angleRow.style.display = '';
      const ai = p.querySelector('#sp-angle');
      if (typeof ed.gannAngle === 'number' && ed.gannAngle > 0) ai.value = ed.gannAngle;
      else { const cur = gannAngleOf(ov); ai.value = cur != null ? +cur.toFixed(cur < 10 ? 3 : 1) : ''; ai.placeholder = 'по 2 точкам'; }
    } else angleRow.style.display = 'none';
    p.style.display = 'block';
  }
  // текущий угол линии Ганна (цена/бар) по её двум точкам
  function gannAngleOf(ov) {
    const pts = ov.points || []; if (pts.length < 2) return null;
    const v0 = pts[0].value, v1 = pts[1].value, i0 = pts[0].dataIndex, i1 = pts[1].dataIndex;
    if (v0 == null || v1 == null || i0 == null || i1 == null) return null;
    const bars = Math.abs(i1 - i0) || 1; return Math.abs((v1 - v0) / bars);
  }
  function applyGannAngle() {
    const id = state.selectedOverlayId, ov = state.selectedOverlay; if (!id || !ov || !stylePanelEl) return;
    const v = stylePanelEl.querySelector('#sp-angle').value.trim();
    const ed = Object.assign({}, (ov.extendData && typeof ov.extendData === 'object') ? ov.extendData : {});
    const pts = (ov.points || []).map((p) => ({ timestamp: p.timestamp, dataIndex: p.dataIndex, value: p.value }));
    let newPoints = null;
    if (v === '' || !(+v > 0)) { delete ed.gannAngle; }
    else {
      ed.gannAngle = +v;
      // т2 ДВИГАЕТСЯ вслед за углом: ставим её значение точно на луч от т1.
      if (pts.length >= 2 && pts[0].value != null && pts[0].dataIndex != null && pts[1].dataIndex != null) {
        const dir = (pts[1].value != null && pts[1].value < pts[0].value) ? -1 : 1;
        const bars = Math.abs(pts[1].dataIndex - pts[0].dataIndex) || 1;
        pts[1].value = pts[0].value + dir * (+v) * bars;
        newPoints = pts;
      }
    }
    ov.extendData = ed; if (newPoints) ov.points = newPoints;
    try { state.chart.overrideOverlay(newPoints ? { id, extendData: ed, points: newPoints } : { id, extendData: ed }); } catch (e) {}
    recordOverlay(ov);
  }
  function hideStylePanel() { if (stylePanelEl) stylePanelEl.style.display = 'none'; }
  function applySelStyle() {
    const id = state.selectedOverlayId, ov = state.selectedOverlay; if (!id || !ov || !stylePanelEl) return;
    const color = stylePanelEl.querySelector('#sp-color').value;
    const size = +stylePanelEl.querySelector('#sp-size').value;
    const dash = stylePanelEl.querySelector('#sp-dash').value;
    const fill = stylePanelEl.querySelector('#sp-fill').checked;
    const lock = stylePanelEl.querySelector('#sp-lock').checked;
    const ed = Object.assign({}, (ov.extendData && typeof ov.extendData === 'object') ? ov.extendData : {});
    ed.style = { color, size, dash, fill, fillColor: hexToRgba(color, 0.14) };
    ov.extendData = ed; ov.lock = lock;
    try { state.chart.overrideOverlay({ id, extendData: ed, lock }); } catch (e) {}
    recordOverlay(ov);
  }

  /* ---------- новости по инструменту (правая колонка) ---------- */
  let newsOpen = false, newsEl = null, newsReqId = 0;
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function ensureNews() {
    if (newsEl) return newsEl;
    const p = document.createElement('div');
    p.id = 'lun-news';
    p.style.cssText = 'position:fixed;top:0;right:0;height:100%;width:340px;max-width:86vw;background:#0f1420;border-left:1px solid #232b3a;box-shadow:-8px 0 24px rgba(0,0,0,.45);z-index:60;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .2s ease';
    p.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #232b3a">
        <b id="nw-title" style="flex:1;font-size:13px">Новости</b>
        <span id="nw-refresh" title="Обновить" style="cursor:pointer;color:#8b93a7;font-size:15px">⟳</span>
        <span id="nw-close" style="cursor:pointer;color:#8b93a7;font-size:18px">×</span></div>
      <div id="nw-list" style="flex:1;overflow:auto;padding:6px 10px"></div>
      <div style="padding:7px 10px;border-top:1px solid #232b3a;color:#6b7280;font-size:11px">СМИ часто ведут толпу не туда — читайте как контр-сигнал, а не руководство.</div>`;
    document.body.appendChild(p);
    p.querySelector('#nw-close').onclick = () => toggleNews(false);
    p.querySelector('#nw-refresh').onclick = () => loadNews(true);
    newsEl = p; return p;
  }
  let newsMoodEnabled = false;
  function toggleNews(on) { ensureNews(); newsOpen = on; if (on) newsMoodEnabled = true; newsEl.style.transform = on ? 'translateX(0)' : 'translateX(100%)'; if (on) loadNews(); }
  function newsKeywords() {
    const ins = state.instrument, K = (window.LUN.NEWS && window.LUN.NEWS.keywords) || {};
    if (K[ins.id]) return K[ins.id];
    const words = (ins.title || ins.symbol || '').toLowerCase().split(/[^a-zа-яё0-9]+/).filter((w) => w.length > 2);
    return words.length ? words : (window.LUN.NEWS && window.LUN.NEWS.default) || [];
  }
  function newsFeeds() {
    const N = window.LUN.NEWS || {}, ins = state.instrument, prov = ins.provider || 'moex';
    const feeds = (N.feeds || []).slice();
    // профильные товарные ленты по исходному товару (нефть/золото/доллар…)
    if (N.commodityFeeds && N.commodityFeeds[ins.id]) N.commodityFeeds[ins.id].forEach((f) => feeds.push(f));
    if (prov === 'yahoo' && (ins.symbol || ins.ticker)) feeds.push({ name: 'Yahoo', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=' + encodeURIComponent(ins.symbol || ins.ticker) + '&region=US&lang=en-US' });
    if (prov === 'bybit' || prov === 'binance') (N.cryptoEnFeeds || []).forEach((f) => feeds.push(f));
    return feeds;
  }
  function newsMoodBadge() {
    let el = document.getElementById('news-mood');
    if (!el) { const bar = document.querySelector('.statusbar'); if (!bar) return null; el = document.createElement('span'); el.id = 'news-mood'; el.style.cssText = 'cursor:pointer;font-weight:600'; el.title = 'Настроение СМИ по инструменту (клик — открыть новости)'; el.onclick = () => toggleNews(!newsOpen); const anchor = document.getElementById('stream-status'); bar.insertBefore(el, anchor || null); }
    return el;
  }
  function updateNewsMood(res, insTitle) {
    const el = newsMoodBadge(); if (!el) return;
    if (!res || !res.items.length) { el.style.display = 'none'; return; }
    const m = res.mood, net = Math.round(m.net * 100), col = m.net > 0.1 ? '#26a69a' : (m.net < -0.1 ? '#ef5350' : '#8b93a7');
    el.style.display = ''; el.style.color = col;
    el.textContent = '📰 ' + (insTitle || '') + ': ' + (net > 0 ? '▲+' : (net < 0 ? '▼' : '•')) + Math.abs(net) + '% (' + m.pos + '/' + m.neg + ')';
  }
  const SENT_TAG = (s) => s > 0 ? '<span style="color:#26a69a">▲</span>' : (s < 0 ? '<span style="color:#ef5350">▼</span>' : '<span style="color:#6b7280">•</span>');
  async function loadNews(force) {
    if (!window.LunNews) return;
    const ins = state.instrument, rid = ++newsReqId, list = newsEl && newsEl.querySelector('#nw-list');
    if (newsEl) newsEl.querySelector('#nw-title').textContent = 'Новости · ' + (ins.title || ins.id);
    if (newsOpen && list) list.innerHTML = '<div style="color:#8b93a7;padding:8px 4px">Загрузка…</div>';
    let res = null; try { res = await window.LunNews.fetch({ keywords: newsKeywords(), feeds: newsFeeds() }); } catch (e) {}
    if (rid !== newsReqId) return;
    updateNewsMood(res, ins.title || ins.id);
    if (!newsOpen || !list) return;
    if (!res || !res.items.length) {
      list.innerHTML = '<div style="color:#8b93a7;padding:8px 4px">' + (res ? 'По инструменту ничего не нашлось (просмотрено ' + res.total + ' новостей). Обновите позже.' : 'Источники новостей недоступны из этого окружения.') + '</div>';
      return;
    }
    const m = res.mood, net = Math.round(m.net * 100), mcol = m.net > 0.1 ? '#26a69a' : (m.net < -0.1 ? '#ef5350' : '#8b93a7');
    const fbHtml = res.fallback ? `<div style="padding:5px 4px;color:#e0a030;font-size:11px">Нет точных совпадений по инструменту — последние новости по рынку.</div>` : '';
    const moodHtml = fbHtml + `<div style="padding:6px 4px 8px;margin-bottom:4px;border-bottom:1px solid #232b3a;color:${mcol};font-size:12px">Настроение СМИ: ▲${m.pos} ▼${m.neg} • ${m.neu} · нетто <b>${net > 0 ? '+' : ''}${net}%</b></div>`;
    list.innerHTML = moodHtml + res.items.map((it) => {
      const t = it.ts ? new Date(it.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      return `<a href="${escapeHtml(it.link)}" target="_blank" rel="noopener" style="display:block;padding:7px 4px;border-bottom:1px solid #1a2130;color:#d7deea;text-decoration:none;font-size:12px;line-height:1.35">`
        + `<div>${SENT_TAG(it.sent)} ${escapeHtml(it.title)}</div><div style="color:#6b7280;font-size:11px;margin-top:2px">${escapeHtml(it.source)} · ${t}</div></a>`;
    }).join('');
  }

  /* ---------- астро-календарь (правая колонка) ---------- */
  let calOpen = false, calEl = null;
  function ensureCal() {
    if (calEl) return calEl;
    const p = document.createElement('div');
    p.id = 'lun-cal';
    p.style.cssText = 'position:fixed;top:0;right:0;height:100%;width:320px;max-width:86vw;background:#0f1420;border-left:1px solid #232b3a;box-shadow:-8px 0 24px rgba(0,0,0,.45);z-index:60;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .2s ease';
    p.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #232b3a"><b style="flex:1;font-size:13px">🗓 Астро-календарь</b><span id="cal-close" style="cursor:pointer;color:#8b93a7;font-size:18px">×</span></div>
      <div id="cal-list" style="flex:1;overflow:auto;padding:6px 10px"></div>
      <div style="padding:7px 10px;border-top:1px solid #232b3a;color:#6b7280;font-size:11px">Ближайшие 90 дней · гео. Проверяйте влияние в «Астро-фит».</div>`;
    document.body.appendChild(p);
    p.querySelector('#cal-close').onclick = () => toggleCalendar(false);
    calEl = p; return p;
  }
  function toggleCalendar(on) { ensureCal(); calOpen = on; calEl.style.transform = on ? 'translateX(0)' : 'translateX(100%)'; if (on) renderCalendar(); }
  function renderCalendar() {
    if (!calEl || !window.LunTS || !window.LunTS.upcomingEvents) return;
    const list = calEl.querySelector('#cal-list'), now = Date.now();
    list.innerHTML = '<div style="color:#8b93a7;padding:8px 4px">Считаю…</div>';
    setTimeout(() => {
      let ev = []; try { ev = window.LunTS.upcomingEvents(now, 90); } catch (e) {}
      if (!ev.length) { list.innerHTML = '<div style="color:#8b93a7;padding:8px 4px">Событий не найдено.</div>'; return; }
      let html = '', lastD = '';
      ev.slice(0, 140).forEach((e) => {
        const d = new Date(e.ts), ds = d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', weekday: 'short' });
        if (ds !== lastD) { html += `<div style="color:#3aa0ff;font-size:11px;margin:9px 0 2px">${ds}</div>`; lastD = ds; }
        const da = Math.max(0, Math.round((e.ts - now) / 86400000));
        html += `<div style="padding:3px 4px;border-bottom:1px solid #1a2130;font-size:12px;color:#d7deea">${e.name} <span style="color:#6b7280">· через ${da}д</span></div>`;
      });
      list.innerHTML = html;
    }, 20);
  }

  /* ---------- алерты ---------- */
  async function authApi(fn, body) {
    const res = await fetch('auth.php?fn=' + fn, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let j = {}; try { j = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
    return j;
  }
  /* ---------- рабочий стол: авто-сохранение/восстановление ---------- */
  let applyingWs = false, wsTimer = null, wsApplied = false;
  const WS_LKEY = 'lun_ws_v1';
  function scheduleWsSave() {
    if (applyingWs) return;
    clearTimeout(wsTimer);
    wsTimer = setTimeout(() => {
      let ws; try { ws = captureWorkspace(); } catch (e) { return; }
      // локально — ВСЕГДА (сохранение разметки/индикаторов между сессиями в этом
      // браузере, даже без входа). На сервер — если вошли (кросс-устройство, много
      // пользователей: у каждого свой рабочий стол).
      try { localStorage.setItem(WS_LKEY, JSON.stringify(ws)); } catch (e) {}
      if (window.LunAuth && window.LunAuth.user) authApi('ws_save', { ws }).catch(() => {});
    }, 1500);
  }
  function captureWorkspace() {
    const s = state;
    return {
      v: 1, instrument: s.instrument, tf: s.tf.id, history: window.LUN_HISTORY || null, look: LOOK, favs: window.LUN_FAVS,
      trader: window.LUN_TRADER || null, synastry: window.LUN_SYNASTRY || null, synMode: (window.LUN.SYN && window.LUN.SYN.mode) || 'both', sbc: window.LUN_SBC || null, maslov: window.LUN_MASLOV || null, barMode: (window.LUN.BAR && window.LUN.BAR.mode) || 'signed',
      aspSel: { blocks: (window.LUN.ASPSEL && window.LUN.ASPSEL.blocks) || [], orb: window.LUN.ASPSEL && window.LUN.ASPSEL.orb, frame: window.LUN.ASPSEL && window.LUN.ASPSEL.frame },
      svir: window.LUN.SVIR || null,
      vwapList: (window.LUN.INDICATORS && window.LUN.INDICATORS.vwapList) || null,
      swings: s.swings || null,
      draw: { snap: !!window.LUN.SNAP, boxForecast: !!(window.LUN.GANNTOOLS.box && window.LUN.GANNTOOLS.box.forecast), boxForecastCount: (window.LUN.GANNTOOLS.box && window.LUN.GANNTOOLS.box.forecastCount) || 2, boxForecastDir: (window.LUN.GANNTOOLS.box && window.LUN.GANNTOOLS.box.forecastDir) || 'auto' },
      inds: {
        candle: Object.keys(s.candleInds || {}), overlays: Object.keys(s.overlayIds || {}),
        volume: !!s.volumePane, delta: !!s.deltaPane, markov: !!s.markovPanes, oi: !!s.oiPane,
        basis: !!s.basisPane, retro: !!s.retroPane, bradley: !!s.bradleyPane, syn: !!s.synPane,
        signs: Object.keys(s.signPanes || {}), cycles: Object.keys(s.cyclePanes || {}),
        aspects: Object.keys(s.aspectPanes || {}), allAspect: !!s.allAspectPane, aspsel: !!s.aspSelPane, sbc: !!s.sbcPane, svir: !!s.svirPane,
        vwap: !!s.vwapOn,
      },
      drawings: Object.values(s.drawings || {}),
    };
  }
  const IND_SKIP = { GannSquareLevels: 1, OIExtremes: 1, AstroEventMarks: 1, CycleProjection: 1, GannSquaring: 1, GannRetr: 1, GannCycles: 1, GannSwings: 1, VWAP_1: 1, VWAP_2: 1, VWAP_3: 1 };
  function applyWsIndicators(ind) {
    if (!ind) return;
    (ind.candle || []).forEach((n) => { if (IND_SKIP[n]) return; try { state.chart.createIndicator({ name: n, paneId: 'candle_pane' }, true); state.candleInds[n] = true; } catch (e) {} });
    (ind.overlays || []).forEach((k) => { try { toggleOverlay(k, true); } catch (e) {} });
    try { if (ind.volume && !state.volumePane) createVolumePane(); } catch (e) {}
    try { if (ind.delta && !state.deltaPane) createDeltaPane(); } catch (e) {}
    try { if (ind.markov && !state.markovPanes) createMarkov(); } catch (e) {}
    try { if (ind.oi && !state.oiPane) rebuildOI(state); } catch (e) {}
    try { if (ind.basis && !state.basisPane) rebuildBasis(state); } catch (e) {}
    try { if (ind.retro && !state.retroPane) createRetroPane(); } catch (e) {}
    try { if (ind.bradley && !state.bradleyPane) createBradleyPane(); } catch (e) {}
    try { if (ind.syn && window.LUN_SYNASTRY && !state.synPane) createSynastryPane(); } catch (e) {}
    (ind.signs || []).forEach((b, i) => { if (state.signPanes[b]) return; try { if (b === 'Moon') toggleMoonSign(true); else createSignPane(b, 25 + i); } catch (e) {} });
    (ind.cycles || []).forEach((id, i) => { const cy = window.LUN.CYCLES.find((c) => c.id === id); if (cy && !state.cyclePanes[id]) try { createCyclePane(cy, 11 + i); } catch (e) {} });
    (ind.aspects || []).forEach((b, i) => { const pl = window.LUN.ASPECT_PLANETS.find((p) => p.body === b); if (pl && !state.aspectPanes[b]) try { createSunAspect(pl, 15 + i); } catch (e) {} });
    try { if (ind.allAspect && !state.allAspectPane) createAllAspect(); } catch (e) {}
    try { if (ind.aspsel && !state.aspSelPane && (window.LUN.ASPSEL.blocks || []).length) createAspSelPane(); } catch (e) {}
    try { if (ind.sbc && !state.sbcPane && window.LUN_SBC && window.LUN_SBC.janma) createSBCPane(); } catch (e) {}
    try { if (ind.svir && !state.svirPane) createSvirPane(); } catch (e) {}
    try { if (ind.vwap) applyVwap(state); } catch (e) {}
  }
  function applyWsDrawings(list) {
    (list || []).forEach((d) => { try { const id = state.chart.createOverlay(Object.assign({ name: d.name, points: clonePoints(d.points), extendData: d.extendData, styles: d.styles, lock: d.lock }, overlayEvents())); const oid = (typeof id === 'string') ? id : (Array.isArray(id) ? id[0] : null); if (oid) state.drawings[oid] = d; } catch (e) {} });
  }
  async function applyWorkspace(ws) {
    if (!ws || applyingWs) return;
    applyingWs = true;
    try {
      if (ws.look) LOOK = Object.assign(LOOK, ws.look);
      if (Array.isArray(ws.favs) && ws.favs.length) { window.LUN_FAVS = ws.favs; try { localStorage.setItem('lun_favs', JSON.stringify(ws.favs)); } catch (e) {} buildInstruments(); }
      if (ws.trader && ws.trader.ts) { window.LUN_TRADER = ws.trader; try { localStorage.setItem('lun_trader', JSON.stringify(ws.trader)); } catch (e) {} }
      if (ws.synastry && ws.synastry.points) window.LUN_SYNASTRY = ws.synastry;
      if (ws.synMode) window.LUN.SYN.mode = ws.synMode;
      if (ws.sbc && ws.sbc.janma) window.LUN_SBC = ws.sbc;
      if (ws.maslov && ws.maslov.cycle) window.LUN_MASLOV = ws.maslov;
      if (ws.barMode) window.LUN.BAR.mode = ws.barMode;
      if (ws.aspSel && Array.isArray(ws.aspSel.blocks)) { window.LUN.ASPSEL.blocks = ws.aspSel.blocks; if (ws.aspSel.orb) window.LUN.ASPSEL.orb = ws.aspSel.orb; if (ws.aspSel.frame) window.LUN.ASPSEL.frame = ws.aspSel.frame; }
      if (ws.svir && ws.svir.planets) window.LUN.SVIR = ws.svir;
      if (Array.isArray(ws.vwapList) && ws.vwapList.length) {
        // миграция: старые дефолтные цвета -> новая осевая палитра по типу якоря
        const OLD = window.LUN.VWAP_OLD_DEFAULTS || [], AX = window.LUN.VWAP_AXIS_COLOR || {};
        ws.vwapList.forEach((v) => { if (v && (!v.color || OLD.indexOf(v.color) >= 0) && AX[v.reset]) v.color = AX[v.reset]; });
        window.LUN.INDICATORS.vwapList = ws.vwapList;
      }
      if (ws.swings && ws.swings.pivots && ws.swings.pivots.length > 1) state.swings = ws.swings;
      if (ws.draw) { window.LUN.SNAP = !!ws.draw.snap; if (window.LUN.GANNTOOLS.box) { window.LUN.GANNTOOLS.box.forecast = !!ws.draw.boxForecast; window.LUN.GANNTOOLS.box.forecastCount = ws.draw.boxForecastCount || 2; window.LUN.GANNTOOLS.box.forecastDir = ws.draw.boxForecastDir || 'auto'; } }
      if (ws.history !== undefined) window.LUN_HISTORY = ws.history;
      if (ws.instrument) state.instrument = ws.instrument;
      if (ws.tf) { const tf = window.LUN.TIMEFRAMES.find((t) => t.id === ws.tf); if (tf) state.tf = tf; }
      await load(state);
      applyChartLook();
      setTimeout(() => { applyWsIndicators(ws.inds); applyWsDrawings(ws.drawings); syncToolbar(); applyingWs = false; }, 1000);
    } catch (e) { applyingWs = false; }
  }
  // Восстановление рабочего стола. Приоритет: сервер (если вошли — свой стол,
  // кросс-устройство), иначе локальная копия (та же машина, вход не обязателен).
  // Вызывается из auth.js после проверки сессии И из init() как страховка
  // (например, если PHP недоступен — анонимный юзер всё равно вернёт разметку).
  window.LUN_APPLY_WS = async function (force) {
    if (wsApplied && !force) return; wsApplied = true;
    let ws = null;
    if (window.LunAuth && window.LunAuth.user) {
      try { const r = await authApi('ws_load'); if (r && r.ws) ws = r.ws; } catch (e) {}
    }
    if (!ws) { try { ws = JSON.parse(localStorage.getItem(WS_LKEY) || 'null'); } catch (e) {} }
    if (ws) applyWorkspace(ws);
  };
  window.LUN_SCHEDULE_WS = scheduleWsSave;

  function alertsModal() {
    if (!window.LunAuth || !window.LunAuth.user) { alert('Чтобы ставить алерты, войдите в аккаунт (кнопка 👤 справа).'); return; }
    const inp = 'background:#0b0e14;color:#d7deea;border:1px solid #232b3a;border-radius:6px;padding:5px 8px;font-size:13px';
    const btn = 'background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px';
    let last = 0; try { const l = state.chart.getDataList(); last = l.length ? l[l.length - 1].close : 0; } catch (e) {}
    const now = Date.now();
    let evs = []; try { evs = (window.LunTS && window.LunTS.upcomingEvents) ? window.LunTS.upcomingEvents(now, 120) : []; } catch (e) {}
    const evOpts = evs.slice(0, 120).map((e, i) => `<option value="${i}">${new Date(e.ts).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })} · ${e.name}</option>`).join('');
    openModal('🔔 Алерты', `
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px">
        <label>Тип<br><select id="al-kind" style="${inp}"><option value="price">Ценовой уровень</option><option value="astro">Астро-событие</option></select></label>
        <span id="al-price-box">
          <label>Условие<br><select id="al-op" style="${inp}"><option value=">=">≥ (вверх)</option><option value="<=">≤ (вниз)</option></select></label>
          <label>Уровень<br><input id="al-level" type="number" step="any" value="${last}" style="${inp};width:120px"></label>
        </span>
        <span id="al-astro-box" style="display:none"><label>Событие<br><select id="al-ev" style="${inp};max-width:260px">${evOpts}</select></label></span>
        <label>Канал<br><select id="al-ch" style="${inp}"><option value="email">E-mail</option><option value="telegram">Telegram</option></select></label>
        <label style="display:inline-flex;align-items:center;gap:5px"><input id="al-rpt" type="checkbox"> повторять</label>
        <button id="al-add" style="${btn};border-color:#26a69a">Создать</button>
      </div>
      <div id="al-tg" style="color:#8b93a7;font-size:12px;margin-bottom:8px"></div>
      <div id="al-list">…</div>`);
    const $ = (id) => document.getElementById(id);
    $('al-kind').onchange = () => { const a = $('al-kind').value === 'astro'; $('al-astro-box').style.display = a ? '' : 'none'; $('al-price-box').style.display = a ? 'none' : ''; };
    const refresh = async () => {
      try {
        const r = await authApi('alert_list');
        const rows = (r.alerts || []).map((a) => `<tr><td style="padding:2px 10px 2px 0">${a.kind === 'price' ? (a.instrument + ' ' + a.op + ' ' + a.level) : ('⭐ ' + a.title)}</td><td style="padding:2px 10px 2px 0;color:#8b93a7">${a.channel}${+a.rpt ? ' · повтор' : ''}</td><td style="padding:2px 10px 2px 0;color:${a.status === 'active' ? '#26a69a' : '#8b93a7'}">${a.status}</td><td><span class="al-del" data-id="${a.id}" style="cursor:pointer;color:#ef8a88">✕</span></td></tr>`).join('');
        $('al-list').innerHTML = rows ? `<table style="border-collapse:collapse;font-size:12px;width:100%"><tbody>${rows}</tbody></table>` : '<div style="color:#8b93a7">Пока нет алертов.</div>';
        [...document.querySelectorAll('.al-del')].forEach((x) => x.onclick = async () => { await authApi('alert_del', { id: +x.dataset.id }); refresh(); });
        // Telegram
        if ($('al-ch').value === 'telegram' || (r.alerts || []).some((a) => a.channel === 'telegram')) {
          try { const t = await authApi('tg_code'); const bot = window.LUN.TG_BOT; $('al-tg').innerHTML = t.linked ? '✅ Telegram привязан.' : ('Telegram: отправьте боту ' + (bot ? '<a href="https://t.me/' + bot + '?start=' + t.code + '" target="_blank" style="color:#3aa0ff">@' + bot + '</a>' : '(бот ещё не настроен)') + ' сообщение <b>/start ' + t.code + '</b>, затем «Создать».'); } catch (e) {}
        } else $('al-tg').innerHTML = '';
      } catch (e) { $('al-list').innerHTML = '<div style="color:#e0a030">' + e.message + '</div>'; }
    };
    $('al-ch').onchange = refresh;
    $('al-add').onclick = async () => {
      const kind = $('al-kind').value, channel = $('al-ch').value, rpt = $('al-rpt').checked;
      try {
        if (kind === 'astro') {
          const e = evs[+$('al-ev').value]; if (!e) return;
          await authApi('alert_add', { kind: 'astro', title: e.name, fire_ts: e.ts, channel, rpt });
        } else {
          const ins = state.instrument, ticker = await window.LunData.resolveTicker(ins);
          await authApi('alert_add', { kind: 'price', title: (ins.title || ins.id) + ' ' + $('al-op').value + ' ' + $('al-level').value, instrument: ticker, provider: ins.provider || 'moex', op: $('al-op').value, level: +$('al-level').value, channel, rpt });
        }
        refresh();
      } catch (e) { alert(e.message); }
    };
    refresh();
  }

  function startDraw(toolId) {
    closeMenus();
    const ev = overlayEvents();
    if (toolId === 'lun_text') {
      const t = window.prompt('Текст метки:', '');
      if (t === null) return;
      state.chart.createOverlay(Object.assign({ name: 'lun_text', extendData: { text: t, style: defOvStyle() } }, ev));
    } else if (toolId === 'lun_hray') {
      const n = (window.LUN.HRAY && window.LUN.HRAY.maxCrossings) || 2;
      state.chart.createOverlay(Object.assign({ name: 'lun_hray', extendData: { maxCrossings: n, style: defOvStyle() } }, ev));
    } else {
      state.chart.createOverlay(Object.assign({ name: toolId, extendData: { style: defOvStyle() } }, ev));
    }
  }

  /* прогноз вперёд: продлить поле на 1–2 квартала (астро-полосы и цикл проецируются) */
  function setForecast(on, btn) {
    const c = state.chart, list = c.getDataList();
    const quarters = (window.LUN.FORECAST && window.LUN.FORECAST.quarters) || 1;
    if (on && list && list.length) {
      const lastTs = list[list.length - 1].timestamp;
      const horizonMs = quarters * 91 * 86400000;
      const stepMs = periodMillis(state.tf);
      const extra = Math.min(3000, Math.max(1, Math.ceil(horizonMs / stepMs)));
      window.LUN_FORECAST = { enabled: true, untilTs: lastTs + horizonMs, stepMs, maxBars: extra };
      try { const bar = c.getBarSpace().bar || 6; c.setOffsetRightDistance(Math.max(80, extra * bar)); } catch (e) {}
      window.LUN_MASLOV = window.LUN_MASLOV || { cycle: 'merc' }; window.LUN_MASLOV.horizonQ = quarters;   // цикл тоже вперёд
      state.forecastOn = true;
      if (btn) btn.title = 'Прогноз вперёд: ' + quarters + ' кв. (F)';
    } else {
      window.LUN_FORECAST = { enabled: false };
      if (window.LUN_MASLOV) window.LUN_MASLOV.horizonQ = 0;
      state.forecastOn = false;
      try { c.setOffsetRightDistance(80); } catch (e) {}
    }
    if (state.candleInds && state.candleInds.MercSunCycle) { try { c.removeIndicator({ paneId: 'candle_pane', name: 'MercSunCycle' }); c.createIndicator({ name: 'MercSunCycle', paneId: 'candle_pane' }, true); } catch (e) {} }
    try { c.resize(); } catch (e) {}
  }

  /* ---------- статус-строка ---------- */
  function updateMoonStatus() {
    const info = window.LunAstro.moonInfo(Date.now());
    const s = window.LUN.SIGNS[info.signIndex];
    const c1 = window.LUN.CYCLES[0];
    const z = window.LunAstro.zoneOf(info.lon, c1.zones);
    document.getElementById('moon-now').innerHTML =
      `☾ <b style="color:${s.color}">${s.glyph} ${s.name}</b> ${info.degInSign.toFixed(1)}°` +
      (z ? ` · <span style="color:${window.LUN.BIAS_COLORS[z.bias]}">${z.label}</span>` : '');
  }

  /* ---------- UI ---------- */
  function mkBtn(wrap, text, onClick, active, title) {
    const b = document.createElement('button');
    b.textContent = text; if (title) b.title = title;
    if (active) b.classList.add('active');
    b.onclick = () => onClick(b);
    wrap.appendChild(b); return b;
  }

  /* ---------- избранные инструменты (звёздочка) ---------- */
  const favId = (ins) => ins.id || ((ins.provider || 'moex') + ':' + (ins.ticker || ins.symbol || ins.title));
  function loadFavs() {
    try { const s = JSON.parse(localStorage.getItem('lun_favs') || 'null'); if (Array.isArray(s) && s.length) { window.LUN_FAVS = s; return; } } catch (e) {}
    window.LUN_FAVS = window.LUN.INSTRUMENTS.slice();
  }
  function saveFavs() { try { localStorage.setItem('lun_favs', JSON.stringify(window.LUN_FAVS || [])); } catch (e) {} if (typeof scheduleWsSave === 'function') scheduleWsSave(); }
  const findFav = (id) => (window.LUN_FAVS || []).find((x) => favId(x) === id);
  function addFav(ins) { const id = favId(ins); if (findFav(id)) return; const c = Object.assign({}, ins); if (!c.provider) c.provider = 'moex'; window.LUN_FAVS.push(c); saveFavs(); buildInstruments(); }
  function removeFav(id) { window.LUN_FAVS = (window.LUN_FAVS || []).filter((x) => favId(x) !== id); saveFavs(); buildInstruments(); }
  function favApi() { return { isFav: (x) => !!findFav(favId(x)), toggle: (x) => { const id = favId(x); if (findFav(id)) removeFav(id); else addFav(x); } }; }
  function buildInstruments() {
    const insWrap = document.getElementById('instruments'); if (!insWrap) return;
    const MARKET = { moex: 'MOEX', bybit: 'Крипта', binance: 'Крипта', yahoo: 'США' };
    insWrap.innerHTML = ''; let curMarket = null;
    const clearActive = () => [...insWrap.querySelectorAll('button')].forEach((x) => x.classList.remove('active'));
    (window.LUN_FAVS || []).forEach((ins) => {
      const grp = MARKET[ins.provider || 'moex'] || 'Прочее';
      if (grp !== curMarket) { const h = document.createElement('div'); h.className = 'menu-sub'; h.textContent = grp; insWrap.appendChild(h); curMarket = grp; }
      const b = document.createElement('button'); b.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%';
      b.innerHTML = '<span style="flex:1;text-align:left">' + (ins.title || ins.id) + '</span><span class="fav-star" title="убрать из избранного" style="color:#e0c040">★</span>';
      if (favId(ins) === favId(state.instrument)) b.classList.add('active');
      b.onclick = () => { state.instrument = ins; load(); closeMenus(); clearActive(); b.classList.add('active'); };
      b.querySelector('.fav-star').onclick = (e) => { e.stopPropagation(); removeFav(favId(ins)); };
      insWrap.appendChild(b);
    });
    const findBtn = mkBtn(insWrap, '🔍 Поиск / добавить в избранное…', () => { closeMenus(); window.LunInstruments.open((instr) => { state.instrument = instr; load(); }, favApi()); }, false, 'Поиск инструмента; звёздочка ★ добавит в избранное');
    findBtn.classList.add('find-btn');
    mkBtn(insWrap, '➕ 2-й график (линией)', () => { closeMenus(); window.LunInstruments.open((instr) => addCompare(instr)); }, false, 'Наложить второй инструмент линией на активный график');
    mkBtn(insWrap, '✕ убрать 2-й график', () => { closeMenus(); removeCompare(); }, false, 'Убрать наложение');
  }

  /* ---------- «Личные данные»: синастрия (трейдер ↔ биржа ↔ инструмент) ---------- */
  function loadTrader() {
    try { const s = JSON.parse(localStorage.getItem('lun_trader') || 'null'); if (s && s.ts) { window.LUN_TRADER = s; return; } } catch (e) {}
    window.LUN_TRADER = null;
  }
  function saveTrader(t) { window.LUN_TRADER = t; try { localStorage.setItem('lun_trader', JSON.stringify(t)); } catch (e) {} if (typeof scheduleWsSave === 'function') scheduleWsSave(); }
  // натальные точки (массив долгот 10 тел) из момента ts
  const natalPoints = (ts) => { if (!window.LunSynastry || !isFinite(ts)) return null; const o = window.LunSynastry.natal(ts); return window.LunSynastry.PL.map((p) => o[p]); };
  const traderTs = () => (window.LUN_TRADER && window.LUN_TRADER.ts) || null;
  const exchangeTs = (exId) => { const e = (window.LUN.NATAL.exchanges || []).find((x) => x.id === exId); return e ? Date.parse(e.date) : null; };
  // «рождение» инструмента — первая загруженная свеча (или вручную заданная)
  function instrumentTs() {
    if (window.LUN_INSTR_NATAL) return window.LUN_INSTR_NATAL;
    try { const l = state.chart.getDataList(); if (l && l.length) return l[0].timestamp; } catch (e) {}
    return null;
  }
  // авто-биржа под текущий инструмент
  function defaultExchangeId() {
    const ins = state.instrument || {}; const p = ins.provider || 'moex';
    if (p === 'moex') return 'moex';
    if (p === 'yahoo') return 'nyse';
    if (p === 'bybit') return 'bybit';
    if (p === 'binance') return 'binance';
    return 'moex';
  }

  function synastryModal() {
    if (!window.LunSynastry) { openModal('Синастрия', '<p>Модуль синастрии не загрузился.</p>'); return; }
    const NAT = window.LUN.NATAL, G = window.LunSynastry.G;
    const t = window.LUN_TRADER || {};
    const bd = t.ts ? new Date(t.ts) : null;
    const dstr = bd ? bd.toISOString().slice(0, 10) : '';
    const tstr = bd ? bd.toISOString().slice(11, 16) : '12:00';
    const exOpts = (NAT.exchanges || []).map((e) => `<option value="${e.id}"${e.id === defaultExchangeId() ? ' selected' : ''}>${e.title} (${e.note})</option>`).join('');
    const insTs = instrumentTs();
    const insDate = insTs ? new Date(insTs).toISOString().slice(0, 10) : '';
    const insTitle = (state.instrument && (state.instrument.title || state.instrument.ticker || state.instrument.id)) || 'инструмент';
    openModal('Личные данные · синастрия', `
      <p style="color:#8b93a7">Сравнение «карт рождения»: у трейдера, биржи и инструмента есть дата старта. Синастрия — межаспекты двух карт (гармония +, напряжение −), а динамика во времени показывает, как небо активирует обе карты. <b>Эксперимент</b> финансовой астрологии.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:10px 0">
        <div style="border:1px solid #232b3a;border-radius:8px;padding:10px">
          <h3 style="margin:0 0 8px;color:#3aa0ff;font-size:13px">🧑 Трейдер</h3>
          <label style="display:block;margin-bottom:6px">Дата рождения<br><input id="tr-date" type="date" value="${dstr}" style="width:100%;padding:6px;background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px"></label>
          <label style="display:block">Время (местное, прибл.)<br><input id="tr-time" type="time" value="${tstr}" style="width:100%;padding:6px;background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px"></label>
          <div style="color:#6b7280;font-size:11px;margin-top:6px">Без времени берётся полдень. Дома не учитываются — только долготы планет.</div>
        </div>
        <div style="border:1px solid #232b3a;border-radius:8px;padding:10px">
          <h3 style="margin:0 0 8px;color:#3aa0ff;font-size:13px">🏛 Биржа / 📈 Инструмент</h3>
          <label style="display:block;margin-bottom:6px">Биржа<br><select id="ex-sel" style="width:100%;padding:6px;background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px">${exOpts}</select></label>
          <label style="display:block">Дата старта инструмента «${insTitle}»<br><input id="ins-date" type="date" value="${insDate}" style="width:100%;padding:6px;background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px"></label>
          <div style="color:#6b7280;font-size:11px;margin-top:6px">По умолчанию — первая загруженная свеча. Углубите «Период», чтобы взять более раннюю дату.</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0">
        <b>Пара:</b>
        <select id="pair-sel" style="padding:6px;background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px">
          <option value="te">Трейдер ↔ Биржа</option>
          <option value="ei">Биржа ↔ Инструмент</option>
          <option value="ti">Трейдер ↔ Инструмент</option>
        </select>
        <b style="margin-left:8px">Кривая:</b>
        <select id="syn-mode" style="padding:6px;background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px">
          <option value="signed">одна (знаковая)</option>
          <option value="polar">две полярности 🟢🔴</option>
          <option value="both">обе</option>
        </select>
        <button id="syn-calc" style="padding:6px 12px;background:#1a2130;color:#d7deea;border:1px solid #232b3a;border-radius:6px;cursor:pointer">Рассчитать</button>
        <button id="syn-dyn" style="padding:6px 12px;background:#1c3a2a;color:#d7deea;border:1px solid #2a5a3a;border-radius:6px;cursor:pointer">📉 Динамика на график</button>
      </div>
      <div id="syn-out" style="margin-top:8px"></div>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    const $ = (s) => bg.querySelector(s);
    const readTrader = () => {
      const d = $('#tr-date').value, tm = $('#tr-time').value || '12:00';
      if (!d) return null;
      const ts = Date.parse(d + 'T' + tm + ':00');
      return isFinite(ts) ? ts : null;
    };
    const pointsFor = (who) => {
      if (who === 't') { const ts = readTrader(); return ts ? { ts, pts: natalPoints(ts), title: 'Трейдер' } : null; }
      if (who === 'e') { const id = $('#ex-sel').value, ts = exchangeTs(id); const e = (NAT.exchanges || []).find((x) => x.id === id); return ts ? { ts, pts: natalPoints(ts), title: e ? e.title : 'Биржа' } : null; }
      if (who === 'i') { const d = $('#ins-date').value; const ts = d ? Date.parse(d + 'T00:00:00Z') : null; return (ts && isFinite(ts)) ? { ts, pts: natalPoints(ts), title: insTitle } : null; }
      return null;
    };
    const selPair = () => { const v = $('#pair-sel').value; return v === 'te' ? ['t', 'e'] : v === 'ei' ? ['e', 'i'] : ['t', 'i']; };
    const calc = () => {
      const [x, y] = selPair(); const A = pointsFor(x), B = pointsFor(y);
      const ts = readTrader(); if (ts) saveTrader({ ts, title: 'Трейдер' });
      if (!A || !B || !A.pts || !B.pts) { $('#syn-out').innerHTML = '<p style="color:#ef5350">Заполните обе даты пары.</p>'; return; }
      const Aobj = {}, Bobj = {}; window.LunSynastry.PL.forEach((p, i) => { Aobj[p] = A.pts[i]; Bobj[p] = B.pts[i]; });
      const r = window.LunSynastry.synastry(Aobj, Bobj, 6);
      const verdict = r.score > 6 ? '<span style="color:#26a69a">гармоничная связь (+)</span>' : r.score < -6 ? '<span style="color:#ef5350">напряжённая связь (−)</span>' : '<span style="color:#e0c040">смешанная / нейтральная</span>';
      const rows = r.pairs.map((p) => `<tr><td>${G(p.a)} ${p.a}</td><td style="text-align:center">${p.asp}</td><td>${G(p.b)} ${p.b}</td><td style="text-align:right;color:${p.sign > 0 ? '#26a69a' : '#ef5350'}">${p.w.toFixed(2)}</td></tr>`).join('');
      $('#syn-out').innerHTML = `
        <p><b>${A.title} ↔ ${B.title}</b> · интегральный балл <b style="font-size:15px">${r.score.toFixed(1)}</b> — ${verdict}</p>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="color:#8b93a7;text-align:left"><th>Карта A</th><th style="text-align:center">Аспект</th><th>Карта B</th><th style="text-align:right">вес</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#6b7280;font-size:11px;margin-top:8px">☌ соединение · ⚹ секстиль · △ трин (гармония) · □ квадрат · ☍ оппозиция (напряжение). Вес = потенциалы планет × точность аспекта.</p>`;
    };
    const dyn = () => {
      const [x, y] = selPair(); const A = pointsFor(x), B = pointsFor(y);
      const ts = readTrader(); if (ts) saveTrader({ ts, title: 'Трейдер' });
      if (!A || !B || !A.pts || !B.pts) { $('#syn-out').innerHTML = '<p style="color:#ef5350">Заполните обе даты пары.</p>'; return; }
      window.LUN.SYN.mode = $('#syn-mode').value || 'both';
      window.LUN_SYNASTRY = { points: A.pts.concat(B.pts), title: A.title + '↔' + B.title, pair: $('#pair-sel').value };
      if (!state.synPane) createSynastryPane(); else { try { state.chart.removeIndicator({ paneId: state.synPane }); state.chart.createIndicator({ name: 'RelationshipDyn', paneId: state.synPane, shortName: 'Синастрия' }, false); } catch (e) {} }
      scheduleWsSave(); bg.remove(); closeMenus();
    };
    try { $('#syn-mode').value = (window.LUN.SYN && window.LUN.SYN.mode) || 'both'; } catch (e) {}
    $('#syn-mode').onchange = () => { window.LUN.SYN.mode = $('#syn-mode').value; if (state.synPane) { try { state.chart.removeIndicator({ paneId: state.synPane }); state.chart.createIndicator({ name: 'RelationshipDyn', paneId: state.synPane, shortName: 'Синастрия' }, false); } catch (e) {} } };
    $('#syn-calc').onclick = calc; $('#syn-dyn').onclick = dyn;
    if (traderTs()) calc();
  }

  function buildPersonal() {
    const wrap = document.getElementById('personal'); if (!wrap) return;
    wrap.innerHTML = '';
    mkBtn(wrap, '👤 Синастрия (трейдер/биржа/инструмент)…', () => { closeMenus(); synastryModal(); }, false, 'Сравнение карт рождения трейдера, биржи и инструмента');
    const dynBtn = mkBtn(wrap, '📉 Динамика взаимоотношений на графике', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) { if (!window.LUN_SYNASTRY) { synastryModal(); b.classList.remove('active'); } else if (!state.synPane) createSynastryPane(); }
      else removeSynastryPane();
      closeMenus();
    }, false, 'Панель RI(t): динамика синастрии выбранной пары во времени');
    dynBtn.dataset.sync = 'syn';
    const note = document.createElement('div'); note.className = 'menu-note';
    note.textContent = 'Синастрия: карты рождения трейдера ↔ биржи ↔ инструмента. Эксперимент.';
    wrap.appendChild(note);
  }

  function buildUI() {
    loadFavs();
    loadTrader();
    buildInstruments();
    buildPersonal();
    buildSim();
    loadFavs();
    buildInstruments();

    const tfWrap = document.getElementById('timeframes');
    window.LUN.TIMEFRAMES.forEach((tf, i) => {
      const b = mkBtn(tfWrap, tf.title, (bb) => {
        state.tf = tf; load(); closeMenus();
        [...tfWrap.children].forEach((x) => x.classList.remove('active')); bb.classList.add('active');
      }, tf === state.tf, tf.title + ' (' + (i + 1) + ')');
      b.dataset.sync = 'tf:' + tf.id;
      regHotkey(String(i + 1), () => b.click());   // 1..4 → ТФ
    });

    // ---- меню «🗓 Период» (глубина истории для исследований) ----
    const histWrap = document.getElementById('history');
    if (histWrap) {
      const clearHist = () => [...histWrap.querySelectorAll('button')].forEach((x) => x.classList.remove('active'));
      const setHist = (h, btn) => { window.LUN_HISTORY = h; clearHist(); if (btn) btn.classList.add('active'); reloadAllSlots(); };
      const PRESETS = [['Авто (по умолчанию)', null], ['3 месяца', { days: 92 }], ['6 месяцев', { days: 183 }],
        ['1 год', { days: 366 }], ['3 года', { days: 1096 }], ['5 лет', { days: 1827 }], ['Максимум', { days: 4000 }]];
      PRESETS.forEach(([label, h], i) => { const b = mkBtn(histWrap, label, (bb) => setHist(h, bb), i === 0,
        'Глубина загружаемой истории графика'); });
      mkBtn(histWrap, '📅 От–до…', () => { closeMenus(); historyModal((from, till, btnLabel) => {
        window.LUN_HISTORY = { from, till }; clearHist();
        [...histWrap.querySelectorAll('button')].forEach((x) => { if (x.textContent === '📅 От–до…') x.classList.add('active'); });
        reloadAllSlots();
      }); }, false, 'Задать точный диапазон дат');
      const hnote = document.createElement('div'); hnote.className = 'menu-note';
      hnote.textContent = 'Глубоко: D1/H1 (годы). M5/M15 у MOEX ограничены доступной 1-мин историей.';
      histWrap.appendChild(hnote);
    }

    const indWrap = document.getElementById('indicators');
    ['SMA', 'EMA'].forEach((k) => { const b = mkBtn(indWrap, k, (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on); toggleOverlay(k, on);
    }); b.dataset.sync = 'ov:' + k; });
    // VWAP — теперь настраиваемый: до 3 якорей (день/неделя/месяц/все) + полосы
    mkBtn(indWrap, 'VWAP…', () => { closeMenus(); vwapModal(); }, false,
      'Несколько VWAP одновременно: день / неделя / месяц / все бары, полосы отклонений вкл/выкл').dataset.sync = 'vwapmulti';
    // объём — включён по умолчанию, можно убрать
    mkBtn(indWrap, 'Объём', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createVolumePane(); else if (state.volumePane) { state.chart.removeIndicator({ paneId: state.volumePane }); state.volumePane = null; }
    }, true).dataset.sync = 'vol';
    // дневная кумулятивная дельта — по умолчанию выключена (полное отключение)
    mkBtn(indWrap, 'Δ дельта', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createDeltaPane(); else if (state.deltaPane) { state.chart.removeIndicator({ paneId: state.deltaPane }); state.deltaPane = null; }
    }, false, 'Дневная кумулятивная дельта (аппрокс. по OHLC)').dataset.sync = 'delta';
    // марковский режим: лента BEAR/SIDE/BULL + панель сигнала + матрица
    const mkBtnRef = mkBtn(indWrap, 'Марков', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createMarkov(); else removeMarkov();
    }, false, 'Марковский режим: лента BEAR/SIDE/BULL + сигнал + матрица переходов (M)');
    mkBtnRef.dataset.sync = 'markov';
    regHotkey('m', () => mkBtnRef.click());
    // открытый интерес + позиции физлиц/юрлиц (FUTOI, MOEX, дневной)
    const oiBtn = mkBtn(indWrap, 'ОИ физ/юр', (b) => {
      const on = !b.classList.contains('active');
      if (on) rebuildOI(state).then((ok) => b.classList.toggle('active', ok !== false));
      else { b.classList.remove('active'); removeOI(state); }
    }, false, 'Открытый интерес и чистые позиции физлиц/юрлиц (FUTOI, только фьючерсы MOEX, дневной)');
    oiBtn.dataset.sync = 'oi';
    // базис к споту исходного товара (фьюч − спот, регрессией) + z-score
    const basisBtn = mkBtn(indWrap, 'Базис к споту', (b) => {
      const on = !b.classList.contains('active');
      if (on) rebuildBasis(state).then((ok) => b.classList.toggle('active', ok !== false));
      else { b.classList.remove('active'); removeBasis(state); }
    }, false, 'Базис фьюч − спот исходного товара (Si↔USD/RUB, золото, CNY…): остаток регрессии + z');
    basisBtn.dataset.sync = 'basis';
    // узлы Луны (0°/15°) и сильные бары на цене — для поиска «сильный бар в узле»
    [['MoonNodes', 'Узлы ☾', 'Ингрессии (0°) и середины (15°) знаков Луны на цене'],
     ['StrongBars', 'Сильбары', 'Сила: всплеск объёма ≥2× среднего · силища (двойной знак): объём держится'],
     ['Sessions', 'Сессии', 'Сессии Азия/Лондон/Нью-Йорк/Сидней фоном (UTC, только интрадей)']].forEach(([name, label, tip]) =>
      (mkBtn(indWrap, label, (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) { state.chart.createIndicator({ name, paneId: 'candle_pane' }, true); state.candleInds[name] = true; }
        else { state.chart.removeIndicator({ paneId: 'candle_pane', name }); delete state.candleInds[name]; }
      }, false, tip)).dataset.sync = 'cand:' + name);
    // положения Меркурия и Солнца в знаках (словами)
    [['Mercury', '☿ знак', 25], ['Sun', '☉ знак', 26]].forEach(([body, label, order]) => { mkBtn(indWrap, label, (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createSignPane(body, order); else if (state.signPanes[body]) { state.chart.removeIndicator({ paneId: state.signPanes[body] }); delete state.signPanes[body]; }
    }, false, `Положение ${BODY_LABEL[body]} в знаках`).dataset.sync = 'sign:' + body; });

    // краткая подсказка «как пользоваться» по индикаторам
    const indNote = document.createElement('div'); indNote.className = 'menu-note';
    indNote.innerHTML = 'Как пользоваться:<br>• <b>Объём / Δ дельта</b> — поток и давление покупателей/продавцов.<br>• <b>VWAP</b> — средняя по объёму ±σ: зоны «дорого/дёшево».<br>• <b>Сильбары</b> — всплеск объёма ≥2× = импульс «умных денег».<br>• <b>Сессии</b> — Азия/Лондон/Нью-Йорк фоном (интрадей).<br>• <b>Марков</b> (M) — режим BEAR/SIDE/BULL + матрица переходов.<br>• <b>ОИ физ/юр</b> — позиции физлиц/юрлиц (фьючерсы MOEX); экстремум юриков = контр-сигнал.<br>• <b>Базис к споту</b> — фьюч−спот + z: керри/хедж-давление.<br>• <b>Узлы ☾ · ☿/☉ знак</b> — астро-положения на цене.';
    indWrap.appendChild(indNote);

    buildAspectButtons();
    const aspNote = document.createElement('div'); aspNote.className = 'menu-note';
    aspNote.innerHTML = 'Как пользоваться:<br>• Глифы планет — полоса аспектов к Солнцу (жёсткие □☍ = разворот, мягкие ⚹△ = продолжение).<br>• <b>∀ все</b> — сводная полоса всех пар.<br>• <b>⚙ Аспекты по выбору</b> — свои пары «кто↔с кем», знаки на точных аспектах.';
    document.getElementById('aspects').appendChild(aspNote);

    buildCycleButtons();
    const fcBtn = mkBtn(document.getElementById('cycles'), '🔮 Прогноз вперёд (1–2 кв.)', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on); setForecast(on, b); closeMenus();
    }, false, 'Продлить поле вперёд на 1–2 квартала: астро-полосы и цикл проецируются (горизонт — в «Оформление»). Клавиша F');
    fcBtn.dataset.sync = 'forecast';
    regHotkey('f', () => fcBtn.click());
    const cycNote = document.createElement('div'); cycNote.className = 'menu-note';
    cycNote.innerHTML = 'Как пользоваться:<br>• <b>☾ Луна в знаках</b> — верхняя лента настроения.<br>• <b>Циклы 1–6</b> — зоны лонг/шорт по долготе тела (фон-фильтр).<br>• <b>🗓 Астро-календарь</b> — события на 90 дней вперёд.';
    document.getElementById('cycles').appendChild(cycNote);

    // ---- меню «📐 Ганн» ----
    const gannWrap = document.getElementById('gann');
    if (gannWrap) {
      const gsub = (t) => { const h = document.createElement('div'); h.className = 'menu-sub'; h.textContent = t; gannWrap.appendChild(h); };
      mkBtn(gannWrap, '⚙ Настройки стиля Ганна…', () => { closeMenus(); gannStyleModal(); }, false, 'Размер подписей и цифр уровней, толщина/тип линий, цвет уровней');
      gsub('Геометрия (2 клика: пивот → охват)');
      mkBtn(gannWrap, '▱ Gann Box / Квадрат…', () => { closeMenus(); gannGeomModal(); }, false, 'Единая форма: Box с делениями или квадрат-сетка N×N (8/12/своё)');
      mkBtn(gannWrap, '⟋ Сквоузинг 1×1 (панель)', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) { state.chart.createIndicator({ name: 'GannSquaring', paneId: 'candle_pane' }, true); state.candleInds.GannSquaring = true; }
        else removeCandInd('GannSquaring');
      }, false, 'Линии 1×1 от пивота + отметки сквоузинга цены/времени');
      mkBtn(gannWrap, '⚖ Масштаб 1×1…', () => { closeMenus(); scaleModal(); }, false, 'Цена на 1 бар: авто или вручную');
      mkBtn(gannWrap, '🔒 Фикс-поле 1×1 (безразмерное)', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on); toggleGannSpace(on);
      }, false, 'Истинное поле 1×1: масштаб цена/время зафиксирован (углы не искажаются). Колесо — вертикальный пан, тяга — горизонтальный, зум выкл. Двойной клик в правый-нижний угол осей — последняя цена в центр. Соотношение задаётся в «Масштаб 1×1».');
      gsub('Квадраты');
      mkBtn(gannWrap, '⊞ Калькулятор квадратов…', () => { closeMenus(); gannSquareModal(); }, false, 'Квадрат 9 / шестиугольник / круг 360° / натуральные — уровни поддержки и сопротивления');
      mkBtn(gannWrap, '✕ убрать уровни квадрата', () => { closeMenus(); removeCandInd('GannSquareLevels'); }, false, 'Убрать нанесённые уровни квадрата');
      gsub('Свинги (1/2/3 бара)');
      [[1, '⟋ Свинги 1 бар', 'Каждое перебитие вершины/низины — новый свинг'],
       [2, '⟋ Свинги 2 бара', '2 бара подряд перебивают в одну сторону = разворот тренда'],
       [3, '⟋ Свинги 3 бара', '3 бара подряд перебивают в одну сторону = разворот. Внутренние бары не в счёт']].forEach(([n, label, tip]) => {
        const b = mkBtn(gannWrap, label, () => { closeMenus(); buildSwings(state, n); }, false, tip);
        b.dataset.sync = 'swing:' + n;
      });
      mkBtn(gannWrap, '✕ убрать свинги', () => { closeMenus(); removeSwings(state); }, false, 'Убрать ломаную свингов');
      gsub('Уровни и циклы');
      mkBtn(gannWrap, '📏 Ганн-ретрейсменты', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) { state.chart.createIndicator({ name: 'GannRetr', paneId: 'candle_pane' }, true); state.candleInds.GannRetr = true; }
        else removeCandInd('GannRetr');
      }, false, 'Горизонтали 1/8·1/3·1/2 диапазона видимого окна');
      mkBtn(gannWrap, '⏲ Мастер-циклы (клик = пивот)', () => startOverlay('lun_cycles'), false, 'Клик ставит пивот на ЛЮБОЙ экстремум истории (потом можно перетащить). Вертикали 30·45·60·90·120·144·180·270·360 баров');
      mkBtn(gannWrap, '⏲ Мастер-циклы (авто, посл. экстремум)', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) { state.chart.createIndicator({ name: 'GannCycles', paneId: 'candle_pane' }, true); state.candleInds.GannCycles = true; }
        else removeCandInd('GannCycles');
      }, false, 'Авто-пивот на последнем видимом экстремуме');
      gsub('Астро-Ганн');
      mkBtn(gannWrap, '🪐 Настроить планетарные линии…', () => { closeMenus(); astroGannModal(); }, false, 'Планеты, гео/гелио, масштаб цена/градус');
      [['PlanetLines', '🪐 Планетарные линии → цена', 'Долгота планеты как ценовой уровень (ползёт во времени)'],
       ['PlanetIngress', '♈ Ингрессии планет', 'Вертикали при входе планеты в новый знак (каждые 30°)']].forEach(([name, label, tip]) =>
        mkBtn(gannWrap, label, (b) => {
          const on = !b.classList.contains('active'); b.classList.toggle('active', on);
          if (on) { state.chart.createIndicator({ name, paneId: 'candle_pane' }, true); state.candleInds[name] = true; }
          else removeCandInd(name);
        }, false, tip));
      mkBtn(gannWrap, '℞ Ретроградности (панель)', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) createRetroPane(); else removeRetroPane();
      }, false, 'Панель периодов попятного движения планет');
      [['PlanetFan', '🌬 Веер долготы', 'Веер от пивота: цена движется со скоростью долготы планет'],
       ['PlanetSq9', '⊞ Sq9 в градусах планет', 'Уровни, где угол колеса Квадрата-9 равен долготе планеты'],
       ['Eclipses', '⊘ Затмения', 'Вертикали солнечных (☉) и лунных (☾) затмений']].forEach(([name, label, tip]) =>
        mkBtn(gannWrap, label, (b) => {
          const on = !b.classList.contains('active'); b.classList.toggle('active', on);
          if (on) { state.chart.createIndicator({ name, paneId: 'candle_pane' }, true); state.candleInds[name] = true; }
          else removeCandInd(name);
        }, false, tip));
      mkBtn(gannWrap, '📊 Барометр аспектов (панель)', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) createBradleyPane(); else removeBradleyPane();
      }, false, 'Сидерограф: взвешенная сумма аспектов, экстремумы = даты разворота');
      const barModeBtn = mkBtn(gannWrap, '↕ Барометр: 1 линия / 2 полярности', () => {
        window.LUN.BAR.mode = window.LUN.BAR.mode === 'polar' ? 'signed' : 'polar';
        if (state.bradleyPane) { try { state.chart.removeIndicator({ paneId: state.bradleyPane }); state.chart.createIndicator({ name: 'BradleyStrip', paneId: state.bradleyPane }, false); } catch (e) {} }
        closeMenus();
      }, false, '1 знаковая линия ↔ 2 полярности (🟢 поддержка / 🔴 напряжение), две кривые: поддержка / напряжение');
      barModeBtn.dataset.sync = 'barMode';
      mkBtn(gannWrap, '🜨 Космограмма…', () => { closeMenus(); cosmogramModal(); }, false, 'Колесо зодиака с планетами и аспектами на дату');
      gsub('Прогностика');
      mkBtn(gannWrap, '🎯 Астро-фит: что работает…', () => { closeMenus(); astroFitModal(); }, false, 'Ранжирование астро-событий по совпадению с разворотами ЭТОГО инструмента (нужна история — D1, 1–3 года)');
      mkBtn(gannWrap, '📈 Прогноз циклов (линия)', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on); toggleProjection(on);
      }, false, 'Прогнозная линия из доминирующих циклов цены, продлённая вперёд');
      mkBtn(gannWrap, '📊 Композит по астро-состоянию…', () => { closeMenus(); compositeModal(); }, false, 'Среднее движение вперёд по фазе Луны / знаку планеты (сезонность)');
      mkBtn(gannWrap, '⚖ Астро-факторы на экстремумах…', () => { closeMenus(); farModal(); }, false, 'Взвешенные астро-факторы на вершинах/основаниях волны (по фильтрованной волне)');
      mkBtn(gannWrap, '🕉 СБЧ (Сарватобхадра-чакра)…', () => { closeMenus(); sbcModal(); }, false, 'Ведха-скаляр в сидерике (джйотиш): активация чувствительных накшатр инструмента. Не сигнал — проверяется Монте-Карло');
      mkBtn(gannWrap, '🎲 Монте-Карло: проверка гипотезы…', () => { closeMenus(); mcModal(); }, false, 'lift + перестановочный p: разворачивается ли цена у дат события чаще случайного');
      const mcyBtn = mkBtn(gannWrap, '🪐 Цикл Меркурий–Солнце (каркас)', (b) => {
        const on = !b.classList.contains('active'); b.classList.toggle('active', on);
        if (on) { window.LUN_MASLOV = window.LUN_MASLOV || { cycle: 'merc' }; state.chart.createIndicator({ name: 'MercSunCycle', paneId: 'candle_pane' }, true); state.candleInds.MercSunCycle = true; }
        else removeCandInd('MercSunCycle');
        closeMenus();
      }, false, 'Каркас Маслова: вертикали на этапах цикла Меркурий–Солнце (стоянки/соединения) + чередующийся фон. Направление не постулируется — проверяйте Монте-Карло');
      mcyBtn.dataset.sync = 'cand:MercSunCycle';
      mkBtn(gannWrap, '↺ Цикл: Меркурий↔Луна (валюты)', () => {
        window.LUN_MASLOV = window.LUN_MASLOV || { cycle: 'merc' };
        window.LUN_MASLOV.cycle = window.LUN_MASLOV.cycle === 'moon' ? 'merc' : 'moon';
        if (state.candleInds.MercSunCycle) { try { state.chart.removeIndicator({ paneId: 'candle_pane', name: 'MercSunCycle' }); state.chart.createIndicator({ name: 'MercSunCycle', paneId: 'candle_pane' }, true); } catch (e) {} }
        closeMenus();
      }, false, 'Переключить каркас: Меркурий–Солнце (товары/акции) ↔ Луна–Солнце (валюты, фазы Луны)');
      const hzBtn = mkBtn(gannWrap, '🔭 Прогноз каркаса: выкл', (b) => {
        window.LUN_MASLOV = window.LUN_MASLOV || { cycle: 'merc' };
        const cur = window.LUN_MASLOV.horizonQ || 0; const next = cur === 0 ? 1 : (cur === 1 ? 2 : 0);
        window.LUN_MASLOV.horizonQ = next;
        b.textContent = '🔭 Прогноз каркаса: ' + (next === 0 ? 'выкл' : next + ' кв.');
        // раздвинуть поле вправо, чтобы будущие этапы влезли
        try { const bs = state.chart.getBarSpace().bar || 6; state.chart.setOffsetRightDistance(next ? Math.max(80, next * 62 * bs) : 80); } catch (e) {}
        if (state.candleInds.MercSunCycle) { try { state.chart.removeIndicator({ paneId: 'candle_pane', name: 'MercSunCycle' }); state.chart.createIndicator({ name: 'MercSunCycle', paneId: 'candle_pane' }, true); } catch (e) {} }
        try { state.chart.resize(); } catch (e) {}
        closeMenus();
      }, false, 'Показать ближайшие этапы цикла вперёд: 1 или 2 квартала (даты будущих стоянок/соединений)');
      hzBtn.dataset.sync = 'maslovHz';
      const gnote = document.createElement('div'); gnote.className = 'menu-note';
      gnote.textContent = 'Инструменты Ганна: геометрия · квадраты · циклы · астро-Ганн';
      gannWrap.appendChild(gnote);
    }

    const drawWrap = document.getElementById('drawtools');
    DRAW_TOOLS.forEach((t) => {
      const b = mkBtn(drawWrap, t.label, () => startDraw(t.id), false, t.label + (t.key ? ' (' + t.key.toUpperCase() + ')' : ''));
      if (t.key) b.innerHTML = t.label + '<span class="hk">' + t.key.toUpperCase() + '</span>';   // хоткей справа
      regHotkey(t.key, () => startDraw(t.id));
    });
    mkBtn(drawWrap, '⚙ Настройки рисования (притяжка, Gann Box прогноз)…', () => { closeMenus(); drawSettingsModal(); }, false, 'Притяжка к вершинам баров, прогнозные Gann Box по диагонали');
    mkBtn(drawWrap, '✕ очистить всё', () => { closeMenus(); state.chart.removeOverlay(); }).className = 'danger';
    const drawNote = document.createElement('div'); drawNote.className = 'menu-note';
    drawNote.innerHTML = 'Как пользоваться:<br>• Выбери инструмент → клики по графику ставят точки (2 клика — линия/угол).<br>• <b>Ган 1×1</b> — от разворота; угол правится в свойствах.<br>• <b>Луч ⨯N</b> — до N-го пересечения уровня.<br>• <b>Вертикаль (дата)</b> — метка времени на графике.<br>• Клик по объекту — выделить, Delete — удалить, Ctrl+C/V — копия.<br>• Рисунки хранятся отдельно для каждого инструмента.';
    drawWrap.appendChild(drawNote);
    regHotkey('+', () => zoomChart(true)); regHotkey('=', () => zoomChart(true)); regHotkey('-', () => zoomChart(false));   // зум +/−

    const setWrap = document.getElementById('settings');
    mkBtn(setWrap, '🎨 Оформление, коннекторы, прогноз…', () => { closeMenus(); appearanceModal(); }, false, 'Тема (тёмная/светлая), тип свечей, коннекторы реалтайма, горизонт прогноза');
    const setBtn = mkBtn(setWrap, '⚙ Настройки (циклы, цвета знаков)', () => { closeMenus(); window.LunSettings.open(applySettings); }, false,
      'Цвета знаков и торговые зоны циклов (S)');
    regHotkey('s', () => setBtn.click());
    const btBtn = mkBtn(setWrap, '📊 Бэктест', async () => {
      closeMenus();
      const ins = state.instrument;
      const ticker = await window.LunData.resolveTicker(ins);
      window.LunBacktest.run({ engine: ins.engine || 'futures', market: ins.market || 'forts', ticker, title: (ins.title || ins.id) + ' · ' + ticker });
    }, false, 'Сверка лунных зон и аспектов с историей текущего инструмента (B)');
    regHotkey('b', () => btBtn.click());
    mkBtn(setWrap, '🔬 Исследование сигналов', () => { closeMenus(); researchModal(); }, false, 'Выбираемый бэктест: объём, EMA, пробой, RSI, лунные зоны — на текущих данных');
    mkBtn(setWrap, '📰 Новости по инструменту', () => { closeMenus(); toggleNews(!newsOpen); }, false, 'Правая колонка новостей по текущему инструменту (СМИ как контр-индикатор)');
    mkBtn(setWrap, '📷 Скрин графика (Ctrl+S)', () => { closeMenus(); screenshot(); }, false, 'PNG активного графика — скачать или открыть');
    mkBtn(setWrap, '📖 Справочник (статьи по инструментам)', () => { closeMenus(); helpArticlesModal(); }, false, 'Короткие статьи: что это, принцип, как читать и использовать — по каждому блоку');
    mkBtn(setWrap, '❓ Справка', () => { closeMenus(); helpModal(); }, false, 'Что умеет терминал');
    mkBtn(setWrap, '📚 Как пользоваться', () => { closeMenus(); guideModal(); }, false, 'Пошагово: Астро, Ганн, Бэктест');
    mkBtn(setWrap, '⌨ Горячие клавиши', () => { closeMenus(); hotkeysModal(); }, false, 'Список горячих клавиш');
    mkBtn(setWrap, '📜 Правила и конфиденциальность', () => { closeMenus(); legalModal(); }, false, 'Отказ от ответственности, конфиденциальность, условия использования');

    // Постоянная сноска в статус-баре: не обещаем доход, данные для исследования.
    try {
      const sb = document.querySelector('footer.statusbar');
      if (sb && !document.getElementById('legal-link')) {
        const a = document.createElement('span');
        a.id = 'legal-link';
        a.style.cssText = 'cursor:pointer;color:#6b7280;margin-left:12px';
        a.title = 'Не инвестрекомендация. Не обещаем доход — только данные и методы для исследования. Нажмите для полного текста.';
        a.textContent = '⚠ не инвестсовет · правила';
        a.onclick = () => legalModal();
        sb.appendChild(a);
      }
    } catch (e) {}

    // Алерты
    const alWrap = document.getElementById('alerts');
    if (alWrap) {
      mkBtn(alWrap, '🔔 Алерты…', () => { closeMenus(); alertsModal(); }, false, 'Создать/смотреть алерты (цена/астро), e-mail или Telegram. Работают на сервере — терминал можно закрыть');
      const note = document.createElement('div'); note.className = 'menu-note'; note.textContent = 'Нужен вход в аккаунт (👤). Проверка — на сервере (cron).'; alWrap.appendChild(note);
    }

    // Экраны — сетка графиков
    const layWrap = document.getElementById('layouts');
    Object.keys(LAYOUTS).forEach((k) => mkBtn(layWrap, LAYOUTS[k].label, (b) => {
      closeMenus(); [...layWrap.querySelectorAll('[data-lay]')].forEach((x) => x.classList.remove('active')); b.classList.add('active'); setLayout(k);
    }, k === '1', LAYOUTS[k].label).dataset.lay = k);
    const syncBtn = mkBtn(layWrap, '🔗 Синхр. кроссхейр', (b) => {
      syncCross = !b.classList.contains('active'); b.classList.toggle('active', syncCross); if (!syncCross) hideSync();
    }, true, 'Курсор в одном окне рисует перекрестье по тому же времени во всех (и по цене — где инструмент тот же)');
    syncBtn.style.marginTop = '4px';
  }

  /* ---------- мультичарт: сетка независимых слотов ---------- */
  const LAYOUTS = {
    '1': { label: '1 график', cells: 1, rows: '1fr', cols: '1fr' },
    '2': { label: '1×2', cells: 2, rows: '1fr', cols: '1fr 1fr' },
    '4': { label: '2×2', cells: 4, rows: '1fr 1fr', cols: '1fr 1fr' },
    '6': { label: '3×2', cells: 6, rows: '1fr 1fr', cols: '1fr 1fr 1fr' },
    '8': { label: '4×2', cells: 8, rows: '1fr 1fr', cols: '1fr 1fr 1fr 1fr' },
  };
  function highlightActive() {
    slots.forEach((s, i) => { if (s.cellEl) s.cellEl.classList.toggle('cell-active', i === activeIdx && slots.length > 1); });
  }

  /* ---------- синхронизация кроссхейра между ячейками ---------- */
  let syncCross = true;                 // синхронизировать перекрестье
  let syncRaf = null;
  const idxForTs = (list, ts) => { let lo = 0, hi = list.length - 1, idx = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m].timestamp <= ts) { idx = m; lo = m + 1; } else hi = m - 1; } return idx; };
  function hideSync() { slots.forEach((s) => { if (s.lines) { s.lines.v.style.display = 'none'; s.lines.h.style.display = 'none'; } }); }
  function doSync(src, clientX, clientY) {
    if (!syncCross || slots.length < 2) { hideSync(); return; }
    let coord; try { const r = src.cellEl.getBoundingClientRect(); coord = src.chart.convertFromPixel({ x: clientX - r.left, y: clientY - r.top }, { paneId: 'candle_pane' }); } catch (e) { return; }
    if (!coord) return;
    const srcList = src.chart.getDataList();
    const ts = coord.timestamp != null ? coord.timestamp : (srcList[coord.dataIndex] && srcList[coord.dataIndex].timestamp);
    const val = coord.value;
    if (ts == null) return;
    slots.forEach((s) => {
      if (!s.lines) return;
      const list = s.chart.getDataList(); const idx = idxForTs(list, ts);
      let px = null; if (idx >= 0) { try { px = s.chart.convertToPixel({ dataIndex: idx, value: val }, { paneId: 'candle_pane' }); } catch (e) {} }
      if (px && isFinite(px.x)) { s.lines.v.style.left = px.x + 'px'; s.lines.v.style.display = 'block'; } else s.lines.v.style.display = 'none';
      if (px && isFinite(px.y) && s.instrument.id === src.instrument.id) { s.lines.h.style.top = px.y + 'px'; s.lines.h.style.display = 'block'; } else s.lines.h.style.display = 'none';
    });
  }
  /* ---------- изменение размеров ячеек (перетаскивание границ) ---------- */
  let gridColFr = [], gridRowFr = [];
  const parseFr = (s) => String(s || '').trim().split(/\s+/).map((x) => { const m = /([\d.]+)fr/.exec(x); return m ? +m[1] : 1; });
  function addResizers(grid, L) {
    grid.style.position = 'relative';
    gridColFr = parseFr(L.cols); gridRowFr = parseFr(L.rows);
    const nC = gridColFr.length, nR = gridRowFr.length;
    const applyTracks = () => {
      grid.style.gridTemplateColumns = gridColFr.map((f) => f.toFixed(4) + 'fr').join(' ');
      grid.style.gridTemplateRows = gridRowFr.map((f) => f.toFixed(4) + 'fr').join(' ');
    };
    const handles = [];
    const reposition = () => {
      const totC = gridColFr.reduce((a, b) => a + b, 0), totR = gridRowFr.reduce((a, b) => a + b, 0);
      handles.forEach((h) => {
        const b = +h.dataset.b;
        if (h.dataset.kind === 'col') { let acc = 0; for (let k = 0; k < b; k++) acc += gridColFr[k]; h.style.left = (acc / totC * 100) + '%'; }
        else { let acc = 0; for (let k = 0; k < b; k++) acc += gridRowFr[k]; h.style.top = (acc / totR * 100) + '%'; }
      });
    };
    const mkHandle = (kind, b) => {
      const h = document.createElement('div'); h.dataset.kind = kind; h.dataset.b = b;
      h.style.cssText = 'position:absolute;z-index:40;background:transparent;' + (kind === 'col'
        ? 'top:0;bottom:0;width:10px;transform:translateX(-5px);cursor:col-resize'
        : 'left:0;right:0;height:10px;transform:translateY(-5px);cursor:row-resize');
      const line = document.createElement('div');
      line.style.cssText = kind === 'col' ? 'position:absolute;left:4px;top:0;bottom:0;width:2px;background:#2a3a4f' : 'position:absolute;top:4px;left:0;right:0;height:2px;background:#2a3a4f';
      h.appendChild(line);
      h.onmouseenter = () => line.style.background = '#3aa0ff'; h.onmouseleave = () => line.style.background = '#2a3a4f';
      grid.appendChild(h); handles.push(h);
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault(); try { h.setPointerCapture(e.pointerId); } catch (_) {}
        const rect = grid.getBoundingClientRect(), startX = e.clientX, startY = e.clientY;
        const arr = kind === 'col' ? gridColFr : gridRowFr, idx = +b;
        const a0 = arr[idx - 1], a1 = arr[idx], tot = arr.reduce((x, y) => x + y, 0);
        const px = kind === 'col' ? rect.width : rect.height, min = tot * 0.08;
        const move = (ev) => {
          const d = kind === 'col' ? (ev.clientX - startX) : (ev.clientY - startY);
          const dFr = d / px * tot; let n0 = a0 + dFr, n1 = a1 - dFr;
          if (n0 < min) { n1 -= (min - n0); n0 = min; } if (n1 < min) { n0 -= (min - n1); n1 = min; }
          arr[idx - 1] = n0; arr[idx] = n1; applyTracks(); reposition();
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); slots.forEach((s) => { try { s.chart.resize && s.chart.resize(); } catch (_) {} }); scheduleWsSave(); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      });
    };
    for (let c = 1; c < nC; c++) mkHandle('col', c);
    for (let r = 1; r < nR; r++) mkHandle('row', r);
    applyTracks(); reposition();
  }

  function wireSync(slot) {
    const cell = slot.cellEl;
    const v = document.createElement('div'); v.className = 'sync-vline';
    const h = document.createElement('div'); h.className = 'sync-hline';
    cell.appendChild(v); cell.appendChild(h); slot.lines = { v, h };
    cell.addEventListener('mousemove', (ev) => { if (syncRaf) cancelAnimationFrame(syncRaf); syncRaf = requestAnimationFrame(() => doSync(slot, ev.clientX, ev.clientY)); });
    cell.addEventListener('mouseleave', hideSync);
  }
  function slotHasSync(key) {
    const p = key.split(':'), t = p[0], arg = p[1];
    switch (t) {
      case 'ins': return state.instrument.id === arg;
      case 'tf': return state.tf.id === arg;
      case 'ov': return !!state.overlayIds[arg];
      case 'vol': return !!state.volumePane;
      case 'delta': return !!state.deltaPane;
      case 'markov': return !!state.markovPanes;
      case 'cand': return !!state.candleInds[arg];
      case 'sign': return !!state.signPanes[arg];
      case 'cyc': return !!state.cyclePanes[arg];
      case 'asp': return !!state.aspectPanes[arg];
      case 'allasp': return !!state.allAspectPane;
      case 'uranus': return !!state.uranusPane;
      case 'forecast': return !!state.forecastOn;
      case 'oi': return !!state.oiPane;
      case 'vwapmulti': return !!state.vwapOn;
      case 'swing': return !!(state.swings && state.swingsOn && state.swings.nbars === +arg);
    }
    return false;
  }
  function syncToolbar() {
    document.querySelectorAll('[data-sync]').forEach((b) => b.classList.toggle('active', slotHasSync(b.dataset.sync)));
    document.getElementById('sym-title').textContent = `${state.instrument.title}  ·  ${state.tf.title}` + (slots.length > 1 ? `   [ячейка ${activeIdx + 1}/${slots.length}]` : '');
  }
  function activateSlot(i) {
    if (i < 0 || i >= slots.length || i === activeIdx) return;
    activeIdx = i; state = slots[i]; window.LUN_CHART = state.chart;
    highlightActive(); syncToolbar();
    showMarkovPanel(!!state.markovPanes);   // панель Маркова следует за активной ячейкой
  }
  function setLayout(key) {
    const L = LAYOUTS[key] || LAYOUTS['1'];
    const prev = slots.map((s) => ({ instrument: s.instrument, tf: s.tf }));
    if (window.LunStream) window.LunStream.detachAll();
    slots.forEach((s) => { if (s.markovTimer) { clearInterval(s.markovTimer); s.markovTimer = null; } try { kc.dispose(s.cellEl); } catch (e) {} });
    const mp = document.getElementById('markov-panel'); if (mp) mp.remove();
    const grid = document.getElementById('chart');
    grid.innerHTML = ''; grid.style.display = 'grid'; grid.style.gap = '2px';
    grid.style.gridTemplateRows = L.rows; grid.style.gridTemplateColumns = L.cols;
    slots = [];
    for (let i = 0; i < L.cells; i++) {
      const cell = document.createElement('div'); cell.className = 'cell'; cell.dataset.slot = i; grid.appendChild(cell);
      const slot = makeSlot(i); slot.cellEl = cell;
      if (prev[i]) { slot.instrument = prev[i].instrument; slot.tf = prev[i].tf; }
      else { slot.instrument = window.LUN.INSTRUMENTS[Math.min(i, window.LUN.INSTRUMENTS.length - 1)]; slot.tf = DEFAULT_TF; }
      slot.chart = kc.init(cell, { styles: THEME });
      cell.addEventListener('mousedown', () => activateSlot(i));
      // клик по ПОЛЮ (не по объекту) — снять выделение и спрятать панель свойств.
      // Если клик попал в объект, sel() обновит lastSelTs и панель останется.
      cell.addEventListener('click', () => {
        setTimeout(() => {
          if (Date.now() - lastSelTs < 120) return;   // только что выделили объект — панель оставить
          state.selectedOverlayId = null; state.selectedOverlay = null; hideStylePanel();
        }, 40);
      });
      // отслеживаем панель под курсором (для удаления двойным кликом)
      try { slot.chart.subscribeAction('onCrosshairChange', (d) => { slot.hoverPaneId = d && d.paneId; }); } catch (e) {}
      cell.addEventListener('dblclick', (e) => {
        const r = cell.getBoundingClientRect();
        if (e.clientX > r.right - 150 && e.clientY > r.bottom - 70) { activateSlot(i); recenterLastPrice(slots[i]); return; }
        // двойной клик по ПОЛЮ ЦЕНЫ — спрятать/показать весь подвал (как в Tiger Trade)
        const pid = slots[i].hoverPaneId;
        if (!pid || pid === 'candle_pane') { activateSlot(i); togglePanesHidden(slots[i]); }
      });
      slots.push(slot);
      if (L.cells > 1) wireSync(slot);
    }
    activeIdx = 0; state = slots[0]; window.LUN_CHART = state.chart;
    slots.forEach((s) => { state = s; buildPanes(); });   // buildPanes синхронно, по активному state
    state = slots[0];
    applyChartLook();                                      // тема + тип свечей
    slots.forEach((s) => load(s));
    if (L.cells > 1) { addResizers(grid, L); setTimeout(() => { try { mirrorToSiblings(state); } catch (e) {} }, 1200); }
    highlightActive(); syncToolbar();
  }

  // тумблеры аспектов: по планете (☉/планета) + сводная «∀ все»
  function buildAspectButtons() {
    const aspWrap = document.getElementById('aspects');
    aspWrap.innerHTML = '';
    window.LUN.ASPECT_PLANETS.forEach((pl, i) => { mkBtn(aspWrap, pl.glyph, (b) => {
      pl.enabled = !b.classList.contains('active'); b.classList.toggle('active', pl.enabled);
      if (pl.enabled) createSunAspect(pl, 15 + i);
      else if (state.aspectPanes[pl.body]) { state.chart.removeIndicator({ paneId: state.aspectPanes[pl.body] }); delete state.aspectPanes[pl.body]; }
    }, pl.enabled, `Аспекты ☉/${pl.glyph} (${pl.body})`).dataset.sync = 'asp:' + pl.body; });
    mkBtn(aspWrap, '∀ все', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on); window.LUN.ALL_ASPECTS.enabled = on;
      if (on) createAllAspect(); else if (state.allAspectPane) { state.chart.removeIndicator({ paneId: state.allAspectPane }); state.allAspectPane = null; }
    }, window.LUN.ALL_ASPECTS.enabled, 'Сводная полоса всех аспектов всех пар (детально на M5/M15)').dataset.sync = 'allasp';
    // отдельная полоса: Уран — все планеты (мажорные аспекты)
    const urBtn = mkBtn(aspWrap, '♅∀', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createUranusStrip(); else if (state.uranusPane) { state.chart.removeIndicator({ paneId: state.uranusPane }); state.uranusPane = null; }
    }, !!state.uranusPane, 'Аспекты Урана ко всем планетам (U)');
    urBtn.dataset.sync = 'uranus';
    regHotkey('u', () => urBtn.click());
    // пользовательский аспектариум: выбранные пары планет (и узлов) во времени
    mkBtn(aspWrap, '⚙ Аспекты по выбору…', () => { closeMenus(); aspectSelectModal(); }, false, 'Свои пары планет/узлов: кто ↔ с кем (до 3), до 5 блоков. Узлы Луны ☊/☋ поддержаны');
    const asBtn = mkBtn(aspWrap, '📶 Аспекты по выбору (лента)', (b) => {
      const on = !b.classList.contains('active');
      if (on) { if (!(window.LUN.ASPSEL.blocks || []).length) { aspectSelectModal(); b.classList.remove('active'); return; } b.classList.add('active'); createAspSelPane(); }
      else { b.classList.remove('active'); removeAspSelPane(); }
    }, false, 'Показать/скрыть ленту выбранных аспектов');
    asBtn.dataset.sync = 'aspsel';
    // ---- Исследование аспектов ----
    const svSub = document.createElement('div'); svSub.className = 'menu-sub'; svSub.textContent = 'Исследование аспектов'; aspWrap.appendChild(svSub);
    const svBtn = mkBtn(aspWrap, '🟢🔴 Динамика (зелёные/красные)', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) createSvirPane(); else removeSvirPane(); closeMenus();
    }, false, 'Две кривые: поддержка (зел.) и напряжение (красн.), пересечение = смена баланса');
    svBtn.dataset.sync = 'svir';
    mkBtn(aspWrap, '🔍 Аспекты у даты…', () => { closeMenus(); svirDateModal(); }, false, 'Все точные аспекты в окне ±1–2 дня вокруг выбранной даты');
    mkBtn(aspWrap, '🔄 Аспекты на разворотах', () => { closeMenus(); svirPivotsModal(); }, false, 'Найти развороты (ZigZag) на графике и показать аспекты у каждого (±дни)');
    mkBtn(aspWrap, '⚙ Настройки аспектов', () => { closeMenus(); svirSettingsModal(); }, false, 'Какие планеты и аспекты в зелёные/красные, орб, окно');
  }
  /* ---------- Исследование аспектов: панель динамики + модалки ---------- */
  const SVIR_PANE = 'pane_svir';
  function createSvirPane() {
    if (state.svirPane) { try { state.chart.removeIndicator({ paneId: state.svirPane }); } catch (e) {} }
    state.chart.createIndicator({ name: 'SviridovDyn', paneId: SVIR_PANE, shortName: 'Аспекты 🟢🔴' }, false);
    state.svirPane = SVIR_PANE; wishPane(SVIR_PANE, { height: 100, order: 44 });
  }
  function removeSvirPane() { if (state.svirPane) { try { state.chart.removeIndicator({ paneId: state.svirPane }); } catch (e) {} state.svirPane = null; } }
  function svirListHtml(list) {
    if (!list.length) return '<p style="color:#6b7280">Аспектов в окне не найдено.</p>';
    const G = window.LunSvir.G;
    return '<table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>' + list.map((x) => {
      const d = new Date(x.exactTs), dd = ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
      const c = x.color === 'green' ? '#26a69a' : '#ef5350';
      return `<tr><td style="color:${c};font-size:15px;padding:2px 8px 2px 0">${G(x.a)} ${x.sym} ${G(x.b)}</td><td style="color:#8b93a7">${x.a}–${x.b}</td><td style="text-align:right;color:${c}">${dd}</td></tr>`;
    }).join('') + '</tbody></table>';
  }
  function svirDateModal() {
    if (!window.LunSvir) { openModal('Исследование аспектов', '<p>Модуль не загрузился.</p>'); return; }
    let def = Date.now(); try { const l = state.chart.getDataList(); if (l && l.length) def = l[l.length - 1].timestamp; } catch (e) {}
    const ds = new Date(def).toISOString().slice(0, 10);
    const ss = 'background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:5px 8px';
    openModal('🔍 Аспекты у даты', `
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px">
        <label>Дата<br><input id="sv-date" type="date" value="${ds}" style="${ss}"></label>
        <label>Окно ±дней<br><select id="sv-win" style="${ss}"><option value="1">1</option><option value="2">2</option></select></label>
        <button id="sv-go" style="background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer">Показать</button>
      </div>
      <div id="sv-out">…</div>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    const run = () => { const v = bg.querySelector('#sv-date').value, w = +bg.querySelector('#sv-win').value || 1; const ts = v ? Date.parse(v + 'T12:00:00') : def; bg.querySelector('#sv-out').innerHTML = svirListHtml(window.LunSvir.aspectsAround(ts, w)); };
    bg.querySelector('#sv-go').onclick = run; run();
  }
  function svirPivotsModal() {
    if (!window.LunSvir || !window.LunMC) { openModal('Исследование аспектов', '<p>Модуль не загрузился.</p>'); return; }
    let bars = []; try { bars = state.chart.getDataList() || []; } catch (e) {}
    if (bars.length < 40) { alert('Мало истории. Углубите «Период».'); return; }
    const ss = 'background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:5px 8px';
    openModal('🔄 Аспекты на разворотах', `
      <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px">
        <label>Разворот ≥ %<br><input id="pv-pct" type="number" step="0.5" min="1" value="4" style="${ss};width:80px"></label>
        <label>Окно ±дней<br><select id="pv-win" style="${ss}"><option value="1">1</option><option value="2">2</option></select></label>
        <button id="pv-go" style="background:#1f2b3d;color:#d7deea;border:1px solid #3aa0ff;border-radius:6px;padding:6px 12px;cursor:pointer">Найти</button>
      </div>
      <div id="pv-out" style="max-height:56vh;overflow:auto">…</div>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    const run = () => {
      const pct = +bg.querySelector('#pv-pct').value || 4, w = +bg.querySelector('#pv-win').value || 1;
      const piv = window.LunMC.detectPivots(bars, pct);
      if (!piv.length) { bg.querySelector('#pv-out').innerHTML = '<p style="color:#6b7280">Разворотов не найдено (уменьшите %).</p>'; return; }
      const html = piv.slice(-40).reverse().map((idx) => {
        const b = bars[idx], d = new Date(b.timestamp), dd = ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear();
        const asp = window.LunSvir.aspectsAround(b.timestamp, w);
        return `<div style="border-top:1px solid #232b3a;padding:6px 0"><b>${dd}</b> · цена ${b.close}<br>${svirListHtml(asp)}</div>`;
      }).join('');
      bg.querySelector('#pv-out').innerHTML = '<p style="color:#8b93a7">Разворотов: ' + piv.length + ' (показаны последние 40)</p>' + html;
    };
    bg.querySelector('#pv-go').onclick = run; run();
  }
  function svirSettingsModal() {
    const S = window.LUN.SVIR;
    const ANG = [[0, '☌ соединение'], [60, '⚹ секстиль'], [90, '□ квадрат'], [120, '△ трин'], [180, '☍ оппозиция'], [45, '∠ полукв.'], [135, '⚼ полутора'], [150, '⚻ квинконс'], [30, '⚺ 30°'], [72, 'квинтиль 72°']];
    const PLA = window.LunSvir.ALLP;
    const ss = 'background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:4px 6px';
    const aspRows = ANG.map(([a, lbl]) => {
      const cur = (S.green || []).indexOf(a) >= 0 ? 'green' : ((S.red || []).indexOf(a) >= 0 ? 'red' : (a === 0 ? (S.neutral0 || 'off') : 'off'));
      return `<tr><td style="padding:2px 8px 2px 0">${lbl}</td><td><select class="sv-asp" data-a="${a}" style="${ss}"><option value="off"${cur === 'off' ? ' selected' : ''}>—</option><option value="green"${cur === 'green' ? ' selected' : ''}>🟢 гармония</option><option value="red"${cur === 'red' ? ' selected' : ''}>🔴 напряжение</option></select></td></tr>`;
    }).join('');
    const plBoxes = PLA.map((p) => `<label style="display:inline-block;margin:2px 8px 2px 0"><input type="checkbox" class="sv-pl" data-p="${p}"${(S.planets || []).indexOf(p) >= 0 ? ' checked' : ''}> ${window.LunSvir.G(p)} ${p}</label>`).join('');
    openModal('⚙ Исследование аспектов — настройки', `
      <p style="color:#8b93a7">Распределите аспекты по цветам и выберите планеты. Влияет на динамику, «аспекты у даты» и «на разворотах».</p>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <div><b>Аспекты</b><table style="border-collapse:collapse;font-size:13px;margin-top:4px">${aspRows}</table></div>
        <div style="flex:1;min-width:220px"><b>Планеты</b><div style="margin-top:6px">${plBoxes}</div>
          <div style="margin-top:12px"><label>Орб, °: <input id="sv-orb" type="number" step="0.5" min="0.5" max="8" value="${S.orb || 2}" style="${ss};width:60px"></label></div>
          <div style="margin-top:8px"><label>Система: <select id="sv-frame" style="${ss}"><option value="geo"${S.frame !== 'helio' ? ' selected' : ''}>гео</option><option value="helio"${S.frame === 'helio' ? ' selected' : ''}>гелио</option></select></label></div>
        </div>
      </div>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    const apply = () => {
      const green = [], red = []; let n0 = 'off';
      bg.querySelectorAll('.sv-asp').forEach((s) => { const a = +s.dataset.a, v = s.value; if (a === 0) { n0 = v; } if (v === 'green') green.push(a); else if (v === 'red') red.push(a); });
      S.green = green.filter((a) => a !== 0); S.red = red.filter((a) => a !== 0); S.neutral0 = n0;
      S.planets = [...bg.querySelectorAll('.sv-pl')].filter((c) => c.checked).map((c) => c.dataset.p);
      S.orb = Math.max(0.5, +bg.querySelector('#sv-orb').value || 2);
      S.frame = bg.querySelector('#sv-frame').value === 'helio' ? 'helio' : 'geo';
      if (state.svirPane) { try { state.chart.removeIndicator({ paneId: state.svirPane }); state.chart.createIndicator({ name: 'SviridovDyn', paneId: state.svirPane, shortName: 'Аспекты 🟢🔴' }, false); } catch (e) {} }
      scheduleWsSave();
    };
    bg.querySelectorAll('.sv-asp,.sv-pl,#sv-orb,#sv-frame').forEach((el) => el.onchange = apply);
  }
  const ASPSEL_PANE = 'pane_aspsel';
  function createAspSelPane() {
    if (state.aspSelPane) { try { state.chart.removeIndicator({ paneId: state.aspSelPane }); } catch (e) {} }
    state.chart.createIndicator({ name: 'AspectSelect', paneId: ASPSEL_PANE, shortName: 'Аспекты по выбору' }, false);
    state.aspSelPane = ASPSEL_PANE;
    const n = Math.max(2, Math.min(12, (window.LUN.ASPSEL.blocks || []).reduce((s, b) => s + ((b.whom || []).length), 0)));
    wishPane(ASPSEL_PANE, { height: 26 + n * 18, minHeight: 26, order: 29 });
  }
  function removeAspSelPane() { if (state.aspSelPane) { try { state.chart.removeIndicator({ paneId: state.aspSelPane }); } catch (e) {} state.aspSelPane = null; } }
  function aspectSelectModal() {
    const SEL = window.LUN.ASPSEL, bodies = SEL.bodies || [];
    if (!SEL.blocks) SEL.blocks = [];
    if (!SEL.blocks.length) SEL.blocks = [{ who: 'Sun', whom: ['Moon'] }];
    const opt = (sel) => bodies.map((b) => `<option value="${b.id}"${b.id === sel ? ' selected' : ''}>${b.g} ${b.id}</option>`).join('');
    const ss = 'background:#0b0e14;color:#d7deea;border:1px solid #2a3242;border-radius:6px;padding:4px 6px;font-size:13px';
    openModal('Аспекты по выбору', `
      <p style="color:#8b93a7">В каждом блоке: <b>кто</b> (1 планета/узел) ↔ <b>с кем</b> (до 3). До 5 блоков. Лента покажет дни, когда пара в мажорном аспекте (☌⚹□△☍), цвет = аспект, крупная точка = точный. Узлы Луны ☊/☋ доступны.</p>
      <div id="as-blocks"></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px">
        <button id="as-add" style="padding:5px 10px;background:#1a2130;color:#d7deea;border:1px solid #232b3a;border-radius:6px;cursor:pointer">➕ блок</button>
        <label>Орб <input id="as-orb" type="number" min="1" max="12" step="0.5" value="${SEL.orb || 5}" style="${ss};width:64px"></label>
        <label>Система <select id="as-frame" style="${ss}"><option value="geo"${SEL.frame !== 'helio' ? ' selected' : ''}>гео</option><option value="helio"${SEL.frame === 'helio' ? ' selected' : ''}>гелио</option></select></label>
        <span style="flex:1"></span>
        <button id="as-apply" style="padding:6px 14px;background:#1c3a2a;color:#d7deea;border:1px solid #2a5a3a;border-radius:6px;cursor:pointer">Применить и показать</button>
      </div>`);
    const bg = document.querySelector('.lun-modal-bg'); if (!bg) return;
    const wrap = bg.querySelector('#as-blocks');
    const render = () => {
      wrap.innerHTML = '';
      SEL.blocks.slice(0, 5).forEach((bl, bi) => {
        if (!bl.whom) bl.whom = [];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;border:1px solid #232b3a;border-radius:8px;padding:8px;margin-bottom:8px';
        const whom = bl.whom.slice(0, 3);
        row.innerHTML = `<b style="color:#3aa0ff">Блок ${bi + 1}</b>
          <label>кто <select class="as-who" data-b="${bi}" style="${ss}">${opt(bl.who)}</select></label>
          <span style="color:#8b93a7">↔ с кем:</span>
          <span class="as-whom">${[0, 1, 2].map((wi) => `<select class="as-w" data-b="${bi}" data-w="${wi}" style="${ss};margin-right:4px"><option value="">—</option>${bodies.map((b) => `<option value="${b.id}"${whom[wi] === b.id ? ' selected' : ''}>${b.g} ${b.id}</option>`).join('')}</select>`).join('')}</span>
          <button class="as-del" data-b="${bi}" title="удалить блок" style="margin-left:auto;background:#3a1a20;color:#ef8a8a;border:1px solid #5a2a30;border-radius:6px;padding:3px 8px;cursor:pointer">✕</button>`;
        wrap.appendChild(row);
      });
      wrap.querySelectorAll('.as-who').forEach((s) => s.onchange = () => { SEL.blocks[+s.dataset.b].who = s.value; });
      wrap.querySelectorAll('.as-w').forEach((s) => s.onchange = () => {
        const bl = SEL.blocks[+s.dataset.b]; const arr = [0, 1, 2].map((wi) => (wrap.querySelector(`.as-w[data-b="${s.dataset.b}"][data-w="${wi}"]`) || {}).value).filter(Boolean);
        bl.whom = arr;
      });
      wrap.querySelectorAll('.as-del').forEach((s) => s.onclick = () => { SEL.blocks.splice(+s.dataset.b, 1); if (!SEL.blocks.length) SEL.blocks = [{ who: 'Sun', whom: ['Moon'] }]; render(); });
    };
    render();
    bg.querySelector('#as-add').onclick = () => { if (SEL.blocks.length < 5) { SEL.blocks.push({ who: 'Sun', whom: ['Moon'] }); render(); } };
    bg.querySelector('#as-apply').onclick = () => {
      SEL.orb = Math.max(1, Math.min(12, +bg.querySelector('#as-orb').value || 5));
      SEL.frame = bg.querySelector('#as-frame').value === 'helio' ? 'helio' : 'geo';
      SEL.blocks = SEL.blocks.filter((b) => b.who && (b.whom || []).length).slice(0, 5);
      if (!SEL.blocks.length) { alert('Добавьте хотя бы одну пару.'); return; }
      bg.remove(); createAspSelPane();
      const asBtn = document.querySelector('#aspects [data-sync="aspsel"]'); if (asBtn) asBtn.classList.add('active');
      scheduleWsSave();
    };
  }
  const URANUS_PANE = 'pane_asp_uranus';
  function createUranusStrip() {
    state.chart.createIndicator({ name: 'UranusAspects', paneId: URANUS_PANE, shortName: '♅ ко всем', extendData: { orb: clampOrb() } }, false);
    state.uranusPane = URANUS_PANE;
    wishPane(URANUS_PANE, { height: window.LUN.PANE_HEIGHTS.cycle + 4, minHeight: 20, order: 28 });
  }

  // тумблеры циклов (пересобираются после изменения настроек)
  function toggleMoonSign(on) {
    if (on) {
      if (state.signPanes.Moon) return;
      state.signPane = 'pane_sign_Moon';
      state.chart.createIndicator({ name: 'SignStrip', paneId: state.signPane, shortName: BODY_LABEL.Moon, extendData: { body: 'Moon', frame: 'geo' } }, false);
      state.signPanes.Moon = state.signPane;
      wishPane(state.signPane, { height: window.LUN.PANE_HEIGHTS.moonSign, minHeight: 26, order: 10 });
    } else if (state.signPanes.Moon) {
      try { state.chart.removeIndicator({ paneId: state.signPanes.Moon }); } catch (e) {}
      delete state.signPanes.Moon; state.signPane = null;
    }
  }
  function buildCycleButtons() {
    const cycWrap = document.getElementById('cycles');
    cycWrap.innerHTML = '';
    mkBtn(cycWrap, '☾ Луна в знаках', (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on); toggleMoonSign(on);
    }, true, 'Верхняя лента знаков Луны (цвет по знаку, градус). Тумблер показать/скрыть');
    mkBtn(cycWrap, '🗓 Астро-календарь', () => { closeMenus(); toggleCalendar(!calOpen); }, false, 'Правая панель: ближайшие ингрессии, аспекты, ретро, фазы, затмения (90 дней)');
    window.LUN.CYCLES.forEach((cy, i) => { mkBtn(cycWrap, String(i + 1), (b) => {
      const on = !b.classList.contains('active'); b.classList.toggle('active', on);
      if (on) { if (!state.cyclePanes[cy.id]) createCyclePane(cy, 11 + i); }
      else if (state.cyclePanes[cy.id]) { state.chart.removeIndicator({ paneId: state.cyclePanes[cy.id] }); delete state.cyclePanes[cy.id]; }
    }, cy.enabled, cy.title).dataset.sync = 'cyc:' + cy.id; });
  }

  // применить настройки: пересобрать ленту знаков и полосы циклов
  function applySettings() {
    const c = state.chart;
    const openBodies = Object.keys(state.signPanes);
    openBodies.forEach((body) => c.removeIndicator({ paneId: state.signPanes[body] }));
    state.signPanes = {};
    Object.values(state.cyclePanes).forEach((pid) => c.removeIndicator({ paneId: pid }));
    state.cyclePanes = {};
    // заново создаём открытые ленты знаков (Луна всегда) и включённые циклы
    const orderOf = { Moon: 10, Mercury: 12, Sun: 13, Venus: 14, Mars: 15, Jupiter: 16, Saturn: 17 };
    (openBodies.length ? openBodies : ['Moon']).forEach((body) => createSignPane(body, orderOf[body] || 15));
    state.signPane = state.signPanes.Moon;
    window.LUN.CYCLES.forEach((cy, i) => { if (cy.enabled) createCyclePane(cy, 11 + i); });
    buildCycleButtons();
    // пересоздать активные индикаторы (SMA/EMA/VWAP) с новыми параметрами
    Object.keys(state.overlayIds).forEach((kind) => { toggleOverlay(kind, false); toggleOverlay(kind, true); });
    // аспекты: орб/включённость могли смениться — пересобрать
    Object.keys(state.aspectPanes).forEach((k) => c.removeIndicator({ paneId: state.aspectPanes[k] }));
    state.aspectPanes = {};
    if (state.allAspectPane) { c.removeIndicator({ paneId: state.allAspectPane }); state.allAspectPane = null; }
    if (state.uranusPane) { c.removeIndicator({ paneId: state.uranusPane }); state.uranusPane = null; }
    window.LUN.ASPECT_PLANETS.forEach((pl, i) => { if (pl.enabled) createSunAspect(pl, 15 + i); });
    if (window.LUN.ALL_ASPECTS.enabled) createAllAspect();
    buildAspectButtons();
    updateMoonStatus();
  }

  /* ---------- init ---------- */
  function init() {
    addMarkovCss();
    buildUI();
    // выпадающие меню: клик по пункту открывает/закрывает, клик вне — закрывает
    document.querySelectorAll('.menubar .menu-btn').forEach((btn) => {
      btn.onclick = (e) => { e.stopPropagation(); const menu = btn.parentElement, open = menu.classList.contains('open'); closeMenus(); if (!open) menu.classList.add('open'); };
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) closeMenus(); });
    if (window.LunStream) window.LunStream.onStatus((txt, color) => { const el = document.getElementById('stream-status'); if (el) { el.textContent = txt; el.style.color = color; } });
    setLayout('1');       // создаёт график(и), панели и загрузку
    // коннекторы включены по умолчанию (stream.js: enabled=true) — цена всегда
    // движется. Достаточно один раз подписать открытые слоты (load() тоже это
    // делает; здесь — страховка на случай гонки таймингов при старте).
    if (window.LunStream) setTimeout(() => { slots.forEach((s) => window.LunStream.attach(s)); }, 1200);
    // Страховка восстановления рабочего стола: если auth.php недоступен или юзер
    // не вошёл — anonymous-стол из localStorage всё равно вернётся (разметка,
    // индикаторы, VWAP). Если auth.js уже применил стол — сработает guard wsApplied.
    setTimeout(() => { if (!wsApplied && window.LUN_APPLY_WS) window.LUN_APPLY_WS(); }, 2600);
    updateMoonStatus();
    setInterval(updateMoonStatus, 60000);
    setInterval(() => scheduleWsSave(), 25000);   // страховочное авто-сохранение рабочего стола
    window.addEventListener('lun:datasource', () => {
      const el = document.getElementById('datasource');
      el.textContent = window.LUN_DATA_SOURCE || '';
      el.title = window.LUN_DATA_ERROR || '';
      el.style.color = window.LUN_DATA_ERROR ? '#e0a030' : '#26a69a';
      slots.forEach((s) => scheduleApply(s));   // данные загружены — закрепляем высоты панелей всех слотов
      // коннекторы всегда живые: после (пере)загрузки данных переподписываем поток
      // активного слота (вне реплея). Страж целостности в stream.js не даст чужому
      // бару попасть в график.
      if (window.LunStream && !(window.LUN_REPLAY && window.LUN_REPLAY.on)) { try { window.LunStream.attach(state); } catch (e) {} }
      if (state.markovPanes) setTimeout(refreshMarkovPanel, 200);
      // прогноз в активном слоте выключаем при перезагрузке данных (шаг ТФ иной)
      if (state.forecastOn) { window.LUN_FORECAST = { enabled: false }; state.forecastOn = false; try { state.chart.setOffsetRightDistance(80); } catch (e) {} syncToolbar(); }
    });
    // состояние Ctrl — для Ctrl+перетаскивание = копирование оверлея
    window.addEventListener('keydown', (e) => { if (e.key === 'Control' || e.ctrlKey) ctrlDown = true; });
    window.addEventListener('keyup', (e) => { if (e.key === 'Control') ctrlDown = false; });
    window.addEventListener('blur', () => { ctrlDown = false; });
    // Delete / Ctrl+C·V·S — работа с выделенным оверлеем и скрин
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('.lun-modal-bg')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedOverlayId) { e.preventDefault(); deleteSelected(); return; }
      if (e.ctrlKey || e.metaKey) {
        const k = keyFromEvent(e);
        if (k === 'c') { if (copySelected()) e.preventDefault(); }
        else if (k === 'v') { if (pasteOverlay()) e.preventDefault(); }
        else if (k === 's') { e.preventDefault(); screenshot(); }
      }
    });
    // горячие клавиши (кроме ввода текста и открытых модалок)
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('.lun-modal-bg')) return;
      const fn = hotkeys[keyFromEvent(e)] || hotkeys[(e.key || '').toLowerCase()];
      if (fn) { const handled = fn(); if (handled !== false) e.preventDefault(); }   // fn вернул false — не перехватываем клавишу
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
