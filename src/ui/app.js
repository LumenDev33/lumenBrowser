/* =========================================================
   Lumen — renderer
   The quiet layer between you and the web.
   ========================================================= */

const NEWTAB = "lumen://newtab";

const ENGINES = {
  chrome: { name: "Chrome", url: "https://www.google.com/search?q=" },
  yandex: { name: "Яндекс", url: "https://yandex.ru/search/?text=" },
  duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" }
};

const THEMES = {
  dark: { name: "Тёмная", icon: "moon" },
  light: { name: "Светлая", icon: "sun" },
  system: { name: "Системная", icon: "system" }
};

const ACCENTS = {
  gold: { name: "Золото", color: "#f3d37a" },
  mint: { name: "Мята", color: "#a8e6cf" },
  blue: { name: "Небо", color: "#9ec5ff" },
  coral: { name: "Коралл", color: "#ffb09a" }
};

const TINT_PALETTE = ["#f3d37a", "#9ec5ff", "#ff9e80", "#a8e6cf", "#d7c4ff", "#ffb2c8"];

const api = window.lumen || createMockApi();

let state = null;

const ui = {
  panel: null,
  paletteOpen: false,
  paletteQuery: "",
  paletteIndex: 0,
  paletteItems: [],
  settingsOpen: false,
  historyQuery: "",
  newtabSignature: "",
  addressTabId: null,
  toastTimer: null,
  boundsFrame: null
};

const el = {};

/* =========================================================
   Utilities
   ========================================================= */

function escapeHTML(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#39;";
  });
}

function safeColor(value, fallback = "#f3d37a") {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function domainOf(url) {
  const host = hostOf(url);
  return host || String(url || "").replace(/^[a-z]+:\/\//i, "").split("/")[0];
}

function initialFor(value) {
  const text = String(value || "?").trim();
  const first = Array.from(text)[0] || "?";
  return first.toUpperCase();
}

function tintFor(item) {
  if (item && item.tint) return safeColor(item.tint);
  const source = String((item && (item.url || item.title)) || "lumen");
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return TINT_PALETTE[hash % TINT_PALETTE.length];
}

function normalizeComparableUrl(url) {
  return String(url || "").replace(/\/+$/, "").toLowerCase();
}

function isBookmarked(url) {
  if (!url) return false;
  const target = normalizeComparableUrl(url);
  return Boolean(
    state &&
      Array.isArray(state.bookmarks) &&
      state.bookmarks.some((bookmark) => normalizeComparableUrl(bookmark.url) === target)
  );
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function faviconMarkup(item, className) {
  const tint = tintFor(item);
  const letter = initialFor((item && (item.title || hostOf(item.url))) || "?");
  const image = item && item.favicon
    ? `<img src="${escapeHTML(item.favicon)}" alt="" loading="lazy" data-favicon>`
    : "";
  return `<span class="${className}" style="--tint:${tint}">${image}<span>${escapeHTML(letter)}</span></span>`;
}

function hydrateFavicons(root) {
  if (!root) return;
  root.querySelectorAll("img[data-favicon]").forEach((image) => {
    const remove = () => image.remove();
    image.addEventListener("error", remove, { once: true });
    if (image.complete && image.naturalWidth === 0) remove();
  });
}

function formatDate() {
  const value = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

function currentName() {
  const value = state && state.settings ? state.settings.name : "";
  return String(value || "").trim();
}

function greetingMarkup() {
  const name = currentName();
  if (!name) return `${escapeHTML(greeting())}.`;
  return `${escapeHTML(greeting())}, <em>${escapeHTML(name)}.</em>`;
}

function currentTheme() {
  const value = state && state.settings ? state.settings.theme : "dark";
  return Object.prototype.hasOwnProperty.call(THEMES, value) ? value : "dark";
}

function resolvedTheme() {
  const theme = currentTheme();
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function dayKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(timestamp) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  const difference = Math.round((today - date) / 86400000);

  if (difference === 0) return "Сегодня";
  if (difference === 1) return "Вчера";

  const value = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long"
  }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function recentDateLabel(timestamp) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  const difference = Math.round((today - date) / 86400000);

  if (difference === 0) return formatTime(timestamp);
  if (difference === 1) return "вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(date);
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Б";

  const units = ["Б", "КБ", "МБ", "ГБ"];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** power;
  const digits = amount >= 100 || power === 0 ? 0 : 1;
  return `${amount.toFixed(digits).replace(".", ",")} ${units[power]}`;
}

function engineName() {
  const value = state && state.settings && state.settings.searchEngine;
  return (ENGINES[value] || ENGINES.chrome).name;
}

function searchBase() {
  const value = state && state.settings && state.settings.searchEngine;
  return (ENGINES[value] || ENGINES.chrome).url;
}

function looksLikeAddress(input) {
  const text = String(input || "").trim();
  return (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ||
    /^localhost(:\d+)?(\/.*)?$/i.test(text) ||
    /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(text) ||
    (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(text) && !text.includes(" "))
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      area.style.pointerEvents = "none";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      return true;
    } catch {
      return false;
    }
  }
}

function showToast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.add("is-visible");
  if (ui.toastTimer) clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => {
    el.toast.classList.remove("is-visible");
    ui.toastTimer = null;
  }, 2300);
}

/* =========================================================
   Demo state — used when the interface is opened outside Electron
   ========================================================= */

