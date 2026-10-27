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

const DEFAULT_APPEARANCE = {
  accentColor: "",
  bgColor: "",
  surfaceColor: "",
  textColor: "",
  radius: 18,
  density: "cozy",
  font: "manrope",
  pattern: "aurora",
  glow: true,
  layout: {}
};

const DENSITIES = {
  compact: { name: "Плотно", gap: "6px", pad: "9px", row: "9px" },
  cozy: { name: "Спокойно", gap: "7px", pad: "11px", row: "12px" },
  airy: { name: "Просторно", gap: "11px", pad: "14px", row: "15px" }
};

const UI_FONTS = {
  manrope: {
    name: "Manrope",
    stack: '"Manrope", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
  },
  unbounded: {
    name: "Unbounded",
    stack: '"Unbounded", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif'
  },
  lora: {
    name: "Lora",
    stack: '"Lora", Georgia, "Times New Roman", serif'
  },
  mono: {
    name: "JetBrains Mono",
    stack: '"JetBrains Mono", "Cascadia Code", Consolas, monospace'
  }
};

const PATTERNS = {
  aurora: { name: "Аврора", note: "мягкие цветные пятна" },
  mesh: { name: "Меш", note: "градиентная дымка" },
  grid: { name: "Сетка", note: "тонкие линии" },
  dots: { name: "Точки", note: "тихая фактура" },
  solid: { name: "Чистый", note: "только цвет" }
};

const LIGHT_ACCENTS = {
  gold: "#8f690d",
  mint: "#22795f",
  blue: "#315fae",
  coral: "#b04a33"
};

const CUSTOM_VARS = [
  "--accent", "--accent-rgb", "--accent-strong", "--accent-ink",
  "--bg", "--bg-deep", "--bg-soft", "--surface-page", "--surface-sidebar",
  "--surface-drawer", "--surface-modal", "--panel", "--surface-palette-rgb",
  "--surface-input-rgb", "--surface-toast-rgb", "--surface-newtab-a",
  "--surface-newtab-b", "--surface-newtab-c", "--text", "--text-soft", "--muted",
  "--faint", "--line", "--line-strong", "--wash-rgb", "--backdrop",
  "--radius", "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl",
  "--density-gap", "--density-pad", "--density-row", "--font-ui", "--font-display"
];

const api = window.lumen || createMockApi();

let state = null;

const ui = {
  panel: null,
  paletteOpen: false,
  paletteQuery: "",
  paletteIndex: 0,
  paletteItems: [],
  settingsOpen: false,
  designerOpen: false,
  layoutOpen: false,
  layoutDeep: false,
  layoutSaveTimer: null,
  historyQuery: "",
  historyView: "list",
  timelineSessions: [],
  noteSaveTimer: null,
  quiet: { active: false, endsAt: 0, timer: null, minutes: 25 },
  newtabSignature: "",
  addressTabId: null,
  toastTimer: null,
  boundsFrame: null,
  appearanceTimer: null
};

const el = {};

const layoutSelection = {
  node: null,
  key: null,
  x: 0,
  y: 0,
  scale: 1,
  drag: null,
  hover: null,
  suppressClick: false
};

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

function normalizeHex(value) {
  if (typeof value !== "string") return "";
  let hex = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(hex)) return "";
  if (hex.length === 4) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

function normalizeLayout(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const layout = {};
  Object.entries(input).forEach(([key, value]) => {
    if (typeof key !== "string" || !key || key.length > 240) return;
    if (!value || typeof value !== "object" || Array.isArray(value)) return;

    const x = Math.max(-4000, Math.min(4000, Math.round(Number(value.x) || 0)));
    const y = Math.max(-4000, Math.min(4000, Math.round(Number(value.y) || 0)));
    const scale = Math.max(0.35, Math.min(2.5, Number(value.scale) || 1));
    if (x === 0 && y === 0 && Math.abs(scale - 1) < 0.001) return;

    layout[key] = {
      x,
      y,
      scale: Math.round(scale * 100) / 100
    };
  });

  return layout;
}

function hexToRgb(hex) {
  const value = normalizeHex(hex) || "#000000";
  return {
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16)
  };
}

function rgbToHex(r, g, b) {
  const channel = (value) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function mixHex(from, to, amount) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const weight = Math.max(0, Math.min(1, amount));
  return rgbToHex(
    start.r + (end.r - start.r) * weight,
    start.g + (end.g - start.g) * weight,
    start.b + (end.b - start.b) * weight
  );
}

function shadeHex(hex, amount) {
  return amount >= 0 ? mixHex(hex, "#ffffff", amount) : mixHex(hex, "#000000", -amount);
}

function colorLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const transform = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

function inkOn(hex) {
  return colorLuminance(hex) > 0.52 ? "#17130c" : "#fffdf7";
}

