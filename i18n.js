(function () {
  'use strict';

  const LANGS = [
    { code: 'en', name: 'English',    flag: '🇺🇸' },
    { code: 'es', name: 'Español',    flag: '🇪🇸' },
    { code: 'zh', name: '中文',        flag: '🇨🇳' },
    { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' },
    { code: 'ru', name: 'Русский',    flag: '🇷🇺' },
    { code: 'ko', name: '한국어',      flag: '🇰🇷' },
    { code: 'tl', name: 'Tagalog',    flag: '🇵🇭' },
    { code: 'uk', name: 'Українська', flag: '🇺🇦' },
    { code: 'so', name: 'Soomaali',   flag: '🇸🇴' },
    { code: 'ar', name: 'العربية',    flag: '🇸🇦' },
    { code: 'am', name: 'አማርኛ',       flag: '🇪🇹' },
  ];
  const RTL = ['ar'];
  const STORAGE_KEY = 'sln_lang';
  const cache = {};
  let currentLang = localStorage.getItem(STORAGE_KEY) || 'en';

  function buildSwitcher() {
    const mount = document.getElementById('lang-switch');
    if (!mount) return;

    const active = LANGS.find(l => l.code === currentLang) || LANGS[0];
    mount.innerHTML = `
      <button class="lang-btn" id="lang-btn" aria-haspopup="true" aria-expanded="false">
        <span class="lang-flag">${active.flag}</span>
        <span>${active.code.toUpperCase()}</span>
        <span class="lg-caret">▾</span>
      </button>
      <div class="lang-menu" id="lang-menu" role="menu">
        ${LANGS.map(l => `
          <div class="lang-opt${l.code === currentLang ? ' active' : ''}" data-lang="${l.code}" role="menuitem">
            <span class="lang-flag">${l.flag}</span><span>${l.name}</span>
          </div>
        `).join('')}
      </div>
    `;

    const btn = document.getElementById('lang-btn');
    const menu = document.getElementById('lang-menu');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.toggle('open');
      btn.classList.toggle('open', isOpen);
    });

    document.addEventListener('click', () => {
      menu.classList.remove('open');
      btn.classList.remove('open');
    });

    menu.querySelectorAll('.lang-opt').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const lang = opt.getAttribute('data-lang');
        menu.classList.remove('open');
        btn.classList.remove('open');
        setLanguage(lang);
      });
    });
  }

  async function loadDict(lang) {
    if (cache[lang]) return cache[lang];
    try {
      const res = await fetch(`/locales/${lang}.json`);
      if (!res.ok) throw new Error('locale not found: ' + lang);
      const dict = await res.json();
      cache[lang] = dict;
      return dict;
    } catch (err) {
      console.error('[i18n] failed to load', lang, err);
      return null;
    }
  }

  function applyDict(dict) {
    if (!dict) return;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) el.innerHTML = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key]) el.setAttribute('placeholder', dict[key]);
    });
  }

  function applyDirection(lang) {
    const isRtl = RTL.includes(lang);
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', lang);
  }

  async function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    applyDirection(lang);
    const dict = await loadDict(lang);
    applyDict(dict);
    buildSwitcher();
  }

  function init() {
    buildSwitcher();
    applyDirection(currentLang);
    if (currentLang !== 'en') {
      loadDict(currentLang).then(applyDict);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