function createMockApi() {
  const now = Date.now();

  const demoState = {
    tabs: [
      {
        id: "tab-demo-1",
        url: NEWTAB,
        title: "Новая вкладка",
        favicon: null,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        isNewTab: true,
        error: null
      },
      {
        id: "tab-demo-2",
        url: "https://www.figma.com/file/lumen",
        title: "Lumen — дизайн-система",
        favicon: null,
        loading: false,
        canGoBack: true,
        canGoForward: false,
        isNewTab: false,
        error: null
      },
      {
        id: "tab-demo-3",
        url: "https://github.com",
        title: "GitHub — lumen/browser",
        favicon: null,
        loading: false,
        canGoBack: true,
        canGoForward: false,
        isNewTab: false,
        error: null
      }
    ],
    activeTabId: "tab-demo-1",
    activeTab: null,
    bookmarks: [
      { id: "bm-github", title: "GitHub", url: "https://github.com", tint: "#f0f0f0" },
      { id: "bm-mdn", title: "MDN", url: "https://developer.mozilla.org", tint: "#9ec5ff" },
      { id: "bm-wikipedia", title: "Wikipedia", url: "https://www.wikipedia.org", tint: "#f3d37a" },
      { id: "bm-youtube", title: "YouTube", url: "https://www.youtube.com", tint: "#ff9e80" },
      { id: "bm-figma", title: "Figma", url: "https://www.figma.com", tint: "#ffb2c8" },
      { id: "bm-notion", title: "Notion", url: "https://www.notion.so", tint: "#d7d2c7" }
    ],
    history: [
      { id: "h1", title: "Linear — планирование без шума", url: "https://linear.app", visitedAt: now - 1000 * 60 * 34, favicon: null },
      { id: "h2", title: "Are.na — коллекции идей", url: "https://www.are.na", visitedAt: now - 1000 * 60 * 60 * 3, favicon: null },
      { id: "h3", title: "The Marginalian", url: "https://www.themarginalian.org", visitedAt: now - 1000 * 60 * 60 * 22, favicon: null },
      { id: "h4", title: "MDN Web Docs", url: "https://developer.mozilla.org", visitedAt: now - 1000 * 60 * 60 * 28, favicon: null }
    ],
    downloads: [],
    settings: { name: "", searchEngine: "duckduckgo", theme: "dark", accent: "gold", showBookmarks: true, animations: true },
    maximized: false,
    canReopen: false
  };

  const listeners = new Set();
  const uiListeners = new Set();
  let sequence = 10;

  const sync = () => {
    demoState.activeTab = demoState.tabs.find((tab) => tab.id === demoState.activeTabId) || null;
  };

  const emit = () => {
    sync();
    listeners.forEach((listener) => listener(demoState));
  };

  const active = () => demoState.tabs.find((tab) => tab.id === demoState.activeTabId) || demoState.tabs[0];

  const api = {
    platform: "win32",
    getState: async () => demoState,
    onState: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onUiEvent: (listener) => {
      uiListeners.add(listener);
      return () => uiListeners.delete(listener);
    },
    newTab: async (url) => {
      const tab = {
        id: `tab-demo-${++sequence}`,
        url: url || NEWTAB,
        title: url ? hostOf(url) : "Новая вкладка",
        favicon: null,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        isNewTab: !url,
        error: null
      };
      demoState.tabs.push(tab);
      demoState.activeTabId = tab.id;
      emit();
      return tab;
    },
    activateTab: async (id) => {
      demoState.activeTabId = id;
      emit();
    },
    closeTab: async (id) => {
      const index = demoState.tabs.findIndex((tab) => tab.id === id);
      if (index < 0) return;
      demoState.tabs.splice(index, 1);
      if (!demoState.tabs.length) {
        demoState.tabs.push({
          id: `tab-demo-${++sequence}`,
          url: NEWTAB,
          title: "Новая вкладка",
          isNewTab: true,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          favicon: null,
          error: null
        });
      }
      if (demoState.activeTabId === id) {
        demoState.activeTabId = demoState.tabs[Math.min(index, demoState.tabs.length - 1)].id;
      }
      emit();
    },
    navigate: async (input) => {
      const tab = active();
      if (!tab) return;
      tab.isNewTab = false;
      tab.url = String(input || "").trim();
      tab.title = hostOf(tab.url) || tab.url;
      tab.loading = true;
      emit();
      setTimeout(() => {
        tab.loading = false;
        tab.title = tab.title || hostOf(tab.url);
        emit();
      }, 550);
    },
    goNewTab: async () => {
      const tab = active();
      if (!tab) return;
      tab.isNewTab = true;
      tab.url = NEWTAB;
      tab.title = "Новая вкладка";
      tab.loading = false;
      tab.error = null;
      emit();
    },
    back: async () => {},
    forward: async () => {},
    reload: async () => {},
    stop: async () => {},
    reopenClosed: async () => {},
    toggleBookmark: async () => {
      const tab = active();
      if (!tab || tab.isNewTab) return demoState;
      const index = demoState.bookmarks.findIndex((bookmark) => bookmark.url === tab.url);
      if (index >= 0) demoState.bookmarks.splice(index, 1);
      else demoState.bookmarks.unshift({ id: `bm-demo-${++sequence}`, title: tab.title, url: tab.url, tint: "#f3d37a" });
      emit();
      return demoState;
    },
    removeBookmark: async (id) => {
      demoState.bookmarks = demoState.bookmarks.filter((bookmark) => bookmark.id !== id);
      emit();
    },
    removeHistory: async (id) => {
      demoState.history = demoState.history.filter((item) => item.id !== id);
      emit();
    },
    clearHistory: async () => {
      demoState.history = [];
      emit();
    },
    clearDownloads: async () => {
      demoState.downloads = [];
      emit();
    },
    updateSettings: async (patch) => {
      demoState.settings = { ...demoState.settings, ...patch };
      emit();
      return demoState;
    },
    openDownload: async () => {},
    showDownload: async () => {},
    openExternal: async () => {},
    setContentBounds: () => {},
    setOverlay: () => {},
    windowControl: () => {}
  };

  sync();
  return api;
}

/* =========================================================
   DOM cache / init
   ========================================================= */