function rgbText(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

function currentAppearance() {
  const source = state && state.settings ? state.settings.appearance : null;
  const appearance = { ...DEFAULT_APPEARANCE, ...(source || {}) };
  appearance.accentColor = normalizeHex(appearance.accentColor);
  appearance.bgColor = normalizeHex(appearance.bgColor);
  appearance.surfaceColor = normalizeHex(appearance.surfaceColor);
  appearance.textColor = normalizeHex(appearance.textColor);
  appearance.radius = Math.max(0, Math.min(30, Math.round(Number(appearance.radius) || 18)));
  appearance.density = Object.prototype.hasOwnProperty.call(DENSITIES, appearance.density)
    ? appearance.density
    : "cozy";
  appearance.font = Object.prototype.hasOwnProperty.call(UI_FONTS, appearance.font)
    ? appearance.font
    : "manrope";
  appearance.pattern = Object.prototype.hasOwnProperty.call(PATTERNS, appearance.pattern)
    ? appearance.pattern
    : "aurora";
  appearance.glow = appearance.glow !== false;
  appearance.layout = normalizeLayout(appearance.layout);
  return appearance;
}

function currentAccentKey() {
  const value = state && state.settings ? state.settings.accent : "gold";
  return Object.prototype.hasOwnProperty.call(ACCENTS, value) ? value : "gold";
}

function defaultAccentColor() {
  const key = currentAccentKey();
  if (resolvedTheme() === "light") return LIGHT_ACCENTS[key] || LIGHT_ACCENTS.gold;
  return ACCENTS[key].color;
}

function defaultPaletteColor(key) {
  const light = resolvedTheme() === "light";
  if (key === "accentColor") return defaultAccentColor();
  if (key === "bgColor") return light ? "#f3eee3" : "#08080a";
  if (key === "surfaceColor") return light ? "#fffcf6" : "#0e0e11";
  return light ? "#211d16" : "#f2efe7";
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

function plural(count, one, few, many) {
  const value = Math.abs(Number(count) || 0) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
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
    spaces: [
      {
        id: "space-demo-1",
        name: "Дизайн",
        color: "#a855f7",
        tabs: [
          { url: "https://www.figma.com/file/lumen", title: "Lumen — дизайн-система", favicon: null },
          { url: "https://www.are.na", title: "Are.na — коллекции идей", favicon: null }
        ],
        createdAt: now - 1000 * 60 * 60 * 4,
        updatedAt: now - 1000 * 60 * 60 * 4
      },
      {
        id: "space-demo-2",
        name: "Чтение",
        color: "#34d399",
        tabs: [
          { url: "https://www.themarginalian.org", title: "The Marginalian", favicon: null },
          { url: "https://developer.mozilla.org", title: "MDN Web Docs", favicon: null }
        ],
        createdAt: now - 1000 * 60 * 60 * 26,
        updatedAt: now - 1000 * 60 * 60 * 26
      }
    ],
    notes: [
      {
        id: "note-demo-1",
        url: "https://linear.app",
        title: "Linear — планирование без шума",
        domain: "linear.app",
        text: "Посмотреть, как устроены пространства и быстрые команды. Забрать идею с клавиатурной навигацией.",
        updatedAt: now - 1000 * 60 * 20
      }
    ],
    shield: {
      enabled: true,
      sessionBlocked: 12,
      total: 248,
      recent: [
        { host: "google-analytics.com", at: now - 1000 * 60 * 3 },
        { host: "doubleclick.net", at: now - 1000 * 60 * 8 },
        { host: "hotjar.com", at: now - 1000 * 60 * 14 }
      ]
    },
    settings: {
      name: "",
      searchEngine: "duckduckgo",
      theme: "dark",
      accent: "gold",
      showBookmarks: true,
      animations: true,
      shield: true,
      appearance: { ...DEFAULT_APPEARANCE }
    },
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
    openTabs: async (urls) => {
      (Array.isArray(urls) ? urls : []).slice(0, 12).forEach((url) => {
        if (demoState.tabs.some((tab) => tab.url === url)) return;
        demoState.tabs.push({
          id: `tab-demo-${++sequence}`,
          url,
          title: hostOf(url),
          favicon: null,
          loading: false,
          canGoBack: false,
          canGoForward: false,
          isNewTab: false,
          error: null
        });
      });
      emit();
      return demoState;
    },
    saveSpace: async (payload) => {
      const current = demoState.tabs.filter((tab) => !tab.isNewTab).map((tab) => ({
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon
      }));
      const id = payload?.id;
      let space = id ? demoState.spaces.find((item) => item.id === id) : null;
      if (payload?.useCurrentTabs) {
        if (!current.length) return demoState;
        if (space) {
          space.tabs = current;
          space.updatedAt = Date.now();
          if (payload.name) space.name = payload.name;
        } else {
          space = {
            id: `space-demo-${++sequence}`,
            name: payload?.name || `Пространство ${demoState.spaces.length + 1}`,
            color: ["#a855f7", "#60a5fa", "#34d399", "#fbbf24", "#fb7185"][demoState.spaces.length % 5],
            tabs: current,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          demoState.spaces.unshift(space);
        }
      } else if (space && payload?.name) {
        space.name = payload.name;
        space.updatedAt = Date.now();
      }
      emit();
      return demoState;
    },
    openSpace: async (id) => {
      const space = demoState.spaces.find((item) => item.id === id);
      if (space) {
        await api.openTabs(space.tabs.map((tab) => tab.url));
      }
      return demoState;
    },
    deleteSpace: async (id) => {
      demoState.spaces = demoState.spaces.filter((item) => item.id !== id);
      emit();
      return demoState;
    },
    saveNote: async (payload) => {
      const url = payload?.url;
      if (!/^https?:/i.test(url || "")) return demoState;
      const text = payload?.text || "";
      let note = demoState.notes.find((item) => item.url === url);
      if (!text.trim()) {
        demoState.notes = demoState.notes.filter((item) => item.url !== url);
      } else if (note) {
        note.text = text;
        note.title = payload.title || note.title;
        note.updatedAt = Date.now();
      } else {
        note = {
          id: `note-demo-${++sequence}`,
          url,
          title: payload.title || hostOf(url),
          domain: hostOf(url),
          text,
          updatedAt: Date.now()
        };
        demoState.notes.unshift(note);
      }
      emit();
      return demoState;
    },
    removeNote: async (id) => {
      demoState.notes = demoState.notes.filter((item) => item.id !== id);
      emit();
      return demoState;
    },
    resetShield: async () => {
      demoState.shield = { enabled: demoState.settings.shield !== false, sessionBlocked: 0, total: 0, recent: [] };
      emit();
      return demoState;
    },
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
      if (typeof patch?.shield === "boolean") {
        demoState.shield.enabled = patch.shield;
      }
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
    "spaces", "spaces-section", "add-space",
    "new-tab", "address", "omnibox", "security-icon", "bookmark-page", "open-palette",
    "open-shield", "shield-badge",
    "go-back", "go-forward", "reload", "reload-icon", "win-min", "win-max", "win-close",
    "page-shell", "page-view", "newtab", "newtab-date", "newtab-greeting",
    "start-search", "start-search-input", "quick-grid", "recent-list",
    "error-state", "error-title", "error-text", "error-url", "error-retry", "error-newtab",
    "overlay", "drawer-title", "drawer-kicker", "drawer-actions", "drawer-body",
    "palette-overlay", "palette-input", "palette-list",
    "settings-overlay", "settings-body", "designer-overlay", "designer-body",
    "layout-outline", "layout-outline-label", "layout-bar", "layout-target-name",
    "layout-scale", "layout-scale-value", "layout-x", "layout-y",
    "quiet-pill", "quiet-time",
    "toast", "download-dot", "brand-home", "copy-url", "progress",
    "profile-avatar", "profile-name", "profile-meta"
  ];

  ids.forEach((id) => {
    el[id.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = document.getElementById(id);
  });

  el.securityUse = el.securityIcon ? el.securityIcon.querySelector("use") : null;
  el.maxUse = el.winMax ? el.winMax.querySelector("use") : null;
}

async function init() {
  cacheDom();
  registerLayoutTargets();
  bindEvents();
  bindLayoutEvents();

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
    if (ui.panel || ui.paletteOpen || ui.settingsOpen || ui.designerOpen || ui.layoutOpen) {
      closeAllOverlays();
    }
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
  const accent = currentAccentKey();
  document.documentElement.dataset.accent = accent;
  document.documentElement.dataset.motion = settings.animations === false ? "off" : "on";
  document.documentElement.dataset.theme = resolvedTheme();

  const schemeMeta = document.querySelector('meta[name="color-scheme"]');
  if (schemeMeta) schemeMeta.setAttribute("content", resolvedTheme());

  if (el.bookmarksSection) {
    el.bookmarksSection.hidden = settings.showBookmarks === false;
  }

  applyAppearance(currentAppearance());
  renderProfile();
}

function applyAppearance(appearance) {
  const root = document.documentElement;
  CUSTOM_VARS.forEach((name) => root.style.removeProperty(name));

  const light = resolvedTheme() === "light";
  const hasCustomPalette = Boolean(
    appearance.accentColor || appearance.bgColor || appearance.surfaceColor || appearance.textColor
  );
  const themeBg = light ? "#f3eee3" : "#08080a";
  const themeSurface = light ? "#fffcf6" : "#0e0e11";
  const themeText = light ? "#211d16" : "#f2efe7";

  const bg = appearance.bgColor || themeBg;
  const surface = appearance.surfaceColor || themeSurface;
  const inkBase = appearance.surfaceColor ? surface : bg;
  const text = appearance.textColor || (hasCustomPalette ? inkOn(inkBase) : themeText);

  if (hasCustomPalette) {
    const textSoft = mixHex(text, bg, light ? 0.24 : 0.28);
    const muted = mixHex(text, bg, light ? 0.42 : 0.46);
    const faint = mixHex(text, bg, light ? 0.58 : 0.62);
    const textRgb = rgbText(text);
    const surfaceRgb = rgbText(surface);
    const deep = shadeHex(bg, light ? -0.05 : -0.25);
    const soft = shadeHex(bg, light ? 0.22 : 0.035);
    const newtabB = shadeHex(bg, light ? 0.08 : 0.015);
    const newtabC = shadeHex(bg, light ? 0.14 : 0.025);
    const darkSurface = colorLuminance(surface) < 0.5;

    root.style.setProperty("--bg", bg);
    root.style.setProperty("--bg-deep", deep);
    root.style.setProperty("--bg-soft", soft);
    root.style.setProperty("--surface-page", bg);
    root.style.setProperty("--surface-sidebar", surface);
    root.style.setProperty("--surface-drawer", surface);
    root.style.setProperty("--surface-modal", surface);
    root.style.setProperty("--panel", surface);
    root.style.setProperty("--surface-palette-rgb", surfaceRgb);
    root.style.setProperty("--surface-input-rgb", surfaceRgb);
    root.style.setProperty("--surface-toast-rgb", surfaceRgb);
    root.style.setProperty("--surface-newtab-a", shadeHex(bg, light ? 0.1 : 0.025));
    root.style.setProperty("--surface-newtab-b", newtabB);
    root.style.setProperty("--surface-newtab-c", newtabC);
    root.style.setProperty("--text", text);
    root.style.setProperty("--text-soft", textSoft);
    root.style.setProperty("--muted", muted);
    root.style.setProperty("--faint", faint);
    root.style.setProperty("--wash-rgb", textRgb);
    root.style.setProperty("--line", `rgba(${textRgb}, 0.1)`);
    root.style.setProperty("--line-strong", `rgba(${textRgb}, 0.17)`);
    root.style.setProperty(
      "--backdrop",
      darkSurface ? "rgba(3, 3, 5, 0.64)" : "rgba(44, 32, 16, 0.3)"
    );
  }

  if (appearance.accentColor || hasCustomPalette) {
    const base = appearance.accentColor || ACCENTS[currentAccentKey()].color;
    const surfaceLight = colorLuminance(inkBase) > 0.5;
    const accent = surfaceLight && colorLuminance(base) > 0.5
      ? mixHex(base, "#1b1408", 0.4)
      : base;
    const strong = surfaceLight
      ? mixHex(accent, "#000000", 0.14)
      : mixHex(accent, "#ffffff", 0.3);

    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-rgb", rgbText(accent));
    root.style.setProperty("--accent-strong", strong);
    root.style.setProperty("--accent-ink", inkOn(accent));
  }

  const radius = appearance.radius;
  root.style.setProperty("--radius", `${radius}px`);
  root.style.setProperty("--radius-sm", `${Math.round(radius * 0.56)}px`);
  root.style.setProperty("--radius-md", `${Math.round(radius * 0.72)}px`);
  root.style.setProperty("--radius-lg", `${radius + 3}px`);
  root.style.setProperty("--radius-xl", `${radius + 4}px`);

  const density = DENSITIES[appearance.density] || DENSITIES.cozy;
  root.style.setProperty("--density-gap", density.gap);
  root.style.setProperty("--density-pad", density.pad);
  root.style.setProperty("--density-row", density.row);

  if (appearance.font && appearance.font !== "manrope") {
    const stack = (UI_FONTS[appearance.font] || UI_FONTS.manrope).stack;
    root.style.setProperty("--font-ui", stack);
    root.style.setProperty("--font-display", stack);
  }

  root.dataset.pattern = appearance.pattern;
  root.dataset.density = appearance.density;
  root.dataset.glow = appearance.glow ? "on" : "off";

  applyLayout(appearance.layout);
}

/* =========================================================
   Free layout
   ========================================================= */

const LAYOUT_TARGETS = [
  [".sidebar", "sidebar", "Боковая панель"],
  [".brand", "brand", "Логотип"],
  [".brand-version", "brand-version", "Версия"],
  [".new-tab-btn", "new-tab-btn", "Кнопка новой вкладки"],
  [".spaces-section", "spaces-section", "Пространства"],
  [".spaces", "spaces", "Список пространств"],
  [".tabs-section", "tabs-section", "Блок вкладок"],
  [".bookmarks-section", "bookmarks-section", "Блок закладок"],
  [".sidebar-foot", "sidebar-foot", "Нижнее меню"],
  [".profile", "profile", "Профиль"],
  [".toolbar", "toolbar", "Панель инструментов"],
  [".nav-controls", "nav-controls", "Навигация"],
  [".omnibox", "omnibox", "Адресная строка"],
  [".toolbar-actions", "toolbar-actions", "Действия панели"],
  [".window-controls", "window-controls", "Управление окном"],
  [".page-shell", "page-shell", "Страница"],
  [".newtab", "newtab", "Новая вкладка"],
  [".newtab-inner", "newtab-inner", "Содержимое новой вкладки"],
  [".newtab-top", "newtab-top", "Верхняя строка"],
  [".newtab-brand", "newtab-brand", "Логотип на стартовой"],
  [".newtab-date", "newtab-date", "Дата"],
  [".newtab-hero", "newtab-hero", "Приветствие"],
  [".newtab-kicker", "newtab-kicker", "Надпись над заголовком"],
  ["#newtab-greeting", "greeting", "Заголовок приветствия"],
  [".start-search", "start-search", "Поиск на стартовой"],
  [".newtab-sub", "newtab-sub", "Подпись под поиском"],
  [".newtab-columns", "newtab-columns", "Колонки"],
  [".quick-block", "quick-block", "Быстрый доступ"],
  [".recent-block", "recent-block", "Недавнее"],
  [".newtab-foot", "newtab-foot", "Подвал стартовой"],
  [".quick-grid", "quick-grid", "Сетка ссылок"],
  [".recent-list", "recent-list", "Список недавнего"]
];

function registerLayoutTargets() {
  LAYOUT_TARGETS.forEach(([selector, name, label]) => {
    document.querySelectorAll(selector).forEach((node) => {
      if (!node.dataset.layoutName) node.dataset.layoutName = name;
      if (!node.dataset.layoutLabel) node.dataset.layoutLabel = label;
    });
  });
}

function layoutPath(node) {
  const parts = [];

  while (node && node.nodeType === 1 && node !== document.body) {
    if (node.id) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }

    let index = 1;
    let sibling = node;
    while ((sibling = sibling.previousElementSibling)) {
      if (sibling.tagName === node.tagName) index += 1;
    }

    parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${index})`);
    node = node.parentElement;
  }

  return parts.join(" > ");
}

function layoutKeyFor(node) {
  if (!node) return "";
  if (node.dataset.layoutKey) return node.dataset.layoutKey;
  if (node.dataset.layoutName) return `name:${node.dataset.layoutName}`;
  if (node.id) return `#${CSS.escape(node.id)}`;
  return layoutPath(node);
}

function resolveLayoutNode(key) {
  if (!key) return null;

  try {
    if (key.startsWith("name:")) {
      const name = key.slice(5);
      return Array.from(document.querySelectorAll("[data-layout-name]"))
        .find((node) => node.dataset.layoutName === name) || null;
    }
    return document.querySelector(key);
  } catch {
    return null;
  }
}

function isLayoutChrome(node) {
  return Boolean(
    node &&
    node.closest?.(
      ".layout-bar, .layout-outline, .overlay, .palette-overlay, .settings-overlay, .designer-overlay, .native-page"
    )
  );
}

function labelForLayoutNode(node) {
  if (!node) return "Элемент";
  if (node.dataset.layoutLabel) return node.dataset.layoutLabel;
  if (node.getAttribute("aria-label")) return node.getAttribute("aria-label");
  if (node.title) return node.title;
  if (node.id) return `#${node.id}`;

  const className = String(node.className || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(".");

  return className ? `${node.tagName.toLowerCase()}.${className}` : node.tagName.toLowerCase();
}

function applyLayoutValue(node, value) {
  if (!node) return;
  const x = Number(value?.x) || 0;
  const y = Number(value?.y) || 0;
  const scale = Math.max(0.35, Math.min(2.5, Number(value?.scale) || 1));

  node.style.setProperty("--layout-x", `${x}px`);
  node.style.setProperty("--layout-y", `${y}px`);
  node.style.setProperty("--layout-scale", String(scale));
  node.classList.add("layout-transformed");
}

function clearLayoutValue(node) {
  if (!node) return;
  node.classList.remove("layout-transformed");
  node.style.removeProperty("--layout-x");
  node.style.removeProperty("--layout-y");
  node.style.removeProperty("--layout-scale");
}

function applyLayout(layout) {
  document.querySelectorAll(".layout-transformed").forEach((node) => {
    clearLayoutValue(node);
    delete node.dataset.layoutKey;
  });

  Object.entries(normalizeLayout(layout)).forEach(([key, value]) => {
    const node = resolveLayoutNode(key);
    if (!node || isLayoutChrome(node) || node === document.body) return;
    node.dataset.layoutKey = key;
    applyLayoutValue(node, value);
  });

  requestAnimationFrame(() => {
    updateLayoutOutline();
    scheduleBounds();
  });
}

function currentLayout() {
  return normalizeLayout(currentAppearance().layout);
}

function layoutValueFor(key) {
  return currentLayout()[key] || { x: 0, y: 0, scale: 1 };
}

function syncLayoutBar() {
  if (!el.layoutBar) return;

  const selected = layoutSelection.node;
  const hasSelection = Boolean(selected && selected.isConnected);
  if (el.layoutTargetName) {
    el.layoutTargetName.textContent = hasSelection
      ? labelForLayoutNode(selected)
      : "Выберите элемент";
  }

  [el.layoutScale, el.layoutX, el.layoutY].forEach((input) => {
    if (input) input.disabled = !hasSelection;
  });
  el.layoutBar.querySelector("[data-layout-reset-item]")?.toggleAttribute("disabled", !hasSelection);
  el.layoutBar.querySelector("[data-layout-deep]")?.classList.toggle("is-active", ui.layoutDeep);
  el.layoutBar.querySelector("[data-layout-deep]")?.setAttribute("aria-pressed", String(ui.layoutDeep));

  if (!hasSelection) {
    if (el.layoutScale) el.layoutScale.value = "100";
    if (el.layoutScaleValue) el.layoutScaleValue.textContent = "100%";
    if (el.layoutX) el.layoutX.value = "0";
    if (el.layoutY) el.layoutY.value = "0";
    return;
  }

  const value = layoutValueFor(layoutSelection.key);
  layoutSelection.x = value.x;
  layoutSelection.y = value.y;
  layoutSelection.scale = value.scale;

  if (el.layoutScale && document.activeElement !== el.layoutScale) {
    el.layoutScale.value = String(Math.round(value.scale * 100));
  }
  if (el.layoutScaleValue) {
    el.layoutScaleValue.textContent = `${Math.round(value.scale * 100)}%`;
  }
  if (el.layoutX && document.activeElement !== el.layoutX) el.layoutX.value = String(value.x);
  if (el.layoutY && document.activeElement !== el.layoutY) el.layoutY.value = String(value.y);
}

function updateLayoutOutline() {
  if (!el.layoutOutline) return;

  const node = layoutSelection.node;
  if (!ui.layoutOpen || !node || !node.isConnected) {
    el.layoutOutline.hidden = true;
    return;
  }

  const rect = node.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) {
    el.layoutOutline.hidden = true;
    return;
  }

  el.layoutOutline.hidden = false;
  el.layoutOutline.style.left = `${rect.left}px`;
  el.layoutOutline.style.top = `${rect.top}px`;
  el.layoutOutline.style.width = `${rect.width}px`;
  el.layoutOutline.style.height = `${rect.height}px`;

  if (el.layoutOutlineLabel) {
    el.layoutOutlineLabel.textContent = labelForLayoutNode(node);
  }
}

function selectLayoutNode(node) {
  if (!node || isLayoutChrome(node)) return;

  if (layoutSelection.hover) {
    layoutSelection.hover.classList.remove("layout-hover");
    layoutSelection.hover = null;
  }

  layoutSelection.node = node;
  layoutSelection.key = layoutKeyFor(node);
  const value = layoutValueFor(layoutSelection.key);
  layoutSelection.x = value.x;
  layoutSelection.y = value.y;
  layoutSelection.scale = value.scale;

  syncLayoutBar();
  requestAnimationFrame(updateLayoutOutline);
}

function layoutTargetFromEvent(event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  if (isLayoutChrome(target)) return null;

  if (!ui.layoutDeep) {
    const named = target.closest("[data-layout-name]");
    if (named && !isLayoutChrome(named)) return named;
  }

  let node = target;
  while (
    node &&
    node !== document.body &&
    (node instanceof SVGElement ||
      ["SVG", "USE", "PATH", "SPAN", "B", "SMALL", "KBD"].includes(node.tagName))
  ) {
    node = node.parentElement;
  }

  if (node && node !== document.body && el.app?.contains(node)) return node;
  return el.app?.contains(target) ? target : null;
}

function setLayoutValue(node, key, patch, save = true) {
  if (!node || !key || !state) return;

  const nextLayout = { ...currentLayout() };
  const previous = nextLayout[key] || { x: 0, y: 0, scale: 1 };
  const value = {
    x: Math.max(-4000, Math.min(4000, Math.round(Number(patch.x ?? previous.x) || 0))),
    y: Math.max(-4000, Math.min(4000, Math.round(Number(patch.y ?? previous.y) || 0))),
    scale: Math.max(0.35, Math.min(2.5, Number(patch.scale ?? previous.scale) || 1))
  };

  if (value.x === 0 && value.y === 0 && Math.abs(value.scale - 1) < 0.001) {
    delete nextLayout[key];
    clearLayoutValue(node);
    delete node.dataset.layoutKey;
  } else {
    nextLayout[key] = value;
    node.dataset.layoutKey = key;
    applyLayoutValue(node, value);
  }

  state.settings.appearance = { ...currentAppearance(), layout: nextLayout };
  layoutSelection.x = value.x;
  layoutSelection.y = value.y;
  layoutSelection.scale = value.scale;
  syncLayoutBar();
  updateLayoutOutline();

  if (save) scheduleLayoutSave();
}

function scheduleLayoutSave() {
  if (ui.layoutSaveTimer) clearTimeout(ui.layoutSaveTimer);
  ui.layoutSaveTimer = setTimeout(() => {
    ui.layoutSaveTimer = null;
    if (!state) return;
    api.updateSettings({ appearance: { layout: currentLayout() } });
  }, 120);
}

function flushLayoutSave() {
  if (!ui.layoutSaveTimer) return;
  clearTimeout(ui.layoutSaveTimer);
  ui.layoutSaveTimer = null;
  if (state) api.updateSettings({ appearance: { layout: currentLayout() } });
}

function resetSelectedLayout() {
  if (!layoutSelection.node || !layoutSelection.key) return;
  setLayoutValue(layoutSelection.node, layoutSelection.key, { x: 0, y: 0, scale: 1 }, true);
  showToast("Элемент возвращён на место");
}

function resetAllLayout() {
  if (!state) return;
  state.settings.appearance = { ...currentAppearance(), layout: {} };
  applySettings();
  syncLayoutBar();
  scheduleLayoutSave();
  showToast("Компоновка сброшена");
}

function openLayoutMode() {
  closeAllOverlays();

  registerLayoutTargets();
  ui.layoutOpen = true;
  document.body.classList.add("layout-mode");
  if (el.layoutBar) el.layoutBar.hidden = false;
  if (el.layoutOutline) el.layoutOutline.hidden = true;
  layoutSelection.node = null;
  layoutSelection.key = null;
  layoutSelection.hover = null;
  syncLayoutBar();
  applyLayout(currentLayout());
  api.setOverlay(true);
}

function closeLayoutMode() {
  if (!ui.layoutOpen) return;

  flushLayoutSave();
  ui.layoutOpen = false;
  ui.layoutDeep = false;
  document.body.classList.remove("layout-mode");

  if (layoutSelection.hover) {
    layoutSelection.hover.classList.remove("layout-hover");
    layoutSelection.hover = null;
  }

  layoutSelection.node = null;
  layoutSelection.key = null;
  layoutSelection.drag = null;
  layoutSelection.suppressClick = false;

  if (el.layoutBar) el.layoutBar.hidden = true;
  if (el.layoutOutline) el.layoutOutline.hidden = true;

  api.setOverlay(false);
  requestAnimationFrame(() => {
    updateLayoutOutline();
    scheduleBounds();
  });
}

function beginLayoutDrag(event, node) {
  if (!node) return;
  selectLayoutNode(node);

  const value = layoutValueFor(layoutSelection.key);
  layoutSelection.drag = {
    type: "move",
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    baseX: value.x,
    baseY: value.y,
    baseScale: value.scale,
    node,
    key: layoutSelection.key
  };
  layoutSelection.suppressClick = true;
  document.body.classList.add("layout-dragging");
}

function beginLayoutScale(event) {
  const node = layoutSelection.node;
  if (!node || !layoutSelection.key) return;

  const rect = node.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const startDistance = Math.max(
    24,
    Math.hypot(event.clientX - centerX, event.clientY - centerY)
  );
  const scaleRange = Math.max(140, Math.max(rect.width, rect.height) * 0.45);

  layoutSelection.drag = {
    type: "scale",
    pointerId: event.pointerId,
    startDistance,
    scaleRange,
    centerX,
    centerY,
    baseScale: layoutSelection.scale,
    node,
    key: layoutSelection.key
  };
  layoutSelection.suppressClick = true;
  document.body.classList.add("layout-dragging");
}

function handleLayoutPointerMove(event) {
  if (!ui.layoutOpen) return;
  const drag = layoutSelection.drag;

  if (!drag) {
    const node = layoutTargetFromEvent(event);
    if (node !== layoutSelection.hover) {
      if (layoutSelection.hover) layoutSelection.hover.classList.remove("layout-hover");
      layoutSelection.hover = node;
      if (node) node.classList.add("layout-hover");
    }
    return;
  }

  event.preventDefault();

  if (drag.type === "move") {
    let x = drag.baseX + (event.clientX - drag.startX);
    let y = drag.baseY + (event.clientY - drag.startY);
    if (event.shiftKey) {
      x = Math.round(x / 10) * 10;
      y = Math.round(y / 10) * 10;
    }
    setLayoutValue(drag.node, drag.key, { x, y, scale: drag.baseScale }, false);
  } else {
    const distance = Math.hypot(event.clientX - drag.centerX, event.clientY - drag.centerY);
    const delta = distance - drag.startDistance;
    let scale = drag.baseScale * (1 + delta / drag.scaleRange);
    scale = Math.max(0.35, Math.min(2.5, Math.round(scale * 100) / 100));
    setLayoutValue(drag.node, drag.key, {
      x: layoutSelection.x,
      y: layoutSelection.y,
      scale
    }, false);
  }
}

function finishLayoutDrag() {
  if (!layoutSelection.drag) return;
  layoutSelection.drag = null;
  document.body.classList.remove("layout-dragging");
  syncLayoutBar();
  scheduleLayoutSave();
  setTimeout(() => {
    layoutSelection.suppressClick = false;
  }, 0);
}

function handleLayoutPointerDown(event) {
  if (!ui.layoutOpen) return;
  if (event.button !== 0 && event.pointerType !== "touch") return;

  if (event.target.closest?.("#layout-bar")) return;

  const handle = event.target.closest?.("[data-layout-handle='scale']");
  if (handle) {
    event.preventDefault();
    event.stopPropagation();
    beginLayoutScale(event);
    return;
  }

  const node = layoutTargetFromEvent(event);
  if (!node) return;

  event.preventDefault();
  event.stopPropagation();
  beginLayoutDrag(event, node);
}

function handleLayoutPointerUp() {
  finishLayoutDrag();
}

function handleLayoutClick(event) {
  if (!ui.layoutOpen) return;
  if (event.target.closest?.("#layout-bar")) return;
  event.preventDefault();
  event.stopPropagation();
}

function handleLayoutBarClick(event) {
  if (event.target.closest("[data-layout-done]")) {
    closeLayoutMode();
    return;
  }

  if (event.target.closest("[data-layout-reset-item]")) {
    resetSelectedLayout();
    return;
  }

  if (event.target.closest("[data-layout-reset-all]")) {
    resetAllLayout();
    return;
  }

  const deep = event.target.closest("[data-layout-deep]");
  if (deep) {
    ui.layoutDeep = !ui.layoutDeep;
    syncLayoutBar();
  }
}

function handleLayoutBarInput(event) {
  if (!layoutSelection.node || !layoutSelection.key) return;

  if (event.target.id === "layout-scale") {
    const value = Math.max(35, Math.min(250, Number(event.target.value) || 100));
    if (el.layoutScaleValue) el.layoutScaleValue.textContent = `${value}%`;
    setLayoutValue(layoutSelection.node, layoutSelection.key, {
      x: layoutSelection.x,
      y: layoutSelection.y,
      scale: value / 100
    }, false);
    scheduleLayoutSave();
    return;
  }

  if (event.target.id === "layout-x") {
    setLayoutValue(layoutSelection.node, layoutSelection.key, {
      x: Number(event.target.value) || 0,
      y: layoutSelection.y,
      scale: layoutSelection.scale
    }, false);
    scheduleLayoutSave();
    return;
  }

  if (event.target.id === "layout-y") {
    setLayoutValue(layoutSelection.node, layoutSelection.key, {
      x: layoutSelection.x,
      y: Number(event.target.value) || 0,
      scale: layoutSelection.scale
    }, false);
    scheduleLayoutSave();
  }
}

function bindLayoutEvents() {
  el.layoutBar?.addEventListener("click", handleLayoutBarClick);
  el.layoutBar?.addEventListener("input", handleLayoutBarInput);

  document.addEventListener("pointerdown", handleLayoutPointerDown, true);
  document.addEventListener("pointermove", handleLayoutPointerMove, true);
  document.addEventListener("pointerup", handleLayoutPointerUp, true);
  document.addEventListener("pointercancel", handleLayoutPointerUp, true);
  document.addEventListener("click", handleLayoutClick, true);
  document.addEventListener("mouseleave", () => {
    if (layoutSelection.hover) {
      layoutSelection.hover.classList.remove("layout-hover");
      layoutSelection.hover = null;
    }
  });
  window.addEventListener("resize", () => {
    if (ui.layoutOpen) requestAnimationFrame(updateLayoutOutline);
  });
}

function handleLayoutKeydown(event) {
  if (event.target.closest?.("#layout-bar")) return;

  const key = String(event.key || "").toLowerCase();

  if (key === "escape") {
    event.preventDefault();
    closeLayoutMode();
    return;
  }

  if (!layoutSelection.node || !layoutSelection.key) return;

  if (key === "delete" || key === "backspace") {
    event.preventDefault();
    resetSelectedLayout();
    return;
  }

  const step = event.shiftKey ? 10 : 1;
  const positions = {
    arrowleft: [-step, 0],
    arrowright: [step, 0],
    arrowup: [0, -step],
    arrowdown: [0, step]
  };
  const delta = positions[key];
  if (!delta) return;

  event.preventDefault();
  setLayoutValue(layoutSelection.node, layoutSelection.key, {
    x: layoutSelection.x + delta[0],
    y: layoutSelection.y + delta[1],
    scale: layoutSelection.scale
  }, true);
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

  const layout = currentLayout();
  if (Object.keys(layout).length) applyLayout(layout);
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

  renderSpaces();
  renderTabs();
  renderBookmarks();
  renderOmnibox();
  renderShieldBadge();
  renderPageState();
  renderProgress();

  if (ui.panel) renderDrawer();
  if (ui.settingsOpen) renderSettings();
  if (ui.designerOpen) syncDesigner();
  if (ui.paletteOpen) renderPalette();
  if (ui.layoutOpen) {
    syncLayoutBar();
    requestAnimationFrame(updateLayoutOutline);
  }

  const layout = currentLayout();
  if (Object.keys(layout).length) applyLayout(layout);
}

function renderSpaces() {
  if (!el.spaces) return;

  const spaces = Array.isArray(state.spaces) ? state.spaces.slice(0, 8) : [];

  if (!spaces.length) {
    el.spaces.innerHTML = `
      <button class="space-empty" type="button" data-panel="spaces">
        ${icon("space")}
        <span>Сохранить вкладки как пространство</span>
      </button>
    `;
    return;
  }

  el.spaces.innerHTML = spaces
    .map(
      (space) => `
        <button class="space-chip" type="button" data-space-open="${escapeHTML(space.id)}" title="${escapeHTML(space.name)} — ${(space.tabs || []).length} ${plural((space.tabs || []).length, "вкладка", "вкладки", "вкладок")}" style="--space-color:${safeColor(space.color, "#a855f7")}">
          <span class="space-dot"></span>
          <span class="space-name">${escapeHTML(space.name)}</span>
          <span class="space-count">${(space.tabs || []).length}</span>
        </button>
      `
    )
    .join("");
}

function renderShieldBadge() {
  if (!el.shieldBadge) return;
  const blocked = Number(state.shield?.sessionBlocked) || 0;
  el.shieldBadge.textContent = blocked > 99 ? "99+" : String(blocked);
  el.shieldBadge.hidden = blocked <= 0;
  if (el.openShield) {
    el.openShield.title = blocked
      ? `Щит Lumen: ${blocked} запросов остановлено за сессию`
      : "Щит Lumen";
    el.openShield.setAttribute("aria-label", el.openShield.title);
  }
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
            <span class="block-head-actions">
              <button class="block-link" type="button" data-open-timeline>хроника</button>
              <button class="block-link" type="button" data-panel="history">вся история</button>
            </span>
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
      <div class="setting-group-title">Интерфейс</div>
      <div class="setting-row setting-row--designer">
        <div class="setting-copy">
          <h3>Редактор интерфейса</h3>
          <p>Свои цвета, форма, шрифт и атмосфера. Всё меняется сразу.</p>
        </div>
        <div class="setting-control">
          <button class="designer-open-btn" type="button" data-open-designer>
            ${icon("spark")}
            <span>Открыть редактор</span>
            ${icon("arrow")}
          </button>
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

    <div class="setting-group">
      <div class="setting-group-title">Приватность</div>
      <div class="setting-row">
        <div class="setting-copy">
          <h3>Щит Lumen</h3>
          <p>Локально блокирует известные аналитические и рекламные домены. Счётчик и список — в панели щита.</p>
        </div>
        <div class="setting-control">
          <button class="toggle${settings.shield !== false ? " is-on" : ""}" type="button" data-toggle="shield" role="switch" aria-checked="${settings.shield !== false}" aria-label="Щит Lumen"></button>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-copy">
          <h3>Заметки и пространства</h3>
          <p>Хранятся только в локальном файле состояния Lumen.</p>
        </div>
        <div class="setting-control">
          <button class="btn btn--ghost" type="button" data-panel="notes">Открыть заметки</button>
        </div>
      </div>
    </div>

    <div class="settings-foot">
      <span>Lumen 2.0 Beta · настройки сохраняются локально.</span>
      <b>LUMEN 2.0</b>
    </div>
  `;
}

/* =========================================================
   Interface designer
   ========================================================= */

function designerColorField(key, label, note) {
  const appearance = currentAppearance();
  const selected = appearance[key];
  const value = selected || defaultPaletteColor(key);
  const isCustom = Boolean(selected);

  return `
    <div class="designer-field designer-field--color">
      <div class="designer-label">
        <span>${label}<small>${note}</small></span>
        <button class="designer-clear${isCustom ? "" : " is-hidden"}" type="button" data-clear-color="${key}" title="Вернуть автоматический цвет">авто</button>
      </div>
      <div class="designer-color-line">
        <label class="designer-color-chip" style="--picked:${value}">
          <input type="color" data-color-key="${key}" value="${value}" aria-label="${label}">
          <span aria-hidden="true"></span>
        </label>
        <input class="designer-hex" type="text" data-color-text="${key}" value="${isCustom ? selected.toUpperCase() : ""}" placeholder="${value.toUpperCase()}" spellcheck="false" maxlength="7" aria-label="${label}, HEX">
        <span class="designer-color-state" data-color-state="${key}">${isCustom ? "свой" : "авто"}</span>
      </div>
    </div>
  `;
}

function renderDesigner() {
  if (!el.designerBody || !state) return;

  const appearance = currentAppearance();
  const settings = state.settings || {};
  const theme = currentTheme();
  const accentKey = currentAccentKey();
  const customAccent = appearance.accentColor;
  const accentValue = customAccent || defaultAccentColor();

  const themeButtons = Object.entries(THEMES)
    .map(
      ([value, item]) => `
        <button class="designer-theme-option${theme === value ? " is-active" : ""}" type="button" data-designer-theme="${value}" role="radio" aria-checked="${theme === value}" title="${escapeHTML(item.name)}">
          ${icon(item.icon)}
          <span>${escapeHTML(item.name)}</span>
        </button>
      `
    )
    .join("");

  const accentSwatches = Object.entries(ACCENTS)
    .map(
      ([value, item]) => `
        <button class="designer-swatch${!customAccent && accentKey === value ? " is-active" : ""}" type="button" data-designer-accent="${value}" style="--swatch:${item.color}" title="${escapeHTML(item.name)}" aria-label="${escapeHTML(item.name)}" aria-pressed="${!customAccent && accentKey === value}"></button>
      `
    )
    .join("");

  const densityButtons = Object.entries(DENSITIES)
    .map(
      ([value, item]) => `
        <button class="designer-density${appearance.density === value ? " is-active" : ""}" type="button" data-density-value="${value}" aria-pressed="${appearance.density === value}">
          <span>${escapeHTML(item.name)}</span>
          <small>${value === "compact" ? "меньше воздуха" : value === "airy" ? "больше пространства" : "баланс"}</small>
        </button>
      `
    )
    .join("");

  const patternButtons = Object.entries(PATTERNS)
    .map(
      ([value, item]) => `
        <button class="designer-pattern${appearance.pattern === value ? " is-active" : ""}" type="button" data-pattern-value="${value}" aria-pressed="${appearance.pattern === value}">
          <span class="designer-pattern-art" data-pattern-art="${value}" aria-hidden="true"></span>
          <span class="designer-pattern-copy"><b>${escapeHTML(item.name)}</b><small>${escapeHTML(item.note)}</small></span>
        </button>
      `
    )
    .join("");

  const fontOptions = Object.entries(UI_FONTS)
    .map(
      ([value, item]) =>
        `<option value="${value}"${appearance.font === value ? " selected" : ""}>${escapeHTML(item.name)}</option>`
    )
    .join("");

  const toggle = (key, label, note, enabled, type = "settings") => `
    <div class="designer-toggle-row">
      <div><b>${label}</b><small>${note}</small></div>
      <button class="toggle${enabled ? " is-on" : ""}" type="button" data-designer-toggle="${key}" data-toggle-type="${type}" role="switch" aria-checked="${enabled}" aria-label="${label}"></button>
    </div>
  `;

  el.designerBody.innerHTML = `
    <div class="designer-layout">
      <div class="designer-controls">
        <section class="designer-section">
          <header class="designer-section-head">
            <span class="designer-index">01</span>
            <div><h3>Палитра</h3><p>Тема, акцент и цвета поверхностей.</p></div>
          </header>

          <div class="designer-field">
            <div class="designer-label"><span>Тема<small>основа интерфейса</small></span></div>
            <div class="designer-theme" role="radiogroup" aria-label="Тема">${themeButtons}</div>
          </div>

          <div class="designer-field">
            <div class="designer-label">
              <span>Акцент<small>ваш главный оттенок</small></span>
              <button class="designer-clear${customAccent ? "" : " is-hidden"}" type="button" data-clear-color="accentColor" title="Вернуть акцент из темы">авто</button>
            </div>
            <div class="designer-swatches">
              ${accentSwatches}
              <label class="designer-swatch designer-swatch--custom${customAccent ? " is-active" : ""}" style="--swatch:${accentValue}" title="Свой акцент">
                <input type="color" data-color-key="accentColor" value="${accentValue}" aria-label="Свой акцент">
                <span aria-hidden="true">${customAccent ? "" : icon("plus")}</span>
              </label>
            </div>
            <div class="designer-color-line designer-color-line--accent">
              <input class="designer-hex" type="text" data-color-text="accentColor" value="${customAccent ? customAccent.toUpperCase() : ""}" placeholder="${defaultAccentColor().toUpperCase()}" spellcheck="false" maxlength="7" aria-label="Свой акцент, HEX">
              <span class="designer-color-state" data-color-state="accentColor">${customAccent ? "свой" : "из темы"}</span>
            </div>
          </div>

          ${designerColorField("bgColor", "Фон", "главное полотно")}
          ${designerColorField("surfaceColor", "Поверхности", "панели и окна")}
          ${designerColorField("textColor", "Текст", "контраст и настроение")}
        </section>

        <section class="designer-section">
          <header class="designer-section-head">
            <span class="designer-index">02</span>
            <div><h3>Форма</h3><p>Радиусы, плотность и характер шрифта.</p></div>
          </header>

          <div class="designer-field">
            <div class="designer-label">
              <span>Скругление<small>от строгих углов до мягких форм</small></span>
              <output class="designer-output" data-radius-value>${appearance.radius}px</output>
            </div>
            <input class="designer-range" id="designer-radius" type="range" min="0" max="30" step="1" value="${appearance.radius}" aria-label="Скругление">
          </div>

          <div class="designer-field">
            <div class="designer-label"><span>Плотность<small>сколько воздуха оставить</small></span></div>
            <div class="designer-density-grid">${densityButtons}</div>
          </div>

          <div class="designer-field">
            <div class="designer-label"><span>Шрифт<small>голос интерфейса</small></span></div>
            <span class="select-wrap designer-select">
              <select id="designer-font" aria-label="Шрифт интерфейса">${fontOptions}</select>
            </span>
          </div>
        </section>

        <section class="designer-section">
          <header class="designer-section-head">
            <span class="designer-index">03</span>
            <div><h3>Атмосфера</h3><p>Фактура фона и мелкие привычки Lumen.</p></div>
          </header>

          <div class="designer-field">
            <div class="designer-label"><span>Фон новой вкладки<small>настроение стартовой страницы</small></span></div>
            <div class="designer-pattern-grid">${patternButtons}</div>
          </div>

          <div class="designer-toggles">
            ${toggle("glow", "Свечение", "мягкие цветные ореолы", appearance.glow !== false, "appearance")}
            ${toggle("showBookmarks", "Закладки в панели", "быстрый доступ слева", settings.showBookmarks !== false)}
            ${toggle("animations", "Анимации", "плавные переходы", settings.animations !== false)}
          </div>
        </section>

        <section class="designer-section">
          <header class="designer-section-head">
            <span class="designer-index">04</span>
            <div><h3>Компоновка</h3><p>Двигайте и масштабируйте элементы прямо в браузере.</p></div>
          </header>

          <div class="designer-layout-cta">
            <div class="designer-layout-copy">
              <b>Свободное расположение</b>
              <p>Перетаскивайте панели, кнопки и блоки. Тяните угол, чтобы уменьшить или увеличить элемент. Раскладка сохранится автоматически.</p>
            </div>
            <button class="designer-layout-btn" type="button" data-open-layout>
              ${icon("move")}
              <span>Открыть компоновку</span>
            </button>
          </div>
        </section>
      </div>

      <aside class="designer-preview">
        <div class="designer-preview-head">
          <span class="eyebrow">живой предпросмотр</span>
          <span class="designer-preview-badge" data-preview-label="theme">${escapeHTML(THEMES[theme].name)}</span>
        </div>

        <div class="designer-mock">
          <div class="designer-mock-side">
            <div class="designer-mock-brand">${icon("logo")}<span>lumen</span></div>
            <div class="designer-mock-new">${icon("plus")}<span>Новая вкладка</span></div>
            <div class="designer-mock-label">Вкладки</div>
            <div class="designer-mock-tab is-active"><span class="designer-mock-favicon">L</span><span>Новая вкладка</span><b>×</b></div>
            <div class="designer-mock-tab"><span class="designer-mock-favicon designer-mock-favicon--blue">G</span><span>GitHub</span></div>
            <div class="designer-mock-label">Закладки</div>
            <div class="designer-mock-bookmark"><span>M</span><span>MDN</span></div>
            <div class="designer-mock-bookmark"><span>W</span><span>Wikipedia</span></div>
            <div class="designer-mock-side-foot"><span>История</span><span>Настройки</span></div>
          </div>
          <div class="designer-mock-main">
            <div class="designer-mock-toolbar">
              <span class="designer-mock-dot"></span><span class="designer-mock-dot"></span><span class="designer-mock-dot"></span>
              <span class="designer-mock-address">Поиск или адрес</span>
              <span class="designer-mock-star">${icon("star")}</span>
            </div>
            <div class="designer-mock-page">
              <span class="designer-mock-kicker">тихое место для интернета</span>
              <h4>Добрый вечер.</h4>
              <div class="designer-mock-search">${icon("search")}<span>Поиск или адрес</span><b>${icon("arrow")}</b></div>
              <div class="designer-mock-cards">
                <div class="designer-mock-card"><span class="designer-mock-card-icon">G</span><b>GitHub</b><small>github.com</small></div>
                <div class="designer-mock-card"><span class="designer-mock-card-icon designer-mock-card-icon--blue">M</span><b>MDN</b><small>developer.mozilla.org</small></div>
                <div class="designer-mock-card"><span class="designer-mock-card-icon designer-mock-card-icon--coral">Y</span><b>YouTube</b><small>youtube.com</small></div>
              </div>
            </div>
          </div>
        </div>

        <div class="designer-preview-meta">
          <span data-preview-label="font">${escapeHTML(UI_FONTS[appearance.font].name)}</span>
          <span>·</span>
          <span data-preview-label="density">${escapeHTML(DENSITIES[appearance.density].name)}</span>
          <span>·</span>
          <span data-preview-label="pattern">${escapeHTML(PATTERNS[appearance.pattern].name)}</span>
        </div>
        <p class="designer-preview-note">${icon("spark")} Меняйте что угодно — предпросмотр и сам браузер обновляются одновременно.</p>
      </aside>
    </div>

    <footer class="designer-foot">
      <span>${icon("check")} Сохраняется автоматически на этом устройстве</span>
      <div class="designer-foot-actions">
        <button class="designer-reset" type="button" data-reset-designer>Сбросить вид</button>
        <button class="designer-done" type="button" data-close-designer>Готово</button>
      </div>
    </footer>
  `;

  syncDesigner();
}

function syncDesigner() {
  if (!ui.designerOpen || !el.designerBody || !state) return;

  const appearance = currentAppearance();
  const settings = state.settings || {};
  const theme = currentTheme();
  const accentKey = currentAccentKey();
  const customAccent = appearance.accentColor;

  el.designerBody.querySelectorAll("[data-designer-theme]").forEach((button) => {
    const active = button.dataset.designerTheme === theme;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-checked", String(active));
  });

  el.designerBody.querySelectorAll("[data-designer-accent]").forEach((button) => {
    const active = !customAccent && button.dataset.designerAccent === accentKey;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const customSwatch = el.designerBody.querySelector(".designer-swatch--custom");
  if (customSwatch) {
    customSwatch.classList.toggle("is-active", Boolean(customAccent));
    customSwatch.style.setProperty("--swatch", customAccent || defaultAccentColor());
    const input = customSwatch.querySelector("input[type='color']");
    if (input && document.activeElement !== input) input.value = customAccent || defaultAccentColor();
    const mark = customSwatch.querySelector("span");
    if (mark) mark.innerHTML = customAccent ? "" : icon("plus");
  }

  el.designerBody.querySelectorAll("[data-color-key]").forEach((input) => {
    const key = input.dataset.colorKey;
    const value = appearance[key] || defaultPaletteColor(key);
    if (document.activeElement !== input) input.value = value;
    const chip = input.closest(".designer-color-chip");
    if (chip) chip.style.setProperty("--picked", value);
  });

  el.designerBody.querySelectorAll("[data-color-text]").forEach((input) => {
    const key = input.dataset.colorText;
    const custom = appearance[key];
    if (document.activeElement !== input) input.value = custom ? custom.toUpperCase() : "";
    input.placeholder = defaultPaletteColor(key).toUpperCase();
  });

  el.designerBody.querySelectorAll("[data-color-state]").forEach((label) => {
    const key = label.dataset.colorState;
    if (key === "accentColor") {
      label.textContent = customAccent ? "свой" : "из темы";
    } else {
      label.textContent = appearance[key] ? "свой" : "авто";
    }
  });

  el.designerBody.querySelectorAll("[data-clear-color]").forEach((button) => {
    const key = button.dataset.clearColor;
    button.classList.toggle("is-hidden", !appearance[key]);
  });

  el.designerBody.querySelectorAll("[data-density-value]").forEach((button) => {
    const active = button.dataset.densityValue === appearance.density;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  el.designerBody.querySelectorAll("[data-pattern-value]").forEach((button) => {
    const active = button.dataset.patternValue === appearance.pattern;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const radius = el.designerBody.querySelector("#designer-radius");
  if (radius && document.activeElement !== radius) radius.value = String(appearance.radius);
  const radiusValue = el.designerBody.querySelector("[data-radius-value]");
  if (radiusValue) radiusValue.textContent = `${appearance.radius}px`;

  const font = el.designerBody.querySelector("#designer-font");
  if (font && document.activeElement !== font) font.value = appearance.font;

  el.designerBody.querySelectorAll("[data-designer-toggle]").forEach((button) => {
    const key = button.dataset.designerToggle;
    const type = button.dataset.toggleType;
    const active = type === "appearance"
      ? appearance[key] !== false
      : settings[key] !== false;
    button.classList.toggle("is-on", active);
    button.setAttribute("aria-checked", String(active));
  });

  const setPreview = (name, value) => {
    const node = el.designerBody.querySelector(`[data-preview-label="${name}"]`);
    if (node) node.textContent = value;
  };
  setPreview("theme", THEMES[theme].name);
  setPreview("font", UI_FONTS[appearance.font].name);
  setPreview("density", DENSITIES[appearance.density].name);
  setPreview("pattern", PATTERNS[appearance.pattern].name);
}

function patchAppearance(patch, immediate = false) {
  if (!state) return;

  const next = { ...currentAppearance(), ...patch };
  state.settings.appearance = next;
  applySettings();
  syncDesigner();

  if (ui.appearanceTimer) clearTimeout(ui.appearanceTimer);
  const send = () => {
    ui.appearanceTimer = null;
    api.updateSettings({ appearance: next });
  };

  if (immediate) send();
  else ui.appearanceTimer = setTimeout(send, 80);
}

function flushAppearancePatch() {
  if (!ui.appearanceTimer) return;
  clearTimeout(ui.appearanceTimer);
  ui.appearanceTimer = null;
  api.updateSettings({ appearance: currentAppearance() });
}

function updateDesignerSettings(patch) {
  flushAppearancePatch();
  api.updateSettings(patch).then((next) => {
    if (!next || !state) return;
    state = next;
    applySettings();
    syncDesigner();
  });
}

function resetDesigner() {
  if (!state) return;

  if (ui.appearanceTimer) {
    clearTimeout(ui.appearanceTimer);
    ui.appearanceTimer = null;
  }

  state.settings.theme = "dark";
  state.settings.accent = "gold";
  state.settings.showBookmarks = true;
  state.settings.animations = true;
  state.settings.appearance = { ...DEFAULT_APPEARANCE };
  applySettings();
  syncDesigner();

  api.updateSettings({
    theme: "dark",
    accent: "gold",
    showBookmarks: true,
    animations: true,
    appearance: { ...DEFAULT_APPEARANCE }
  });
  showToast("Вид сброшен к Lumen");
}

/* =========================================================
   Drawer: history and downloads
   ========================================================= */

function buildTimeline(history) {
  const gap = 30 * 60 * 1000;
  const items = (Array.isArray(history) ? history : [])
    .filter((item) => item && item.url)
    .slice()
    .sort((a, b) => (Number(b.visitedAt) || 0) - (Number(a.visitedAt) || 0));

  const sessions = [];

  items.forEach((item) => {
    const at = Number(item.visitedAt) || Date.now();
    const current = sessions[sessions.length - 1];

    if (!current || current.lastAt - at > gap) {
      sessions.push({ items: [item], lastAt: at });
    } else {
      current.items.push(item);
      current.lastAt = at;
    }
  });

  return sessions.map((session) => {
    const sorted = session.items
      .slice()
      .sort((a, b) => (Number(a.visitedAt) || 0) - (Number(b.visitedAt) || 0));
    return {
      items: sorted,
      startAt: Number(sorted[0]?.visitedAt) || Date.now(),
      endAt: Number(sorted[sorted.length - 1]?.visitedAt) || Date.now()
    };
  });
}

function renderTimeline(history) {
  const sessions = buildTimeline(history).slice(0, 12);
  ui.timelineSessions = sessions;

  if (!sessions.length) {
    return `
      <div class="drawer-empty">
        <span class="drawer-empty-icon">${icon("history")}</span>
        <b>Хроника пока пуста</b>
        <p>Откройте несколько страниц — Lumen соберёт их в сессии.</p>
      </div>
    `;
  }

  return `
    <div class="timeline-list">
      ${sessions
        .map((session, index) => {
          const domains = Array.from(
            new Set(session.items.map((item) => domainOf(item.url)).filter(Boolean))
          ).slice(0, 3);

          return `
            <article class="timeline-card">
              <div class="timeline-card-head">
                <span class="timeline-marker" aria-hidden="true"></span>
                <div class="timeline-card-copy">
                  <b>${escapeHTML(dayLabel(session.startAt))} · ${escapeHTML(formatTime(session.startAt))}–${escapeHTML(formatTime(session.endAt))}</b>
                  <span>${session.items.length} ${plural(session.items.length, "страница", "страницы", "страниц")}${domains.length ? ` · ${domains.map((domain) => escapeHTML(domain)).join(" · ")}` : ""}</span>
                </div>
                <button class="timeline-open" type="button" data-open-session="${index}">Открыть</button>
              </div>
              <div class="timeline-pages">
                ${session.items
                  .slice(0, 5)
                  .map(
                    (item) => `
                      <button class="timeline-page" type="button" data-history-url="${escapeHTML(item.url)}" title="${escapeHTML(item.title || item.url)}">
                        ${faviconMarkup(item, "timeline-favicon")}
                        <span>${escapeHTML(item.title || domainOf(item.url))}</span>
                        <small>${escapeHTML(formatTime(item.visitedAt))}</small>
                      </button>
                    `
                  )
                  .join("")}
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function historyGroupsMarkup(history, query) {
  const groups = new Map();
  history.forEach((item) => {
    const key = dayKey(item.visitedAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  if (!groups.size) {
    return `
      <div class="drawer-empty">
        <span class="drawer-empty-icon">${icon("history")}</span>
        <b>${query ? "Ничего не найдено" : "История пока пуста"}</b>
        <p>${query ? "Попробуйте другой запрос." : "Страницы, которые вы открываете, будут появляться здесь."}</p>
      </div>
    `;
  }

  return Array.from(groups.entries())
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
    .join("");
}

function renderDrawer() {
  if (!el.drawerBody || !ui.panel) return;

  if (
    (ui.panel === "notes" && document.activeElement?.id === "note-editor") ||
    (ui.panel === "spaces" && document.activeElement?.classList?.contains("space-name-input"))
  ) {
    return;
  }

  if (ui.panel === "history") {
    const isTimeline = ui.historyView === "timeline";
    if (el.drawerTitle) el.drawerTitle.textContent = isTimeline ? "Хроника" : "История";
    if (el.drawerKicker) el.drawerKicker.textContent = isTimeline ? "сессии" : "архив";
    if (el.drawerActions) el.drawerActions.innerHTML = "";

    const query = ui.historyQuery.trim().toLowerCase();
    const history = (Array.isArray(state.history) ? state.history : []).filter((item) => {
      if (!query) return true;
      return `${item.title || ""} ${item.url || ""}`.toLowerCase().includes(query);
    });

    const content = isTimeline ? renderTimeline(history) : historyGroupsMarkup(history, query);

    el.drawerBody.innerHTML = `
      <div class="drawer-toolbar drawer-toolbar--history">
        <div class="drawer-view-switch" role="tablist" aria-label="Вид истории">
          <button class="drawer-view-btn${isTimeline ? "" : " is-active"}" type="button" data-history-view="list" role="tab" aria-selected="${!isTimeline}">Лента</button>
          <button class="drawer-view-btn${isTimeline ? " is-active" : ""}" type="button" data-history-view="timeline" role="tab" aria-selected="${isTimeline}">Хроника</button>
        </div>
        <label class="drawer-search">
          ${icon("search")}
          <input id="history-search" type="text" spellcheck="false" autocomplete="off" placeholder="Найти в истории" value="${escapeHTML(ui.historyQuery)}" aria-label="Поиск по истории">
        </label>
        ${isTimeline ? "" : `<button class="drawer-clear" type="button" data-clear-history>${icon("trash")}<span>Очистить</span></button>`}
      </div>
      ${content}
    `;

    hydrateFavicons(el.drawerBody);
    return;
  }

  if (ui.panel === "spaces") {
    if (el.drawerTitle) el.drawerTitle.textContent = "Пространства";
    if (el.drawerKicker) el.drawerKicker.textContent = "наборы вкладок";
    if (el.drawerActions) el.drawerActions.innerHTML = "";

    const spaces = Array.isArray(state.spaces) ? state.spaces : [];
    const openPages = (Array.isArray(state.tabs) ? state.tabs : []).filter((tab) => !tab.isNewTab).length;

    const list = spaces.length
      ? spaces
          .map((space) => {
            const tabs = Array.isArray(space.tabs) ? space.tabs : [];
            return `
              <article class="space-card" style="--space-color:${safeColor(space.color, "#a855f7")}">
                <div class="space-card-head">
                  <span class="space-dot" aria-hidden="true"></span>
                  <input class="space-name-input" data-space-name="${escapeHTML(space.id)}" value="${escapeHTML(space.name)}" maxlength="40" aria-label="Название пространства">
                  <span class="space-card-count">${tabs.length}</span>
                </div>
                <div class="space-card-tabs">
                  ${
                    tabs.length
                      ? tabs
                          .slice(0, 4)
                          .map((tab) => `<span class="space-card-tab">${escapeHTML(tab.title || hostOf(tab.url))}</span>`)
                          .join("")
                      : `<span class="space-card-tab is-empty">Пока пусто</span>`
                  }
                </div>
                <div class="space-card-actions">
                  <button type="button" data-space-open="${escapeHTML(space.id)}">Открыть</button>
                  <button type="button" data-space-update="${escapeHTML(space.id)}">Обновить</button>
                  <button type="button" data-space-delete="${escapeHTML(space.id)}">Удалить</button>
                </div>
              </article>
            `;
          })
          .join("")
      : `
        <div class="drawer-empty">
          <span class="drawer-empty-icon">${icon("space")}</span>
          <b>Пространств пока нет</b>
          <p>Откройте нужные вкладки и сохраните их как пространство — Lumen вернёт их одним нажатием.</p>
        </div>
      `;

    el.drawerBody.innerHTML = `
      <form class="space-create" id="space-create">
        <input class="text-input" id="space-name" type="text" maxlength="40" spellcheck="false" autocomplete="off" placeholder="Название нового пространства" aria-label="Название нового пространства">
        <button class="btn btn--primary" type="submit">${icon("plus")}<span>Сохранить текущие</span></button>
      </form>
      <p class="space-create-hint">${openPages ? `В окне ${openPages} ${plural(openPages, "страница", "страницы", "страниц")}. В пространство попадут все открытые вкладки.` : "Сначала откройте хотя бы одну страницу."}</p>
      <div class="space-list">${list}</div>
    `;
    return;
  }

  if (ui.panel === "notes") {
    if (el.drawerTitle) el.drawerTitle.textContent = "Заметки";
    if (el.drawerKicker) el.drawerKicker.textContent = "локально";
    if (el.drawerActions) el.drawerActions.innerHTML = "";

    const active = state.activeTab;
    const canNote = Boolean(active && !active.isNewTab && /^https?:/i.test(active.url || ""));
    const notes = Array.isArray(state.notes) ? state.notes : [];
    const current = canNote ? notes.find((note) => note.url === active.url) : null;

    const editor = canNote
      ? `
        <section class="note-editor-card">
          <div class="note-context">
            ${faviconMarkup(active, "note-context-favicon")}
            <span>
              <b>${escapeHTML(active.title || domainOf(active.url))}</b>
              <small>${escapeHTML(domainOf(active.url))}</small>
            </span>
          </div>
          <textarea id="note-editor" maxlength="20000" spellcheck="true" placeholder="Что важно запомнить об этой странице?">${escapeHTML(current?.text || "")}</textarea>
          <div class="note-editor-foot">
            <span>${current ? `Изменено ${escapeHTML(recentDateLabel(current.updatedAt))}` : "Заметка сохраняется локально"}</span>
            <button type="button" data-save-note-now>Сохранить</button>
          </div>
        </section>
      `
      : `
        <div class="note-no-page">
          ${icon("note")}
          <span>Откройте страницу, чтобы добавить заметку.</span>
        </div>
      `;

    const list = notes.length
      ? notes
          .map(
            (note) => `
              <article class="note-card${current && current.id === note.id ? " is-current" : ""}">
                <button class="note-card-main" type="button" data-note-url="${escapeHTML(note.url)}" title="Открыть страницу">
                  ${faviconMarkup(note, "note-favicon")}
                  <span class="note-card-copy">
                    <b>${escapeHTML(note.title || domainOf(note.url))}</b>
                    <small>${escapeHTML(note.domain || domainOf(note.url))} · ${escapeHTML(recentDateLabel(note.updatedAt))}</small>
                    <span class="note-card-excerpt">${escapeHTML(String(note.text || "").slice(0, 180))}</span>
                  </span>
                </button>
                <button class="note-card-remove" type="button" data-remove-note="${escapeHTML(note.id)}" aria-label="Удалить заметку" title="Удалить заметку">
                  ${icon("trash")}
                </button>
              </article>
            `
          )
          .join("")
      : `
        <div class="drawer-empty">
          <span class="drawer-empty-icon">${icon("note")}</span>
          <b>Заметок пока нет</b>
          <p>Оставьте заметку к странице — она останется только на этом устройстве.</p>
        </div>
      `;

    el.drawerBody.innerHTML = `
      ${editor}
      <div class="note-list-head">
        <span>Все заметки</span>
        <span>${notes.length}</span>
      </div>
      <div class="note-list">${list}</div>
    `;
    hydrateFavicons(el.drawerBody);
    return;
  }

  if (ui.panel === "shield") {
    if (el.drawerTitle) el.drawerTitle.textContent = "Щит Lumen";
    if (el.drawerKicker) el.drawerKicker.textContent = "приватность";
    if (el.drawerActions) el.drawerActions.innerHTML = "";

    const shield = state.shield || {
      enabled: true,
      sessionBlocked: 0,
      total: 0,
      recent: []
    };
    const recent = Array.isArray(shield.recent) ? shield.recent : [];

    el.drawerBody.innerHTML = `
      <section class="shield-hero${shield.enabled ? " is-on" : ""}">
        <span class="shield-orb">${icon("shield")}</span>
        <div class="shield-hero-copy">
          <span class="eyebrow">${shield.enabled ? "защита включена" : "защита выключена"}</span>
          <h3>${Number(shield.sessionBlocked) || 0} запросов остановлено</h3>
          <p>Lumen Shield блокирует известные аналитические и рекламные домены. Всё считается локально и никуда не отправляется.</p>
        </div>
        <button class="toggle${shield.enabled ? " is-on" : ""}" type="button" data-shield-toggle role="switch" aria-checked="${shield.enabled}" aria-label="Щит Lumen"></button>
      </section>
      <div class="shield-stats">
        <div><span>за сессию</span><b>${Number(shield.sessionBlocked) || 0}</b></div>
        <div><span>всего</span><b>${Number(shield.total) || 0}</b></div>
      </div>
      <div class="shield-section-head">
        <span>Последние остановленные</span>
        <button type="button" data-reset-shield>Сбросить</button>
      </div>
      ${
        recent.length
          ? `<div class="shield-recent">${recent
              .map(
                (item) => `
                  <div class="shield-recent-item">
                    <span class="shield-dot" aria-hidden="true"></span>
                    <b>${escapeHTML(item.host)}</b>
                    <span>${escapeHTML(formatTime(item.at))}</span>
                  </div>
                `
              )
              .join("")}</div>`
          : `<div class="shield-empty">${icon("shield")}<span>Пока чисто. Заблокированные запросы появятся здесь.</span></div>`
      }
    `;
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
   Notes and quiet mode
   ========================================================= */

function currentNoteTarget() {
  const active = state?.activeTab;
  if (!active || active.isNewTab || !/^https?:/i.test(active.url || "")) return null;
  return { url: active.url, title: active.title || active.url };
}

function scheduleNoteSave(text) {
  const target = currentNoteTarget();
  if (!target) return;

  if (ui.noteSaveTimer) clearTimeout(ui.noteSaveTimer);
  ui.noteSaveTimer = setTimeout(() => {
    ui.noteSaveTimer = null;
    api.saveNote({ ...target, text });
  }, 450);
}

function flushNoteSave() {
  if (!ui.noteSaveTimer) return;

  clearTimeout(ui.noteSaveTimer);
  ui.noteSaveTimer = null;

  const editor = document.getElementById("note-editor");
  const target = currentNoteTarget();
  if (editor && target) {
    api.saveNote({ ...target, text: editor.value });
  }
}

function saveNoteNow() {
  const editor = document.getElementById("note-editor");
  const target = currentNoteTarget();
  if (!editor || !target) {
    showToast("Сначала откройте страницу");
    return;
  }

  if (ui.noteSaveTimer) {
    clearTimeout(ui.noteSaveTimer);
    ui.noteSaveTimer = null;
  }

  api.saveNote({ ...target, text: editor.value });
  showToast("Заметка сохранена");
}

function startQuiet(minutes = 25) {
  closeAllOverlays();
  ui.quiet.active = true;
  ui.quiet.minutes = minutes;
  ui.quiet.endsAt = Date.now() + minutes * 60000;
  document.body.classList.add("quiet-mode");
  if (el.quietPill) el.quietPill.hidden = false;

  if (ui.quiet.timer) clearInterval(ui.quiet.timer);
  updateQuietTime();
  ui.quiet.timer = setInterval(updateQuietTime, 1000);
  scheduleBounds();
  showToast(`Тишина на ${minutes} минут`);
}

function updateQuietTime() {
  if (!ui.quiet.active) return;

  const left = Math.max(0, ui.quiet.endsAt - Date.now());
  const minutes = Math.floor(left / 60000);
  const seconds = Math.floor((left % 60000) / 1000);

  if (el.quietTime) {
    el.quietTime.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  if (left <= 0) stopQuiet(true);
}

function stopQuiet(completed = false) {
  if (!ui.quiet.active) return;

  ui.quiet.active = false;
  if (ui.quiet.timer) clearInterval(ui.quiet.timer);
  ui.quiet.timer = null;
  document.body.classList.remove("quiet-mode");
  if (el.quietPill) el.quietPill.hidden = true;
  scheduleBounds();

  if (completed) showToast("Тишина завершена. Хорошая работа.");
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
      id: "designer",
      title: "Редактор интерфейса",
      sub: "Свои цвета, форма и атмосфера",
      icon: "spark",
      run: () => openDesigner()
    },
    {
      id: "layout",
      title: "Компоновка интерфейса",
      sub: "Двигать и масштабировать элементы",
      icon: "move",
      run: () => openLayoutMode()
    },
    {
      id: "spaces",
      title: "Пространства",
      sub: "Наборы вкладок для проектов",
      icon: "space",
      run: () => openPanel("spaces")
    },
    {
      id: "timeline",
      title: "Хроника сессий",
      sub: "Вернуться к целой сессии",
      icon: "history",
      run: () => {
        ui.historyView = "timeline";
        openPanel("history");
      }
    },
    {
      id: "notes",
      title: "Заметки",
      sub: "Локальные заметки к страницам",
      icon: "note",
      run: () => openPanel("notes")
    },
    {
      id: "shield",
      title: "Щит Lumen",
      sub: "Приватность и блокировка трекеров",
      icon: "shield",
      run: () => openPanel("shield")
    },
    {
      id: "quiet",
      title: "Тишина · 25 минут",
      sub: "Скрыть интерфейс и сосредоточиться",
      icon: "moon",
      run: () => startQuiet(25)
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

  ui.paletteItems = items.slice(0, 16);

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

  if (panel === "spaces") {
    requestAnimationFrame(() => {
      const input = el.drawerBody?.querySelector("#space-name");
      if (input) input.focus();
    });
  }
}

function blurOverlayFocus() {
  const active = document.activeElement;
  if (active && active !== document.body && active.closest?.(".overlay, .palette-overlay, .settings-overlay, .designer-overlay")) {
    active.blur();
  }
}

function closeOverlay() {
  if (!ui.panel) return;
  flushNoteSave();
  ui.panel = null;
  if (el.overlay) el.overlay.hidden = true;
  blurOverlayFocus();
  api.setOverlay(false);
}

function closeAllOverlays() {
  const anythingOpen = Boolean(
    ui.panel || ui.paletteOpen || ui.settingsOpen || ui.designerOpen || ui.layoutOpen
  );

  if (ui.layoutOpen) closeLayoutMode();
  flushNoteSave();

  ui.panel = null;
  ui.paletteOpen = false;
  ui.settingsOpen = false;
  ui.designerOpen = false;

  if (el.overlay) el.overlay.hidden = true;
  if (el.paletteOverlay) el.paletteOverlay.hidden = true;
  if (el.settingsOverlay) el.settingsOverlay.hidden = true;
  if (el.designerOverlay) el.designerOverlay.hidden = true;

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

function openDesigner() {
  closeAllOverlays();
  ui.designerOpen = true;
  if (el.designerOverlay) el.designerOverlay.hidden = false;
  renderDesigner();
  api.setOverlay(true);
}

function closeDesigner() {
  if (!ui.designerOpen) return;
  flushAppearancePatch();
  ui.designerOpen = false;
  if (el.designerOverlay) el.designerOverlay.hidden = true;
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

  el.spaces?.addEventListener("click", (event) => {
    const space = event.target.closest("[data-space-open]");
    if (space) {
      closeAllOverlays();
      api.openSpace(space.dataset.spaceOpen);
    }
  });

  el.addSpace?.addEventListener("click", () => openPanel("spaces"));
  el.openShield?.addEventListener("click", () => openPanel("shield"));

  document.addEventListener("click", (event) => {
    const quietStart = event.target.closest("[data-quiet-start]");
    if (quietStart) {
      event.preventDefault();
      startQuiet(25);
      return;
    }

    const quietExit = event.target.closest("[data-quiet-exit]");
    if (quietExit) {
      event.preventDefault();
      stopQuiet(false);
      return;
    }

    const timeline = event.target.closest("[data-open-timeline]");
    if (timeline) {
      event.preventDefault();
      ui.historyView = "timeline";
      openPanel("history");
      return;
    }

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

    const viewButton = event.target.closest("[data-history-view]");
    if (viewButton) {
      ui.historyView = viewButton.dataset.historyView;
      renderDrawer();
      return;
    }

    const openSession = event.target.closest("[data-open-session]");
    if (openSession) {
      const session = ui.timelineSessions[Number(openSession.dataset.openSession)];
      if (session) {
        const urls = session.items.map((item) => item.url).slice(0, 10);
        closeOverlay();
        api.openTabs(urls).then(() =>
          showToast(`Открыто ${urls.length} ${plural(urls.length, "вкладка", "вкладки", "вкладок")}`)
        );
      }
      return;
    }

    const spaceOpen = event.target.closest("[data-space-open]");
    if (spaceOpen) {
      closeOverlay();
      api.openSpace(spaceOpen.dataset.spaceOpen).then(() => showToast("Пространство открыто"));
      return;
    }

    const spaceUpdate = event.target.closest("[data-space-update]");
    if (spaceUpdate) {
      event.stopPropagation();
      api.saveSpace({ id: spaceUpdate.dataset.spaceUpdate, useCurrentTabs: true }).then(() => {
        showToast("Пространство обновлено");
      });
      return;
    }

    const spaceDelete = event.target.closest("[data-space-delete]");
    if (spaceDelete) {
      event.stopPropagation();
      api.deleteSpace(spaceDelete.dataset.spaceDelete);
      showToast("Пространство удалено");
      return;
    }

    const shieldToggle = event.target.closest("[data-shield-toggle]");
    if (shieldToggle) {
      const enabled = state?.shield?.enabled !== false;
      api.updateSettings({ shield: !enabled });
      showToast(enabled ? "Щит выключен" : "Щит включён");
      return;
    }

    if (event.target.closest("[data-reset-shield]")) {
      api.resetShield();
      showToast("Статистика щита сброшена");
      return;
    }

    const removeNote = event.target.closest("[data-remove-note]");
    if (removeNote) {
      event.stopPropagation();
      api.removeNote(removeNote.dataset.removeNote);
      showToast("Заметка удалена");
      return;
    }

    const noteOpen = event.target.closest("[data-note-url]");
    if (noteOpen) {
      closeOverlay();
      api.navigate(noteOpen.dataset.noteUrl);
      return;
    }

    if (event.target.closest("[data-save-note-now]")) {
      saveNoteNow();
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
    if (event.target.id === "note-editor") {
      scheduleNoteSave(event.target.value);
      return;
    }

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

  el.drawerBody?.addEventListener("focusout", (event) => {
    if (event.target.id !== "note-editor") return;
    flushNoteSave();
    setTimeout(() => {
      if (ui.panel === "notes" && document.activeElement?.id !== "note-editor") {
        renderDrawer();
      }
    }, 120);
  });

  el.drawerBody?.addEventListener("change", (event) => {
    const input = event.target.closest("[data-space-name]");
    if (!input) return;

    const name = input.value.trim();
    if (!name) {
      const space = (state.spaces || []).find((item) => item.id === input.dataset.spaceName);
      input.value = space?.name || "Пространство";
      return;
    }

    api.saveSpace({ id: input.dataset.spaceName, name });
  });

  el.drawerBody?.addEventListener("submit", (event) => {
    if (!event.target.closest("#space-create")) return;
    event.preventDefault();

    const input = el.drawerBody.querySelector("#space-name");
    const name = input?.value.trim() || "";
    const openPages = (state.tabs || []).filter((tab) => !tab.isNewTab).length;

    if (!openPages) {
      showToast("Сначала откройте хотя бы одну страницу");
      return;
    }

    api.saveSpace({ name, useCurrentTabs: true }).then(() => {
      showToast("Пространство сохранено");
      const nextInput = el.drawerBody.querySelector("#space-name");
      if (nextInput) nextInput.value = "";
    });
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
    if (event.target.closest("[data-open-designer]")) {
      openDesigner();
      return;
    }

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

  el.designerOverlay?.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-designer]")) closeDesigner();
  });

  el.designerBody?.addEventListener("input", (event) => {
    const color = event.target.closest("[data-color-key]");
    if (color) {
      const key = color.dataset.colorKey;
      const value = normalizeHex(color.value);
      if (value) patchAppearance({ [key]: value });
      return;
    }

    if (event.target.id === "designer-radius") {
      const value = Math.max(0, Math.min(30, Math.round(Number(event.target.value) || 0)));
      const output = el.designerBody.querySelector("[data-radius-value]");
      if (output) output.textContent = `${value}px`;
      patchAppearance({ radius: value });
    }
  });

  el.designerBody?.addEventListener("change", (event) => {
    const color = event.target.closest("[data-color-text]");
    if (color) {
      const key = color.dataset.colorText;
      const raw = color.value.trim();
      if (!raw) {
        patchAppearance({ [key]: "" }, true);
        return;
      }
      const value = normalizeHex(raw);
      if (!value) {
        color.value = currentAppearance()[key] ? currentAppearance()[key].toUpperCase() : "";
        showToast("Цвет нужен в формате #RRGGBB");
        return;
      }
      color.value = value.toUpperCase();
      patchAppearance({ [key]: value }, true);
      return;
    }

    if (event.target.id === "designer-font") {
      patchAppearance({ font: event.target.value }, true);
    }
  });

  el.designerBody?.addEventListener("keydown", (event) => {
    if (event.target.matches("[data-color-text]") && event.key === "Enter") {
      event.preventDefault();
      event.target.blur();
    }
  });

  el.designerBody?.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-designer]")) {
      closeDesigner();
      return;
    }

    if (event.target.closest("[data-reset-designer]")) {
      resetDesigner();
      return;
    }

    if (event.target.closest("[data-open-layout]")) {
      openLayoutMode();
      return;
    }

    const theme = event.target.closest("[data-designer-theme]");
    if (theme) {
      if (state?.settings) {
        state.settings.theme = theme.dataset.designerTheme;
        applySettings();
        syncDesigner();
      }
      updateDesignerSettings({ theme: theme.dataset.designerTheme });
      return;
    }

    const accent = event.target.closest("[data-designer-accent]");
    if (accent) {
      if (state?.settings) {
        state.settings.accent = accent.dataset.designerAccent;
        state.settings.appearance = { ...currentAppearance(), accentColor: "" };
        applySettings();
        syncDesigner();
      }
      updateDesignerSettings({
        accent: accent.dataset.designerAccent,
        appearance: { accentColor: "" }
      });
      return;
    }

    const clear = event.target.closest("[data-clear-color]");
    if (clear) {
      patchAppearance({ [clear.dataset.clearColor]: "" }, true);
      return;
    }

    const density = event.target.closest("[data-density-value]");
    if (density) {
      patchAppearance({ density: density.dataset.densityValue }, true);
      return;
    }

    const pattern = event.target.closest("[data-pattern-value]");
    if (pattern) {
      patchAppearance({ pattern: pattern.dataset.patternValue }, true);
      return;
    }

    const toggle = event.target.closest("[data-designer-toggle]");
    if (!toggle) return;
    const key = toggle.dataset.designerToggle;
    if (toggle.dataset.toggleType === "appearance") {
      patchAppearance({ [key]: !currentAppearance()[key] }, true);
      return;
    }
    const current = state?.settings?.[key] !== false;
    if (state?.settings) {
      state.settings[key] = !current;
      applySettings();
      syncDesigner();
    }
    updateDesignerSettings({ [key]: !current });
  });

  document.addEventListener("keydown", handleGlobalKeydown);
}

function handleGlobalKeydown(event) {
  if (ui.layoutOpen) {
    handleLayoutKeydown(event);
    return;
  }

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
    if (ui.designerOpen) {
      closeDesigner();
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