function cacheDom() {
  const ids = [
    "app", "tabs", "tab-count", "bookmarks", "bookmarks-section", "add-bookmark",
    "new-tab", "address", "omnibox", "security-icon", "bookmark-page", "open-palette",
    "go-back", "go-forward", "reload", "reload-icon", "win-min", "win-max", "win-close",
    "page-shell", "page-view", "newtab", "newtab-date", "newtab-greeting",
    "start-search", "start-search-input", "quick-grid", "recent-list",
    "error-state", "error-title", "error-text", "error-url", "error-retry", "error-newtab",
    "overlay", "drawer-title", "drawer-kicker", "drawer-actions", "drawer-body",
    "palette-overlay", "palette-input", "palette-list",
    "settings-overlay", "settings-body", "toast", "download-dot",
    "brand-home", "copy-url", "progress", "profile-avatar", "profile-name",
    "profile-meta"
  ];

  ids.forEach((id) => {
    el[id.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = document.getElementById(id);
  });

  el.securityUse = el.securityIcon ? el.securityIcon.querySelector("use") : null;
  el.maxUse = el.winMax ? el.winMax.querySelector("use") : null;
}

async function init() {
  cacheDom();
  bindEvents();

  api.onState(handleState);
  api.onUiEvent(handleUiEvent);

  updateClock();
  setInterval(updateClock, 30000);

  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  const onSchemeChange = () => {
    if (currentTheme() === "system") applySettings();
  };
  if (typeof scheme.addEventListener === "function") {
    scheme.addEventListener("change", onSchemeChange);
  } else if (typeof scheme.addListener === "function") {
    scheme.addListener(onSchemeChange);
  }

  try {
    const initialState = await api.getState();
    if (initialState) {
      state = initialState;
      ui.addressTabId = initialState.activeTabId;
      applySettings();
      renderAll();
    }
  } catch (error) {
    console.error("Lumen could not read its state", error);
  }

  if ("ResizeObserver" in window && el.pageView) {
    const observer = new ResizeObserver(() => scheduleBounds());
    observer.observe(el.pageView);
  }

  window.addEventListener("resize", scheduleBounds);
  window.addEventListener("load", scheduleBounds);
  requestAnimationFrame(scheduleBounds);
  setTimeout(scheduleBounds, 320);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

/* =========================================================
   State / settings / sizing
   ========================================================= */

function handleState(nextState) {
  if (!nextState) return;

  const previousActive = state ? state.activeTabId : null;
  const activeChanged = previousActive !== nextState.activeTabId;

  state = nextState;

  if (activeChanged) {
    ui.newtabSignature = "";
    if (ui.panel || ui.paletteOpen || ui.settingsOpen) closeAllOverlays();
  }

  applySettings();
  renderAll();
}

function handleUiEvent(name) {
  if (!name) return;

  if (name === "focus-address") {
    closeAllOverlays();
    focusAddress();
  }

  if (name === "open-palette") {
    openPalette();
  }

  if (name === "open-history") {
    openPanel("history");
  }

  if (name === "open-settings") {
    openSettings();
  }

  if (name === "toggle-bookmark") {
    toggleCurrentBookmark();
  }
}

function applySettings() {
  if (!state) return;

  const settings = state.settings || {};
  const accent = Object.prototype.hasOwnProperty.call(ACCENTS, settings.accent) ? settings.accent : "gold";
  document.documentElement.dataset.accent = accent;
  document.documentElement.dataset.motion = settings.animations === false ? "off" : "on";
  document.documentElement.dataset.theme = resolvedTheme();

  const schemeMeta = document.querySelector('meta[name="color-scheme"]');
  if (schemeMeta) schemeMeta.setAttribute("content", resolvedTheme());

  if (el.bookmarksSection) {
    el.bookmarksSection.hidden = settings.showBookmarks === false;
  }

  renderProfile();
}

function scheduleBounds() {
  if (ui.boundsFrame) return;
  ui.boundsFrame = requestAnimationFrame(() => {
    ui.boundsFrame = null;
    sendBounds();
  });
}

function sendBounds() {
  if (!el.pageView || !api.setContentBounds) return;
  const rect = el.pageView.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  api.setContentBounds({
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  });
}

function updateClock() {
  const date = el.newtabDate || document.getElementById("newtab-date");
  if (date) date.textContent = formatDate();

  const greetingElement = document.getElementById("newtab-greeting");
  if (greetingElement) {
    greetingElement.innerHTML = greetingMarkup();
  }
}

function renderProfile() {
  const name = currentName();

  if (el.profileName) el.profileName.textContent = name || "Без имени";
  if (el.profileMeta) el.profileMeta.textContent = name ? "локальный профиль" : "добавьте имя";

  if (el.profileAvatar) {
    el.profileAvatar.classList.toggle("is-empty", !name);
    el.profileAvatar.innerHTML = name
      ? escapeHTML(initialFor(name))
      : icon("user");
  }
}

/* =========================================================
   Rendering
   ========================================================= */

function renderAll() {
  if (!state) return;

  renderTabs();
  renderBookmarks();
  renderOmnibox();
  renderPageState();
  renderProgress();

  if (ui.panel) renderDrawer();
  if (ui.settingsOpen) renderSettings();
  if (ui.paletteOpen) renderPalette();
}

function renderTabs() {
  if (!el.tabs) return;

  const tabs = Array.isArray(state.tabs) ? state.tabs : [];

  if (el.tabCount) el.tabCount.textContent = String(tabs.length);

  if (!tabs.length) {
    el.tabs.innerHTML = `<div class="tabs-empty">Нет открытых вкладок</div>`;
    return;
  }

  el.tabs.innerHTML = tabs
    .map((tab) => {
      const active = tab.id === state.activeTabId;
      const title = tab.title || (tab.isNewTab ? "Новая вкладка" : hostOf(tab.url) || "Без названия");

      return `
        <div class="tab${active ? " is-active" : ""}" data-tab-id="${escapeHTML(tab.id)}" role="tab" aria-selected="${active}" tabindex="${active ? "0" : "-1"}" title="${escapeHTML(title)}">
          ${faviconMarkup(tab, "tab-favicon")}
          <span class="tab-title">${escapeHTML(title)}</span>
          ${tab.loading ? `<span class="tab-loading" aria-label="Загрузка"></span>` : ""}
          <button class="tab-close" type="button" data-close-tab="${escapeHTML(tab.id)}" aria-label="Закрыть вкладку" title="Закрыть вкладку">
            ${icon("close")}
          </button>
        </div>
      `;
    })
    .join("");

  hydrateFavicons(el.tabs);

  const activeElement = el.tabs.querySelector(".tab.is-active");
  if (activeElement) activeElement.scrollIntoView({ block: "nearest" });
}

function renderBookmarks() {
  if (!el.bookmarks) return;

  const bookmarks = Array.isArray(state.bookmarks) ? state.bookmarks.slice(0, 8) : [];

  if (!bookmarks.length) {
    el.bookmarks.innerHTML = `<div class="bookmarks-empty">Добавьте страницу звездой — она появится здесь.</div>`;
    return;
  }

  el.bookmarks.innerHTML = bookmarks
    .map((bookmark) => {
      const tint = tintFor(bookmark);
      return `
        <button class="bookmark" type="button" data-bookmark-url="${escapeHTML(bookmark.url)}" title="${escapeHTML(bookmark.title)} — ${escapeHTML(bookmark.url)}">
          <span class="bookmark-icon" style="--tint:${tint}">${escapeHTML(initialFor(bookmark.title))}</span>
          <span class="bookmark-name">${escapeHTML(bookmark.title || domainOf(bookmark.url))}</span>
        </button>
      `;
    })
    .join("");
}

function renderOmnibox() {
  if (!el.address) return;

  const active = state.activeTab;
  const url = active && !active.isNewTab ? active.url : "";
  const isNew = !active || active.isNewTab;
  const currentTabId = state.activeTabId;

  const shouldUpdate =
    document.activeElement !== el.address || ui.addressTabId !== currentTabId;

  if (shouldUpdate) {
    el.address.value = url;
    ui.addressTabId = currentTabId;
  }

  el.address.placeholder = "Поиск или адрес";

  let securityIcon = "globe";
  let securityClass = "";
  let securityTitle = "Адрес";

  if (isNew) {
    securityIcon = "search";
    securityTitle = "Поиск";
  } else if (/^https:/i.test(url)) {
    securityIcon = "lock";
    securityClass = " is-secure";
    securityTitle = "Защищённое соединение";
  } else if (/^http:/i.test(url)) {
    securityIcon = "globe";
    securityClass = " is-warning";
    securityTitle = "Незащищённое соединение";
  } else {
    securityTitle = "Локальная страница";
  }

  if (el.securityUse) el.securityUse.setAttribute("href", `#i-${securityIcon}`);
  if (el.securityIcon) {
    el.securityIcon.className = `omnibox-security${securityClass}`;
    el.securityIcon.title = securityTitle;
  }

  const bookmarked = Boolean(url && isBookmarked(url));
  if (el.bookmarkPage) {
    el.bookmarkPage.disabled = !url;
    el.bookmarkPage.classList.toggle("is-active", bookmarked);
    el.bookmarkPage.setAttribute("aria-pressed", String(bookmarked));
    el.bookmarkPage.title = bookmarked ? "Убрать из закладок" : "Добавить в закладки";
    el.bookmarkPage.setAttribute("aria-label", el.bookmarkPage.title);
  }

  if (el.copyUrl) el.copyUrl.disabled = !url;

  if (el.goBack) el.goBack.disabled = !active || !active.canGoBack;
  if (el.goForward) el.goForward.disabled = !active || !active.canGoForward;

  const loading = Boolean(active && active.loading && !active.isNewTab);
  if (el.reloadIcon) {
    el.reloadIcon.setAttribute("href", loading ? "#i-stop" : "#i-reload");
  }
  if (el.reload) {
    el.reload.disabled = isNew && !active?.error;
    el.reload.title = loading ? "Остановить" : "Обновить";
    el.reload.setAttribute("aria-label", el.reload.title);
  }

  updateWindowChrome();

  document.title = isNew ? "Lumen — новая вкладка" : `${active.title || "Страница"} — Lumen`;
}

function renderProgress() {
  if (!el.progress) return;
  const active = state.activeTab;
  const loading = Boolean(active && active.loading && !active.isNewTab && !active.error);
  el.progress.classList.toggle("is-loading", loading);
}

function updateWindowChrome() {
  if (!state) return;

  if (el.maxUse) {
    el.maxUse.setAttribute("href", state.maximized ? "#i-restore" : "#i-maximize");
  }
  if (el.winMax) {
    el.winMax.title = state.maximized ? "Восстановить" : "Развернуть";
    el.winMax.setAttribute("aria-label", el.winMax.title);
  }

  if (el.downloadDot) {
    const downloading = (state.downloads || []).some((download) => download.state === "progressing");
    el.downloadDot.hidden = !downloading;
  }
}

function renderPageState() {
  const active = state.activeTab;
  const isNew = !active || active.isNewTab;
  const error = active && active.error;

  if (el.newtab) el.newtab.hidden = !isNew;
  if (el.errorState) el.errorState.hidden = !(!isNew && error);

  if (isNew) {
    renderNewtab();
  } else if (error) {
    renderError(error);
  }
}

function renderNewtab() {
  if (!el.newtab) return;

  const bookmarks = Array.isArray(state.bookmarks) ? state.bookmarks.slice(0, 6) : [];
  const history = (Array.isArray(state.history) ? state.history : [])
    .filter((item) => item && item.url && item.url !== NEWTAB)
    .slice(0, 4);

  const signature = JSON.stringify({
    bookmarks: bookmarks.map((bookmark) => [bookmark.id, bookmark.title, bookmark.url, bookmark.tint]),
    history: history.map((item) => [item.id, item.title, item.url, item.visitedAt]),
    accent: state.settings?.accent || "gold",
    name: currentName(),
    date: new Date().toDateString()
  });

  if (ui.newtabSignature === signature && el.newtab.querySelector(".newtab-inner")) {
    updateClock();
    return;
  }

  const previousInput = el.newtab.querySelector("#start-search-input");
  const previousValue = previousInput ? previousInput.value : "";
  const hadFocus = previousInput && document.activeElement === previousInput;
  const previousScroll = el.newtab.querySelector(".newtab-inner")?.scrollTop || 0;

  const quickCards = bookmarks.length
    ? bookmarks
        .map((bookmark) => {
          const tint = tintFor(bookmark);
          return `
            <button class="quick-card" type="button" data-quick-url="${escapeHTML(bookmark.url)}" title="${escapeHTML(bookmark.title)}" style="--tint:${tint}">
              <span class="quick-icon" style="--tint:${tint}">${escapeHTML(initialFor(bookmark.title))}</span>
              <span class="quick-meta">
                <span class="quick-name">${escapeHTML(bookmark.title || domainOf(bookmark.url))}</span>
                <span class="quick-host">${escapeHTML(domainOf(bookmark.url))}</span>
              </span>
            </button>
          `;
        })
        .join("")
    : `<div class="quick-empty">Пока пусто. Добавьте страницу в закладки — она появится здесь.</div>`;

  const recentItems = history.length
    ? history
        .map(
          (item) => `
            <button class="recent-item" type="button" data-recent-url="${escapeHTML(item.url)}" title="${escapeHTML(item.title)}">
              ${faviconMarkup(item, "recent-favicon")}
              <span class="recent-meta">
                <span class="recent-title">${escapeHTML(item.title || domainOf(item.url))}</span>
                <span class="recent-time">${escapeHTML(recentDateLabel(item.visitedAt))}</span>
              </span>
            </button>
          `
        )
        .join("")
    : `<div class="recent-empty">Здесь появятся страницы, которые вы открывали.</div>`;

  el.newtab.innerHTML = `
    <div class="newtab-inner">
      <div class="newtab-top">
        <div class="newtab-brand">${icon("logo")}<span>lumen</span></div>
        <span class="newtab-date" id="newtab-date">${escapeHTML(formatDate())}</span>
      </div>

      <div class="newtab-hero">
        <span class="newtab-kicker">Тихое место для интернета</span>
        <h1 id="newtab-greeting">${greetingMarkup()}</h1>
        <form class="start-search" id="start-search" autocomplete="off">
          ${icon("search")}
          <input id="start-search-input" type="text" spellcheck="false" autocomplete="off" placeholder="Поиск или адрес" aria-label="Поиск в интернете" value="${escapeHTML(previousValue)}">
          <button type="submit" aria-label="Найти">${icon("arrow")}</button>
        </form>
        <p class="newtab-sub">Начните с вопроса. Lumen найдёт остальное.</p>
      </div>

      <div class="newtab-columns">
        <section class="quick-block" aria-labelledby="quick-title">
          <div class="block-head">
            <h2 id="quick-title">Быстрый доступ</h2>
            <button class="block-link" type="button" data-panel="settings">настроить</button>
          </div>
          <div class="quick-grid" id="quick-grid">${quickCards}</div>
        </section>

        <section class="recent-block" aria-labelledby="recent-title">
          <div class="block-head">
            <h2 id="recent-title">Недавнее</h2>
            <button class="block-link" type="button" data-panel="history">вся история</button>
          </div>
          <div class="recent-list" id="recent-list">${recentItems}</div>
        </section>
      </div>

      <div class="newtab-foot">
        <span class="newtab-quote">«Спокойный интернет начинается с тишины.»</span>
        <span class="newtab-tip"><kbd>Ctrl K</kbd> команды</span>
      </div>
    </div>
  `;

  hydrateFavicons(el.newtab);
  ui.newtabSignature = signature;

  const nextInput = el.newtab.querySelector("#start-search-input");
  if (nextInput) {
    if (previousValue) nextInput.value = previousValue;
    if (hadFocus) {
      nextInput.focus();
      nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
    }
  }

  const inner = el.newtab.querySelector(".newtab-inner");
  if (inner) inner.scrollTop = previousScroll;
}

function renderError(error) {
  if (!el.errorState) return;

  const messages = {
    ERR_NAME_NOT_RESOLVED: "Такого адреса не существует. Проверьте написание домена.",
    ERR_INTERNET_DISCONNECTED: "Похоже, нет подключения к интернету. Проверьте сеть и попробуйте ещё раз.",
    ERR_CONNECTION_REFUSED: "Сервер отклонил соединение. Возможно, сайт временно недоступен.",
    ERR_CONNECTION_TIMED_OUT: "Сайт слишком долго не отвечает. Попробуйте ещё раз чуть позже.",
    ERR_SSL_PROTOCOL_ERROR: "Не удалось установить защищённое соединение с этим сайтом.",
    ERR_CERT_AUTHORITY_INVALID: "Сертификат сайта не прошёл проверку безопасности.",
    ERR_ABORTED: "Загрузка была прервана."
  };

  if (el.errorTitle) el.errorTitle.textContent = "Не удалось открыть страницу";
  if (el.errorText) {
    el.errorText.textContent =
      messages[error.description] ||
      "Проверьте адрес или попробуйте ещё раз. Иногда сайтам просто нужно немного времени.";
  }
  if (el.errorUrl) el.errorUrl.textContent = error.url || "";
}

/* =========================================================
   Settings
   ========================================================= */

function renderSettings() {
  if (!el.settingsBody) return;

  const settings = state.settings || {};
  const engine = Object.prototype.hasOwnProperty.call(ENGINES, settings.searchEngine)
    ? settings.searchEngine
    : "chrome";
  const accent = Object.prototype.hasOwnProperty.call(ACCENTS, settings.accent) ? settings.accent : "gold";
  const theme = currentTheme();

  const engineOptions = Object.entries(ENGINES)
    .map(
      ([value, item]) =>
        `<option value="${value}"${engine === value ? " selected" : ""}>${escapeHTML(item.name)}</option>`
    )
    .join("");

  const themeOptions = Object.entries(THEMES)
    .map(
      ([value, item]) => `
        <button class="theme-option${theme === value ? " is-active" : ""}" type="button" data-theme-value="${value}" role="radio" aria-checked="${theme === value}" title="${escapeHTML(item.name)}">
          ${icon(item.icon)}
          <span>${escapeHTML(item.name)}</span>
        </button>
      `
    )
    .join("");

  const accentSwatches = Object.entries(ACCENTS)
    .map(
      ([value, item]) => `
        <button class="swatch${accent === value ? " is-active" : ""}" type="button" data-accent-value="${value}" style="--swatch:${item.color}" aria-label="${escapeHTML(item.name)}" title="${escapeHTML(item.name)}" aria-pressed="${accent === value}"></button>
      `
    )
    .join("");

  el.settingsBody.innerHTML = `
    <div class="setting-group">
      <div class="setting-group-title">Профиль</div>
      <div class="setting-row">
        <div class="setting-copy">
          <h3>Как к вам обращаться</h3>
          <p>Имя показывается в приветствии и профиле. Можно оставить пустым.</p>
        </div>
        <div class="setting-control">
          <input class="text-input" id="setting-name" type="text" maxlength="32" spellcheck="false" autocomplete="off" placeholder="Без имени" value="${escapeHTML(settings.name || "")}" aria-label="Ваше имя">
        </div>
      </div>
    </div>

    <div class="setting-group">
      <div class="setting-group-title">Поиск</div>
      <div class="setting-row">
        <div class="setting-copy">
          <h3>Поисковая система</h3>
          <p>Куда Lumen отправляет запросы из адресной строки.</p>
        </div>
        <div class="setting-control">
          <span class="select-wrap">
            <select id="setting-search" aria-label="Поисковая система">${engineOptions}</select>
          </span>
        </div>
      </div>
    </div>

    <div class="setting-group">
      <div class="setting-group-title">Оформление</div>
      <div class="setting-row setting-row--theme">
        <div class="setting-copy">
          <h3>Тема</h3>
          <p>Светлая, тёмная или как в системе.</p>
        </div>
        <div class="setting-control">
          <div class="theme-switch" role="radiogroup" aria-label="Тема оформления">${themeOptions}</div>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-copy">
          <h3>Акцентный цвет</h3>
          <p>Основной оттенок поверх многоцветной палитры Lumen.</p>
        </div>
        <div class="setting-control">
          <div class="swatches" role="group" aria-label="Акцентный цвет">${accentSwatches}</div>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-copy">
          <h3>Закладки в панели</h3>
          <p>Показывать быстрый доступ к закладкам слева.</p>
        </div>
        <div class="setting-control">
          <button class="toggle${settings.showBookmarks !== false ? " is-on" : ""}" type="button" data-toggle="showBookmarks" role="switch" aria-checked="${settings.showBookmarks !== false}" aria-label="Показывать закладки в панели"></button>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-copy">
          <h3>Плавные анимации</h3>
          <p>Мягкие переходы и появление панелей.</p>
        </div>
        <div class="setting-control">
          <button class="toggle${settings.animations !== false ? " is-on" : ""}" type="button" data-toggle="animations" role="switch" aria-checked="${settings.animations !== false}" aria-label="Плавные анимации"></button>
        </div>
      </div>
    </div>

    <div class="settings-foot">
      <span>Настройки сохраняются локально на этом устройстве.</span>
      <b>LUMEN 1.1</b>
    </div>
  `;
}

/* =========================================================
   Drawer: history and downloads
   ========================================================= */

function renderDrawer() {
  if (!el.drawerBody || !ui.panel) return;

  if (ui.panel === "history") {
    if (el.drawerTitle) el.drawerTitle.textContent = "История";
    if (el.drawerKicker) el.drawerKicker.textContent = "архив";
    if (el.drawerActions) el.drawerActions.innerHTML = "";

    const query = ui.historyQuery.trim().toLowerCase();
    const history = (Array.isArray(state.history) ? state.history : []).filter((item) => {
      if (!query) return true;
      return `${item.title || ""} ${item.url || ""}`.toLowerCase().includes(query);
    });

    const groups = new Map();
    history.forEach((item) => {
      const key = dayKey(item.visitedAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });

    const list = groups.size
      ? Array.from(groups.entries())
          .map(([, items]) => {
            const first = items[0];
            return `
              <section class="history-group">
                <div class="history-day">${escapeHTML(dayLabel(first.visitedAt))}</div>
                ${items
                  .map(
                    (item) => `
                      <div class="history-item" data-history-url="${escapeHTML(item.url)}" role="button" tabindex="0" title="${escapeHTML(item.title)}">
                        ${faviconMarkup(item, "history-favicon")}
                        <span class="history-main">
                          <span class="history-title">${escapeHTML(item.title || domainOf(item.url))}</span>
                          <span class="history-url">${escapeHTML(domainOf(item.url))}</span>
                        </span>
                        <span class="history-time">${escapeHTML(formatTime(item.visitedAt))}</span>
                        <button class="history-remove" type="button" data-remove-history="${escapeHTML(item.id)}" aria-label="Удалить из истории" title="Удалить">
                          ${icon("close")}
                        </button>
                      </div>
                    `
                  )
                  .join("")}
              </section>
            `;
          })
          .join("")
      : `
        <div class="drawer-empty">
          <span class="drawer-empty-icon">${icon("history")}</span>
          <b>${query ? "Ничего не найдено" : "История пока пуста"}</b>
          <p>${query ? "Попробуйте другой запрос." : "Страницы, которые вы открываете, будут появляться здесь."}</p>
        </div>
      `;

    el.drawerBody.innerHTML = `
      <div class="drawer-toolbar">
        <label class="drawer-search">
          ${icon("search")}
          <input id="history-search" type="text" spellcheck="false" autocomplete="off" placeholder="Найти в истории" value="${escapeHTML(ui.historyQuery)}" aria-label="Поиск по истории">
        </label>
        <button class="drawer-clear" type="button" data-clear-history>${icon("trash")}<span>Очистить</span></button>
      </div>
      ${list}
    `;

    hydrateFavicons(el.drawerBody);
    return;
  }

  if (ui.panel === "downloads") {
    if (el.drawerTitle) el.drawerTitle.textContent = "Загрузки";
    if (el.drawerKicker) el.drawerKicker.textContent = "файлы";
    if (el.drawerActions) {
      el.drawerActions.innerHTML = `<button class="drawer-clear" type="button" data-clear-downloads>${icon("trash")}<span>Очистить</span></button>`;
    }

    const downloads = Array.isArray(state.downloads) ? state.downloads : [];

    if (!downloads.length) {
      el.drawerBody.innerHTML = `
        <div class="drawer-empty">
          <span class="drawer-empty-icon">${icon("download")}</span>
          <b>Загрузок пока нет</b>
          <p>Файлы, которые вы скачиваете, будут появляться здесь.</p>
        </div>
      `;
      return;
    }

    el.drawerBody.innerHTML = `
      <div class="downloads-list">
        ${downloads
          .map((download) => {
            const stateLabels = {
              progressing: "Загрузка",
              completed: "Готово",
              cancelled: "Отменено",
              interrupted: "Прервано",
              paused: "Пауза"
            };
            const isBad = download.state === "cancelled" || download.state === "interrupted";
            const total = Number(download.total) > 0 ? Number(download.total) : 0;
            const received = Number(download.received) > 0 ? Number(download.received) : 0;
            const percent = total ? Math.min(100, Math.round((received / total) * 100)) : 0;
            const size = total ? `${formatBytes(received)} из ${formatBytes(total)}` : formatBytes(received);

            return `
              <article class="download-item">
                <span class="download-icon">${icon("download")}</span>
                <div class="download-main">
                  <span class="download-name" title="${escapeHTML(download.filename)}">${escapeHTML(download.filename)}</span>
                  <span class="download-meta">
                    <span>${escapeHTML(size)}</span>
                    <span class="download-state${isBad ? " is-cancelled" : ""}">${escapeHTML(stateLabels[download.state] || download.state)}</span>
                  </span>
                  ${
                    download.state === "progressing"
                      ? `<span class="download-progress"><span style="width:${percent}%"></span></span>`
                      : ""
                  }
                  ${
                    download.state === "completed"
                      ? `<span class="download-actions">
                          <button type="button" data-download-open="${escapeHTML(download.path)}">Открыть</button>
                          <button type="button" data-download-show="${escapeHTML(download.path)}">Показать в папке</button>
                        </span>`
                      : ""
                  }
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }
}

/* =========================================================
   Command palette
   ========================================================= */

function renderPalette() {
  if (!el.paletteList || !el.paletteInput) return;

  const query = ui.paletteQuery.trim();
  const lower = query.toLowerCase();
  const active = state.activeTab;
  const bookmarked = active && !active.isNewTab && isBookmarked(active.url);

  const actions = [
    {
      id: "new-tab",
      title: "Новая вкладка",
      sub: "Открыть чистую страницу",
      icon: "plus",
      kbd: "Ctrl T",
      run: () => api.newTab(null)
    },
    {
      id: "history",
      title: "История",
      sub: "Всё, что вы открывали",
      icon: "history",
      run: () => openPanel("history")
    },
    {
      id: "downloads",
      title: "Загрузки",
      sub: "Скачанные файлы",
      icon: "download",
      run: () => openPanel("downloads")
    },
    {
      id: "settings",
      title: "Настройки",
      sub: "Поиск, акцент и анимации",
      icon: "settings",
      run: () => openSettings()
    },
    {
      id: "bookmark",
      title: bookmarked ? "Убрать из закладок" : "Добавить в закладки",
      sub: "Сохранить текущую страницу",
      icon: "star",
      kbd: "Ctrl D",
      run: () => toggleCurrentBookmark()
    },
    {
      id: "reload",
      title: "Обновить страницу",
      sub: "Загрузить текущую страницу заново",
      icon: "reload",
      kbd: "Ctrl R",
      run: () => api.reload()
    },
    {
      id: "home",
      title: "На стартовую",
      sub: "Вернуться к тишине",
      icon: "logo",
      run: () => api.goNewTab()
    },
    {
      id: "close",
      title: "Закрыть вкладку",
      sub: active ? active.title || "Текущая вкладка" : "Текущая вкладка",
      icon: "close",
      kbd: "Ctrl W",
      run: () => active && api.closeTab(active.id)
    }
  ];

  const items = [];

  if (query) {
    items.push({
      id: "open",
      title: `Открыть «${query}»`,
      sub: looksLikeAddress(query) ? "Перейти по адресу" : `Искать в ${engineName()}`,
      icon: "arrow",
      kbd: "↵",
      run: () => navigateFromUI(query)
    });
  }

  const filteredActions = query
    ? actions.filter((action) => `${action.title} ${action.sub}`.toLowerCase().includes(lower))
    : actions;

  filteredActions.forEach((action) => items.push(action));

  if (query) {
    const matchingBookmarks = (state.bookmarks || [])
      .filter((bookmark) => `${bookmark.title} ${bookmark.url}`.toLowerCase().includes(lower))
      .slice(0, 3)
      .map((bookmark) => ({
        id: `bookmark-${bookmark.id}`,
        title: bookmark.title || domainOf(bookmark.url),
        sub: domainOf(bookmark.url),
        icon: "star",
        run: () => navigateFromUI(bookmark.url)
      }));

    const matchingHistory = (state.history || [])
      .filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(lower))
      .slice(0, 3)
      .map((item) => ({
        id: `history-${item.id}`,
        title: item.title || domainOf(item.url),
        sub: domainOf(item.url),
        icon: "history",
        run: () => navigateFromUI(item.url)
      }));

    items.push(...matchingBookmarks, ...matchingHistory);
  }

  ui.paletteItems = items.slice(0, 12);

  if (ui.paletteIndex >= ui.paletteItems.length) ui.paletteIndex = 0;
  if (ui.paletteIndex < 0) ui.paletteIndex = 0;

  if (el.paletteInput.value !== ui.paletteQuery) {
    el.paletteInput.value = ui.paletteQuery;
  }

  const rows = ui.paletteItems
    .map(
      (item, index) => `
        <button class="palette-item${index === ui.paletteIndex ? " is-selected" : ""}" type="button" data-palette-index="${index}" role="option" aria-selected="${index === ui.paletteIndex}">
          <span class="palette-icon">${icon(item.icon)}</span>
          <span class="palette-text">
            <span class="palette-title">${escapeHTML(item.title)}</span>
            <span class="palette-sub">${escapeHTML(item.sub || "")}</span>
          </span>
          ${item.kbd ? `<kbd>${escapeHTML(item.kbd)}</kbd>` : ""}
        </button>
      `
    )
    .join("");

  el.paletteList.innerHTML = `
    ${
      ui.paletteItems.length
        ? `<div class="palette-section-label">${query ? "Результаты" : "Команды"}</div>${rows}`
        : `<div class="palette-empty"><b>Ничего не найдено</b><span>Попробуйте другой запрос</span></div>`
    }
  `;

  const selected = el.paletteList.querySelector(".palette-item.is-selected");
  if (selected) selected.scrollIntoView({ block: "nearest" });
}

/* =========================================================
   Overlay controls
   ========================================================= */

function openPanel(panel) {
  if (!panel) return;
  if (panel === "settings") {
    openSettings();
    return;
  }
  if (!el.overlay) return;

  closeAllOverlays();
  ui.panel = panel;
  if (panel === "history") ui.historyQuery = "";

  el.overlay.hidden = false;
  renderDrawer();
  api.setOverlay(true);

  if (panel === "history") {
    requestAnimationFrame(() => {
      const search = el.drawerBody?.querySelector("#history-search");
      if (search) search.focus();
    });
  }
}

function blurOverlayFocus() {
  const active = document.activeElement;
  if (active && active !== document.body && active.closest?.(".overlay, .palette-overlay, .settings-overlay")) {
    active.blur();
  }
}

function closeOverlay() {
  if (!ui.panel) return;
  ui.panel = null;
  if (el.overlay) el.overlay.hidden = true;
  blurOverlayFocus();
  api.setOverlay(false);
}

function closeAllOverlays() {
  const anythingOpen = Boolean(ui.panel || ui.paletteOpen || ui.settingsOpen);

  ui.panel = null;
  ui.paletteOpen = false;
  ui.settingsOpen = false;

  if (el.overlay) el.overlay.hidden = true;
  if (el.paletteOverlay) el.paletteOverlay.hidden = true;
  if (el.settingsOverlay) el.settingsOverlay.hidden = true;

  blurOverlayFocus();

  if (anythingOpen) api.setOverlay(false);
}

function openSettings() {
  closeAllOverlays();
  ui.settingsOpen = true;
  if (el.settingsOverlay) el.settingsOverlay.hidden = false;
  renderSettings();
  api.setOverlay(true);
}

function closeSettings() {
  if (!ui.settingsOpen) return;
  ui.settingsOpen = false;
  if (el.settingsOverlay) el.settingsOverlay.hidden = true;
  blurOverlayFocus();
  api.setOverlay(false);
}

function openPalette() {
  if (ui.paletteOpen) {
    closePalette();
    return;
  }

  closeAllOverlays();
  ui.paletteOpen = true;
  ui.paletteQuery = "";
  ui.paletteIndex = 0;

  if (el.paletteOverlay) el.paletteOverlay.hidden = false;
  renderPalette();
  api.setOverlay(true);

  requestAnimationFrame(() => {
    if (!el.paletteInput) return;
    el.paletteInput.focus();
    el.paletteInput.select();
  });
}

function closePalette() {
  if (!ui.paletteOpen) return;
  ui.paletteOpen = false;
  if (el.paletteOverlay) el.paletteOverlay.hidden = true;
  blurOverlayFocus();
  api.setOverlay(false);
}

function runPaletteItem(index) {
  const item = ui.paletteItems[index];
  if (!item) return;

  closePalette();
  item.run();
}

function focusAddress() {
  closeAllOverlays();
  if (!el.address) return;
  el.address.focus();
  el.address.select();
}

function navigateFromUI(input) {
  const value = String(input || "").trim();
  if (!value) return;
  closeAllOverlays();
  api.navigate(value);
}

async function toggleCurrentBookmark() {
  const active = state && state.activeTab;
  if (!active || active.isNewTab) {
    showToast("Сначала откройте страницу");
    return;
  }

  const wasBookmarked = isBookmarked(active.url);
  await api.toggleBookmark();
  showToast(wasBookmarked ? "Убрано из закладок" : "Добавлено в закладки");
}

function clearHistoryWithConfirm() {
  if (!window.confirm("Очистить всю историю Lumen?")) return;
  api.clearHistory();
  showToast("История очищена");
}

/* =========================================================
   Events
   ========================================================= */

function bindEvents() {
  el.tabs?.addEventListener("click", (event) => {
    const close = event.target.closest("[data-close-tab]");
    if (close) {
      event.stopPropagation();
      closeAllOverlays();
      api.closeTab(close.dataset.closeTab);
      return;
    }

    const tab = event.target.closest("[data-tab-id]");
    if (tab) {
      closeAllOverlays();
      api.activateTab(tab.dataset.tabId);
    }
  });

  el.tabs?.addEventListener("auxclick", (event) => {
    if (event.button !== 1) return;
    const tab = event.target.closest("[data-tab-id]");
    if (!tab) return;
    event.preventDefault();
    api.closeTab(tab.dataset.tabId);
  });

  el.bookmarks?.addEventListener("click", (event) => {
    const bookmark = event.target.closest("[data-bookmark-url]");
    if (bookmark) navigateFromUI(bookmark.dataset.bookmarkUrl);
  });

  document.addEventListener("click", (event) => {
    const panelButton = event.target.closest("[data-panel]");
    if (!panelButton) return;
    event.preventDefault();

    if (panelButton.dataset.panel === "settings") openSettings();
    else openPanel(panelButton.dataset.panel);
  });

  el.newTab?.addEventListener("click", () => {
    closeAllOverlays();
    api.newTab(null);
  });

  el.addBookmark?.addEventListener("click", () => toggleCurrentBookmark());
  el.brandHome?.addEventListener("click", (event) => {
    event.preventDefault();
    closeAllOverlays();
    api.goNewTab();
  });

  el.bookmarkPage?.addEventListener("click", () => toggleCurrentBookmark());
  el.openPalette?.addEventListener("click", () => openPalette());

  el.goBack?.addEventListener("click", () => api.back());
  el.goForward?.addEventListener("click", () => api.forward());
  el.reload?.addEventListener("click", () => {
    if (state?.activeTab?.loading) api.stop();
    else api.reload();
  });

  el.omnibox?.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = el.address?.value.trim() || "";
    if (!value) {
      if (state?.activeTab?.isNewTab) el.address?.blur();
      return;
    }
    navigateFromUI(value);
    el.address?.blur();
  });

  el.address?.addEventListener("focus", () => {
    requestAnimationFrame(() => el.address?.select());
  });

  el.address?.addEventListener("blur", () => {
    if (!state?.activeTab || state.activeTab.isNewTab) {
      if (el.address) el.address.value = "";
    } else if (el.address) {
      el.address.value = state.activeTab.url || "";
    }
  });

  el.address?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      el.address.blur();
      renderOmnibox();
    }
  });

  el.copyUrl?.addEventListener("click", async (event) => {
    event.preventDefault();
    const active = state?.activeTab;
    if (!active || active.isNewTab) return;
    const copied = await copyText(active.url);
    showToast(copied ? "Адрес скопирован" : "Не удалось скопировать адрес");
  });

  el.newtab?.addEventListener("click", (event) => {
    const quick = event.target.closest("[data-quick-url]");
    if (quick) {
      navigateFromUI(quick.dataset.quickUrl);
      return;
    }

    const recent = event.target.closest("[data-recent-url]");
    if (recent) navigateFromUI(recent.dataset.recentUrl);
  });

  el.newtab?.addEventListener("submit", (event) => {
    if (event.target.id !== "start-search") return;
    event.preventDefault();
    const input = event.target.querySelector("#start-search-input");
    const value = input?.value.trim() || "";
    if (!value) {
      focusAddress();
      return;
    }
    navigateFromUI(value);
  });

  el.errorRetry?.addEventListener("click", () => api.reload());
  el.errorNewtab?.addEventListener("click", () => api.goNewTab());

  el.winMin?.addEventListener("click", () => api.windowControl("minimize"));
  el.winMax?.addEventListener("click", () => api.windowControl("maximize"));
  el.winClose?.addEventListener("click", () => api.windowControl("close"));

  el.overlay?.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-overlay]")) {
      closeOverlay();
      return;
    }

    const downloadOpen = event.target.closest("[data-download-open]");
    if (downloadOpen) {
      event.stopPropagation();
      api.openDownload(downloadOpen.dataset.downloadOpen);
      return;
    }

    const downloadShow = event.target.closest("[data-download-show]");
    if (downloadShow) {
      event.stopPropagation();
      api.showDownload(downloadShow.dataset.downloadShow);
      return;
    }

    if (event.target.closest("[data-clear-history]")) {
      clearHistoryWithConfirm();
      return;
    }

    if (event.target.closest("[data-clear-downloads]")) {
      api.clearDownloads();
      showToast("Список загрузок очищен");
      return;
    }

    const remove = event.target.closest("[data-remove-history]");
    if (remove) {
      event.stopPropagation();
      api.removeHistory(remove.dataset.removeHistory);
      return;
    }

    const historyItem = event.target.closest("[data-history-url]");
    if (historyItem) {
      const url = historyItem.dataset.historyUrl;
      closeOverlay();
      api.navigate(url);
    }
  });

  el.drawerBody?.addEventListener("input", (event) => {
    if (event.target.id !== "history-search") return;

    const caret = event.target.selectionStart;
    ui.historyQuery = event.target.value;
    renderDrawer();

    const nextInput = el.drawerBody.querySelector("#history-search");
    if (nextInput) {
      nextInput.focus();
      const position = Math.min(caret, nextInput.value.length);
      nextInput.setSelectionRange(position, position);
    }
  });

  el.drawerBody?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const historyItem = event.target.closest("[data-history-url]");
    if (!historyItem) return;
    event.preventDefault();
    const url = historyItem.dataset.historyUrl;
    closeOverlay();
    api.navigate(url);
  });

  el.paletteOverlay?.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-palette]")) closePalette();
  });

  el.paletteList?.addEventListener("click", (event) => {
    const item = event.target.closest("[data-palette-index]");
    if (!item) return;
    runPaletteItem(Number(item.dataset.paletteIndex));
  });

  el.paletteInput?.addEventListener("input", (event) => {
    ui.paletteQuery = event.target.value;
    ui.paletteIndex = 0;
    renderPalette();
  });

  el.paletteInput?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!ui.paletteItems.length) return;
      ui.paletteIndex = (ui.paletteIndex + 1) % ui.paletteItems.length;
      renderPalette();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!ui.paletteItems.length) return;
      ui.paletteIndex = (ui.paletteIndex - 1 + ui.paletteItems.length) % ui.paletteItems.length;
      renderPalette();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      runPaletteItem(ui.paletteIndex);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
    }
  });

  el.settingsOverlay?.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-settings]")) closeSettings();
  });

  el.settingsBody?.addEventListener("change", (event) => {
    if (event.target.id === "setting-search") {
      api.updateSettings({ searchEngine: event.target.value });
      return;
    }

    if (event.target.id === "setting-name") {
      api.updateSettings({ name: event.target.value });
    }
  });

  el.settingsBody?.addEventListener("keydown", (event) => {
    if (event.target.id !== "setting-name") return;
    if (event.key === "Enter") {
      event.preventDefault();
      event.target.blur();
    }
  });

  el.settingsBody?.addEventListener("click", (event) => {
    const theme = event.target.closest("[data-theme-value]");
    if (theme) {
      api.updateSettings({ theme: theme.dataset.themeValue });
      return;
    }

    const accent = event.target.closest("[data-accent-value]");
    if (accent) {
      api.updateSettings({ accent: accent.dataset.accentValue });
      return;
    }

    const toggle = event.target.closest("[data-toggle]");
    if (!toggle) return;
    const key = toggle.dataset.toggle;
    const current = state?.settings?.[key] !== false;
    api.updateSettings({ [key]: !current });
  });

  document.addEventListener("keydown", handleGlobalKeydown);
}

function handleGlobalKeydown(event) {
  const modifier = event.ctrlKey || event.metaKey;
  const key = String(event.key || "").toLowerCase();

  if (modifier && key === "k") {
    event.preventDefault();
    openPalette();
    return;
  }

  if (modifier && key === "l") {
    event.preventDefault();
    focusAddress();
    return;
  }

  if (modifier && key === "h") {
    event.preventDefault();
    openPanel("history");
    return;
  }

  if (modifier && key === "d") {
    event.preventDefault();
    toggleCurrentBookmark();
    return;
  }

  if (modifier && key === ",") {
    event.preventDefault();
    openSettings();
    return;
  }

  if (event.key === "Escape") {
    if (ui.paletteOpen) {
      closePalette();
      return;
    }
    if (ui.settingsOpen) {
      closeSettings();
      return;
    }
    if (ui.panel) {
      closeOverlay();
      return;
    }
    if (document.activeElement === el.address) el.address.blur();
  }
}


