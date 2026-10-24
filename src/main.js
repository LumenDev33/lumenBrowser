/* =========================================================
   Lumen — a calm browser built on Chromium.
   Main process: window, tabs, WebContentsView, state, IPC.
   ========================================================= */

const {
  app,
  BrowserWindow,
  WebContentsView,
  Menu,
  ipcMain,
  shell,
  clipboard,
  session,
  nativeTheme
} = require("electron");
const fs = require("fs");
const path = require("path");

// Optional isolated profile for previews, tests and portable copies.
if (process.env.LUMEN_USER_DATA) {
  app.setPath("userData", path.resolve(process.env.LUMEN_USER_DATA));
}

const NEWTAB = "lumen://newtab";

const SEARCH_ENGINES = {
  chrome: "https://www.google.com/search?q=",
  yandex: "https://yandex.ru/search/?text=",
  duckduckgo: "https://duckduckgo.com/?q="
};

const ACCENTS = ["gold", "mint", "blue", "coral"];
const THEMES = ["dark", "light", "system"];
const DENSITIES = ["compact", "cozy", "airy"];
const UI_FONTS = ["manrope", "unbounded", "lora", "mono"];
const PATTERNS = ["aurora", "mesh", "grid", "dots", "solid"];

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

const DEFAULT_SETTINGS = {
  name: "",
  searchEngine: "duckduckgo",
  theme: "dark",
  accent: "gold",
  showBookmarks: true,
  animations: true,
  appearance: { ...DEFAULT_APPEARANCE }
};

const DEFAULT_BOOKMARKS = [
  {
    id: "bm-github",
    title: "GitHub",
    url: "https://github.com",
    tint: "#f0f0f0",
    createdAt: Date.now()
  },
  {
    id: "bm-mdn",
    title: "MDN",
    url: "https://developer.mozilla.org",
    tint: "#9ec5ff",
    createdAt: Date.now()
  },
  {
    id: "bm-wikipedia",
    title: "Wikipedia",
    url: "https://www.wikipedia.org",
    tint: "#f3d37a",
    createdAt: Date.now()
  },
  {
    id: "bm-youtube",
    title: "YouTube",
    url: "https://www.youtube.com",
    tint: "#ff9e80",
    createdAt: Date.now()
  },
  {
    id: "bm-figma",
    title: "Figma",
    url: "https://www.figma.com",
    tint: "#ffb2c8",
    createdAt: Date.now()
  },
  {
    id: "bm-notion",
    title: "Notion",
    url: "https://www.notion.so",
    tint: "#d7d2c7",
    createdAt: Date.now()
  }
];

const STORE_FILE = path.join(app.getPath("userData"), "lumen-state.json");
const DOWNLOADS_DIR = app.getPath("downloads");

let mainWindow = null;
let tabs = [];
let activeTabId = null;
let tabSequence = 0;
let closedTabs = [];
let overlayOpen = false;
let contentBounds = { x: 318, y: 70, width: 1040, height: 800 };
let saveTimer = null;
let broadcastTimer = null;
let store = {
  settings: { ...DEFAULT_SETTINGS },
  bookmarks: DEFAULT_BOOKMARKS.map((bookmark) => ({ ...bookmark })),
  history: [],
  downloads: [],
  session: null
};

/* ---------- small helpers ---------- */

function nowId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function debounceSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveStoreNow();
  }, 350);
}

function saveStoreNow() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (error) {
    console.error("Could not save Lumen state:", error);
  }
}

function cleanName(value) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
}

function normalizeTheme(value) {
  return THEMES.includes(value) ? value : "dark";
}

function normalizeHexColor(value) {
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

function normalizeAppearance(input) {
  const appearance = { ...DEFAULT_APPEARANCE, ...(input || {}) };
  appearance.accentColor = normalizeHexColor(appearance.accentColor);
  appearance.bgColor = normalizeHexColor(appearance.bgColor);
  appearance.surfaceColor = normalizeHexColor(appearance.surfaceColor);
  appearance.textColor = normalizeHexColor(appearance.textColor);
  appearance.radius = Math.max(0, Math.min(30, Math.round(Number(appearance.radius) || 18)));
  appearance.density = DENSITIES.includes(appearance.density) ? appearance.density : "cozy";
  appearance.font = UI_FONTS.includes(appearance.font) ? appearance.font : "manrope";
  appearance.pattern = PATTERNS.includes(appearance.pattern) ? appearance.pattern : "aurora";
  appearance.glow = appearance.glow !== false;
  appearance.layout = normalizeLayout(appearance.layout);
  return appearance;
}

function normalizeSettings(input) {
  const settings = { ...DEFAULT_SETTINGS, ...(input || {}) };

  // Older builds shipped Google/Bing keys. Keep the stored data useful.
  if (settings.searchEngine === "google" || settings.searchEngine === "bing") {
    settings.searchEngine = "chrome";
  }
  if (!Object.prototype.hasOwnProperty.call(SEARCH_ENGINES, settings.searchEngine)) {
    settings.searchEngine = DEFAULT_SETTINGS.searchEngine;
  }

  settings.name = cleanName(settings.name);
  settings.theme = normalizeTheme(settings.theme);
  settings.accent = ACCENTS.includes(settings.accent) ? settings.accent : "gold";
  settings.showBookmarks = settings.showBookmarks !== false;
  settings.animations = settings.animations !== false;
  settings.appearance = normalizeAppearance(settings.appearance);

  return settings;
}

function loadStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    store = {
      settings: normalizeSettings(parsed.settings),
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      downloads: Array.isArray(parsed.downloads) ? parsed.downloads : [],
      session: parsed.session || null
    };
  } catch (error) {
    console.error("Could not load Lumen state:", error);
  }
}

function getSearchBase() {
  return SEARCH_ENGINES[store.settings.searchEngine] || SEARCH_ENGINES.chrome;
}

function resolvedTheme() {
  const theme = normalizeTheme(store.settings.theme);
  if (theme === "system") return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  return theme;
}

function windowBackgroundColor() {
  const custom = normalizeHexColor(store.settings.appearance?.bgColor);
  if (custom) return custom;
  return resolvedTheme() === "light" ? "#f2eee5" : "#08080a";
}

function pageBackgroundColor() {
  const custom = normalizeHexColor(store.settings.appearance?.surfaceColor);
  if (custom) return custom;
  const background = normalizeHexColor(store.settings.appearance?.bgColor);
  if (background) return background;
  return resolvedTheme() === "light" ? "#f2eee5" : "#0b0b0d";
}

function applyNativeTheme() {
  nativeTheme.themeSource = normalizeTheme(store.settings.theme);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(windowBackgroundColor());
  }
  for (const tab of tabs) {
    if (tab.view) {
      try {
        tab.view.setBackgroundColor(pageBackgroundColor());
      } catch {}
    }
  }
}

function searchUrl(query) {
  return getSearchBase() + encodeURIComponent(query);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeInput(input) {
  const text = String(input || "").trim();
  if (!text) return NEWTAB;
  if (text === "lumen://newtab" || text === "about:newtab") return NEWTAB;

  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    if (/^(https?|file):\/\//i.test(text)) return text;
    if (/^(mailto|tel):/i.test(text)) return text;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
  }

  if (/^localhost(:\d+)?(\/.*)?$/i.test(text)) return `http://${text}`;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(text)) return `http://${text}`;

  const looksLikeDomain =
    /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(text) && !text.includes(" ");

  if (looksLikeDomain) return `https://${text}`;
  return searchUrl(text);
}

function safeTitle(tab) {
  if (!tab) return "Lumen";
  if (tab.isNewTab) return "Новая вкладка";
  return tab.title || hostOf(tab.url) || "Lumen";
}

function publicTab(tab) {
  if (!tab) return null;
  return {
    id: tab.id,
    url: tab.url,
    title: safeTitle(tab),
    favicon: tab.favicon || null,
    loading: Boolean(tab.loading),
    canGoBack: Boolean(tab.canGoBack),
    canGoForward: Boolean(tab.canGoForward),
    isNewTab: Boolean(tab.isNewTab),
    error: tab.error || null
  };
}

function publicState() {
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || null;
  return {
    tabs: tabs.map(publicTab),
    activeTabId,
    activeTab: publicTab(activeTab),
    bookmarks: store.bookmarks,
    history: store.history.slice(0, 120),
    downloads: store.downloads,
    settings: store.settings,
    maximized: mainWindow ? mainWindow.isMaximized() : false,
    canReopen: closedTabs.length > 0
  };
}

function broadcast() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("lumen:state", publicState());
  }, 30);
}

function focusUi(eventName) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.focus();
  if (eventName) mainWindow.webContents.send("lumen:ui-event", eventName);
}

/* ---------- downloads ---------- */

function uniqueDownloadPath(filename) {
  const parsed = path.parse(filename);
  let candidate = path.join(DOWNLOADS_DIR, filename);
  let index = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(DOWNLOADS_DIR, `${parsed.name} (${index})${parsed.ext}`);
    index += 1;
  }

  return candidate;
}

function setupDownloads() {
  session.defaultSession.on("will-download", (_event, item) => {
    const filename = item.getFilename();
    const savePath = uniqueDownloadPath(filename);
    item.setSavePath(savePath);

    const download = {
      id: nowId("dl"),
      filename,
      url: item.getURL(),
      path: savePath,
      state: "progressing",
      received: 0,
      total: item.getTotalBytes(),
      startedAt: Date.now()
    };

    store.downloads.unshift(download);
    store.downloads = store.downloads.slice(0, 40);
    broadcast();
    debounceSave();

    item.on("updated", (_event, state) => {
      download.state = state;
      download.received = item.getReceivedBytes();
      download.total = item.getTotalBytes();
      broadcast();
    });

    item.on("done", (_event, state) => {
      download.state = state;
      download.received = item.getReceivedBytes();
      download.total = item.getTotalBytes();
      download.doneAt = Date.now();
      broadcast();
      debounceSave();
    });
  });
}

/* ---------- tabs & page views ---------- */

function getActiveTab() {
  return tabs.find((tab) => tab.id === activeTabId) || null;
}

function createTab(url = null, options = {}) {
  const tab = {
    id: `tab-${++tabSequence}`,
    url: url || NEWTAB,
    title: "Новая вкладка",
    favicon: null,
    loading: false,
    canGoBack: false,
    canGoForward: false,
    isNewTab: !url,
    error: null,
    view: null,
    lastRecorded: null
  };

  tabs.push(tab);

  if (options.activate !== false) {
    activeTabId = tab.id;
  }

  if (url) {
    loadInTab(tab, url, { silent: options.silent, initial: true });
  }

  if (!options.silent) {
    syncViews();
    broadcast();
  }

  return tab;
}

function ensureView(tab) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  if (tab.view) return tab.view;

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      backgroundThrottling: true
    }
  });

  view.setBackgroundColor(pageBackgroundColor());
  view.setBorderRadius(16);
  view.setBounds(contentBounds);
  view.setVisible(false);

  tab.view = view;
  tab.viewAttached = false;

  const wc = view.webContents;

  wc.setWindowOpenHandler(({ url }) => {
    if (/^(https?|file):/i.test(url)) {
      createTab(url, { activate: true });
    } else if (url) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  wc.on("will-navigate", (event, url) => {
    if (!/^(https?|file):/i.test(url)) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  wc.on("before-input-event", (event, input) => {
    handleShortcut(event, input, "page");
  });

  wc.on("did-start-navigation", (_event, url, isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    tab.url = url;
    tab.isNewTab = false;
    tab.loading = true;
    tab.error = null;
    syncViews();
    broadcast();
  });

  wc.on("did-start-loading", () => {
    tab.loading = true;
    broadcast();
  });

  wc.on("did-stop-loading", () => {
    tab.loading = false;
    updateTabNavigation(tab);
    broadcast();
  });

  wc.on("did-navigate", (_event, url) => {
    tab.url = url;
    tab.isNewTab = false;
    tab.error = null;
    updateTabNavigation(tab);
    broadcast();
  });

  wc.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (!isMainFrame) return;
    tab.url = url;
    updateTabNavigation(tab);
    broadcast();
  });

  wc.on("page-title-updated", (event, title) => {
    event.preventDefault();
    tab.title = title || hostOf(tab.url) || "Без названия";
    broadcast();
  });

  wc.on("page-favicon-updated", (_event, favicons) => {
    if (Array.isArray(favicons) && favicons.length > 0) {
      tab.favicon = favicons[0];
      broadcast();
    }
  });

  wc.on("did-finish-load", () => {
    tab.loading = false;
    tab.error = null;
    updateTabNavigation(tab);
    recordHistory(tab);
    syncViews();
    broadcast();
  });

  wc.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    tab.loading = false;
    tab.error = {
      code: errorCode,
      description: errorDescription,
      url: validatedURL || tab.url
    };
    tab.title = "Не удалось открыть страницу";
    syncViews();
    broadcast();
  });

  wc.on("render-process-gone", () => {
    tab.loading = false;
    tab.error = {
      code: -1,
      description: "Страница перестала отвечать",
      url: tab.url
    };
    tab.title = "Страница недоступна";
    syncViews();
    broadcast();
  });

  wc.on("context-menu", (_event, params) => {
    showPageContextMenu(wc, params);
  });

  return view;
}

function updateTabNavigation(tab) {
  if (!tab.view) {
    tab.canGoBack = false;
    tab.canGoForward = false;
    return;
  }

  const wc = tab.view.webContents;
  const navigation = wc.navigationHistory;
  tab.canGoBack = navigation.canGoBack();
  tab.canGoForward = navigation.canGoForward();
  if (!tab.isNewTab) tab.url = wc.getURL() || tab.url;
}

function loadInTab(tab, input, options = {}) {
  const resolved = normalizeInput(input);

  if (resolved === NEWTAB) {
    goNewTab(tab);
    return;
  }

  if (/^(mailto|tel):/i.test(resolved)) {
    shell.openExternal(resolved).catch(() => {});
    return;
  }

  tab.url = resolved;
  tab.isNewTab = false;
  tab.error = null;
  tab.loading = true;
  tab.title = hostOf(resolved) || "Загрузка...";
  tab.favicon = null;

  const view = ensureView(tab);
  if (!view) return;

  view.webContents.loadURL(resolved).catch(() => {
    // did-fail-load handles the visible error state.
  });

  syncViews();

  if (tab.id === activeTabId && !overlayOpen) {
    view.webContents.focus();
  }

  if (!options.silent) broadcast();
}

function goNewTab(tab) {
  if (!tab) return;

  destroyView(tab);
  tab.isNewTab = true;
  tab.url = NEWTAB;
  tab.title = "Новая вкладка";
  tab.favicon = null;
  tab.loading = false;
  tab.error = null;
  tab.canGoBack = false;
  tab.canGoForward = false;
  syncViews();
  broadcast();
}

function destroyView(tab) {
  if (!tab || !tab.view) return;

  const view = tab.view;
  tab.view = null;

  if (tab.viewAttached) {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.contentView.removeChildView(view);
      }
    } catch {}
    tab.viewAttached = false;
  }

  try {
    view.webContents.close();
  } catch {}
}

function syncViews() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!contentBounds || contentBounds.width < 10 || contentBounds.height < 10) return;

  for (const tab of tabs) {
    if (!tab.view) continue;

    const shouldShow =
      tab.id === activeTabId &&
      !tab.isNewTab &&
      !tab.error &&
      !overlayOpen &&
      !mainWindow.isMinimized();

    if (shouldShow) {
      tab.view.setBounds(contentBounds);
      tab.view.setBorderRadius(16);

      if (!tab.viewAttached) {
        mainWindow.contentView.addChildView(tab.view);
        tab.viewAttached = true;
      }
    } else if (tab.viewAttached) {
      mainWindow.contentView.removeChildView(tab.view);
      tab.viewAttached = false;
    }

    tab.view.setVisible(shouldShow);
  }

  if (typeof mainWindow.webContents.invalidate === "function") {
    mainWindow.webContents.invalidate();
  }
}

function activateTab(id) {
  const tab = tabs.find((item) => item.id === id);
  if (!tab) return;

  activeTabId = id;
  syncViews();
  broadcast();

  if (tab.view && !tab.isNewTab && !tab.error && !overlayOpen) {
    tab.view.webContents.focus();
  }
}

function closeTab(id) {
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;

  const tab = tabs[index];
  if (!tab.isNewTab && tab.url && tab.url !== NEWTAB) {
    closedTabs.push({ url: tab.url, title: safeTitle(tab) });
    closedTabs = closedTabs.slice(-15);
  }

  destroyView(tab);
  tabs.splice(index, 1);

  if (tabs.length === 0) {
    activeTabId = null;
    createTab(null);
    return;
  }

  if (activeTabId === id) {
    const next = tabs[Math.min(index, tabs.length - 1)];
    activeTabId = next.id;
  }

  syncViews();
  broadcast();
}

function reopenClosedTab() {
  const entry = closedTabs.pop();
  if (!entry) return;
  createTab(entry.url, { activate: true });
}

function navigateActive(input) {
  const tab = getActiveTab();
  if (!tab) {
    createTab(null);
    return;
  }
  loadInTab(tab, input);
}

function navigateTab(tabId, input) {
  const tab = tabs.find((item) => item.id === tabId);
  if (!tab) return;
  loadInTab(tab, input);
}

function cycleTab(direction) {
  if (tabs.length < 2) return;
  const index = tabs.findIndex((tab) => tab.id === activeTabId);
  const nextIndex = (index + direction + tabs.length) % tabs.length;
  activateTab(tabs[nextIndex].id);
}

function updateOverlay(open) {
  overlayOpen = Boolean(open);
  syncViews();

  if (!overlayOpen) {
    const tab = getActiveTab();
    if (tab && tab.view && !tab.isNewTab && !tab.error) {
      tab.view.webContents.focus();
    }
  }
}

function recordHistory(tab) {
  if (!tab || tab.isNewTab || !tab.url || tab.url === NEWTAB) return;
  if (!/^(https?|file):/i.test(tab.url)) return;

  if (
    tab.lastRecorded &&
    tab.lastRecorded.url === tab.url &&
    Date.now() - tab.lastRecorded.at < 30000
  ) {
    return;
  }

  tab.lastRecorded = { url: tab.url, at: Date.now() };

  const entry = {
    id: nowId("hist"),
    url: tab.url,
    title: safeTitle(tab),
    favicon: tab.favicon || null,
    visitedAt: Date.now()
  };

  store.history = [entry, ...store.history.filter((item) => item.url !== tab.url)].slice(0, 300);
  debounceSave();
  broadcast();
}

function showPageContextMenu(wc, params) {
  const template = [];

  if (params.linkURL) {
    template.push({
      label: "Открыть в новой вкладке",
      click: () => createTab(params.linkURL, { activate: true })
    });
    template.push({
      label: "Копировать ссылку",
      click: () => clipboard.writeText(params.linkURL)
    });
    template.push({ type: "separator" });
  }

  if (params.selectionText) {
    template.push({ role: "copy", label: "Копировать" });
    template.push({ type: "separator" });
  }

  if (params.isEditable) {
    template.push(
      { role: "cut", label: "Вырезать" },
      { role: "copy", label: "Копировать" },
      { role: "paste", label: "Вставить" },
      { role: "selectAll", label: "Выделить всё" },
      { type: "separator" }
    );
  }

  template.push(
    {
      label: "Назад",
      enabled: wc.navigationHistory.canGoBack(),
      click: () => wc.navigationHistory.goBack()
    },
    {
      label: "Вперёд",
      enabled: wc.navigationHistory.canGoForward(),
      click: () => wc.navigationHistory.goForward()
    },
    {
      label: "Обновить",
      click: () => wc.reload()
    },
    { type: "separator" },
    {
      label: "Инструменты разработчика",
      click: () => wc.openDevTools({ mode: "detach" })
    }
  );

  Menu.buildFromTemplate(template).popup({ window: mainWindow });
}

/* ---------- shortcuts ---------- */

function handleShortcut(event, input, source) {
  if (input.type !== "keyDown") return;

  const modifier = input.control || input.meta;
  const key = String(input.key || "").toLowerCase();
  const shift = input.shift;

  const focused = source === "page";

  if (modifier && key === "t") {
    event.preventDefault();
    if (shift) reopenClosedTab();
    else createTab(null, { activate: true });
    return;
  }

  if (modifier && key === "w") {
    event.preventDefault();
    if (activeTabId) closeTab(activeTabId);
    return;
  }

  if (modifier && key === "r") {
    event.preventDefault();
    const tab = getActiveTab();
    if (tab && tab.view) {
      if (tab.error) loadInTab(tab, tab.error.url || tab.url);
      else tab.view.webContents.reload();
    }
    return;
  }

  if (modifier && key === "tab") {
    event.preventDefault();
    cycleTab(shift ? -1 : 1);
    return;
  }

  if (modifier && key === "l" && focused) {
    event.preventDefault();
    focusUi("focus-address");
    return;
  }

  if (modifier && key === "k" && focused) {
    event.preventDefault();
    focusUi("open-palette");
    return;
  }

  if (modifier && key === "h" && focused) {
    event.preventDefault();
    focusUi("open-history");
    return;
  }

  if (modifier && key === "d" && focused) {
    event.preventDefault();
    focusUi("toggle-bookmark");
    return;
  }

  if (modifier && key === "," && focused) {
    event.preventDefault();
    focusUi("open-settings");
    return;
  }

  if (modifier && shift && key === "i") {
    event.preventDefault();
    const tab = getActiveTab();
    if (tab && tab.view) tab.view.webContents.openDevTools({ mode: "detach" });
    return;
  }

  if (modifier && shift && key === "j") {
    event.preventDefault();
    const tab = getActiveTab();
    if (tab && tab.view) tab.view.webContents.openDevTools({ mode: "detach" });
    return;
  }

  if (key === "f12") {
    event.preventDefault();
    const tab = getActiveTab();
    if (tab && tab.view) tab.view.webContents.openDevTools({ mode: "detach" });
    return;
  }

  if (key === "f5") {
    event.preventDefault();
    const tab = getActiveTab();
    if (tab && tab.view) tab.view.webContents.reload();
    return;
  }

  if (input.alt && key === "arrowleft") {
    event.preventDefault();
    const navigation = getActiveTab()?.view?.webContents.navigationHistory;
    if (navigation?.canGoBack()) navigation.goBack();
    return;
  }

  if (input.alt && key === "arrowright") {
    event.preventDefault();
    const navigation = getActiveTab()?.view?.webContents.navigationHistory;
    if (navigation?.canGoForward()) navigation.goForward();
    return;
  }

  if (modifier && key === "0") {
    event.preventDefault();
    const tab = getActiveTab();
    if (tab && tab.view) tab.view.webContents.setZoomLevel(0);
    return;
  }

  if (modifier && (key === "+" || key === "=")) {
    event.preventDefault();
    const tab = getActiveTab();
    if (tab && tab.view) {
      const wc = tab.view.webContents;
      wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 5));
    }
    return;
  }

  if (modifier && key === "-") {
    event.preventDefault();
    const tab = getActiveTab();
    if (tab && tab.view) {
      const wc = tab.view.webContents;
      wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -5));
    }
    return;
  }

  if (modifier && focused && /^[1-8]$/.test(key)) {
    const index = Number(key) - 1;
    if (tabs[index]) {
      event.preventDefault();
      activateTab(tabs[index].id);
    }
  }
}

/* ---------- session & window ---------- */

function restoreSession() {
  const restored = store.session;

  if (restored && Array.isArray(restored.tabs) && restored.tabs.length > 0) {
    const savedTabs = restored.tabs.slice(0, 14);
    for (const item of savedTabs) {
      createTab(item && item.url ? item.url : null, {
        activate: false,
        silent: true
      });
    }

    const index = Math.max(
      0,
      Math.min(Number(restored.activeIndex) || 0, tabs.length - 1)
    );
    activeTabId = tabs[index] ? tabs[index].id : null;
  } else {
    createTab(null, { activate: true, silent: true });
  }
}

function saveSessionState() {
  if (!tabs.length) return;

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === activeTabId)
  );

  store.session = {
    tabs: tabs.map((tab) => ({
      url: tab.isNewTab ? null : tab.view?.webContents.getURL() || tab.url,
      title: safeTitle(tab)
    })),
    activeIndex
  };

  saveStoreNow();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    resizable: true,
    backgroundColor: windowBackgroundColor(),
    roundedCorners: true,
    autoHideMenuBar: true,
    title: "Lumen",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.webContents.on("before-input-event", (event, input) => {
    handleShortcut(event, input, "ui");
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|file):/i.test(url)) {
      createTab(url, { activate: true });
    } else if (url) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  mainWindow.on("resize", () => {
    syncViews();
  });

  mainWindow.on("maximize", () => broadcast());
  mainWindow.on("unmaximize", () => broadcast());
  mainWindow.on("restore", () => syncViews());

  mainWindow.on("close", () => {
    saveSessionState();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("did-finish-load", () => {
    broadcast();
  });

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  });

  restoreSession();
  mainWindow.loadFile(path.join(__dirname, "ui", "index.html"));
}

/* ---------- IPC ---------- */

function setupIpc() {
  ipcMain.handle("lumen:get-state", () => publicState());

  ipcMain.handle("lumen:new-tab", (_event, url) => {
    const tab = createTab(url || null, { activate: true });
    return publicTab(tab);
  });

  ipcMain.handle("lumen:activate-tab", (_event, id) => {
    activateTab(id);
    return publicState();
  });

  ipcMain.handle("lumen:close-tab", (_event, id) => {
    closeTab(id);
    return publicState();
  });

  ipcMain.handle("lumen:navigate", (_event, payload) => {
    const tabId = payload && payload.tabId;
    const input = payload && payload.input;
    if (tabId) navigateTab(tabId, input);
    else navigateActive(input);
    return publicState();
  });

  ipcMain.handle("lumen:go-newtab", () => {
    const tab = getActiveTab();
    if (tab) goNewTab(tab);
    return publicState();
  });

  ipcMain.handle("lumen:back", () => {
    const tab = getActiveTab();
    const navigation = tab?.view?.webContents.navigationHistory;
    if (navigation?.canGoBack()) navigation.goBack();
    return publicState();
  });

  ipcMain.handle("lumen:forward", () => {
    const tab = getActiveTab();
    const navigation = tab?.view?.webContents.navigationHistory;
    if (navigation?.canGoForward()) navigation.goForward();
    return publicState();
  });

  ipcMain.handle("lumen:reload", () => {
    const tab = getActiveTab();
    if (!tab) return publicState();
    if (tab.error) loadInTab(tab, tab.error.url || tab.url);
    else if (tab.view) tab.view.webContents.reload();
    return publicState();
  });

  ipcMain.handle("lumen:stop", () => {
    const tab = getActiveTab();
    if (tab && tab.view) tab.view.webContents.stop();
    return publicState();
  });

  ipcMain.handle("lumen:reopen-closed", () => {
    reopenClosedTab();
    return publicState();
  });

  ipcMain.handle("lumen:toggle-bookmark", () => {
    const tab = getActiveTab();
    if (!tab || tab.isNewTab) return publicState();

    const url = tab.view?.webContents.getURL() || tab.url;
    if (!/^https?:/i.test(url)) return publicState();

    const existingIndex = store.bookmarks.findIndex((bookmark) => bookmark.url === url);

    if (existingIndex >= 0) {
      store.bookmarks.splice(existingIndex, 1);
    } else {
      store.bookmarks.unshift({
        id: nowId("bm"),
        title: safeTitle(tab),
        url,
        favicon: tab.favicon || null,
        tint: "#f3d37a",
        createdAt: Date.now()
      });
    }

    debounceSave();
    broadcast();
    return publicState();
  });

  ipcMain.handle("lumen:remove-bookmark", (_event, id) => {
    store.bookmarks = store.bookmarks.filter((bookmark) => bookmark.id !== id);
    debounceSave();
    broadcast();
    return publicState();
  });

  ipcMain.handle("lumen:remove-history", (_event, id) => {
    store.history = store.history.filter((item) => item.id !== id);
    debounceSave();
    broadcast();
    return publicState();
  });

  ipcMain.handle("lumen:clear-history", () => {
    store.history = [];
    debounceSave();
    broadcast();
    return publicState();
  });

  ipcMain.handle("lumen:clear-downloads", () => {
    store.downloads = store.downloads.filter((item) => item.state === "progressing");
    debounceSave();
    broadcast();
    return publicState();
  });

  ipcMain.handle("lumen:update-settings", (_event, patch) => {
    if (!patch || typeof patch !== "object") return publicState();

    if (
      typeof patch.searchEngine === "string" &&
      Object.prototype.hasOwnProperty.call(SEARCH_ENGINES, patch.searchEngine)
    ) {
      store.settings.searchEngine = patch.searchEngine;
    }

    if (typeof patch.name === "string") {
      store.settings.name = cleanName(patch.name);
    }

    if (typeof patch.theme === "string" && THEMES.includes(patch.theme)) {
      store.settings.theme = patch.theme;
    }

    if (
      typeof patch.accent === "string" &&
      ACCENTS.includes(patch.accent)
    ) {
      store.settings.accent = patch.accent;
    }

    if (typeof patch.showBookmarks === "boolean") {
      store.settings.showBookmarks = patch.showBookmarks;
    }

    if (typeof patch.animations === "boolean") {
      store.settings.animations = patch.animations;
    }

    if (patch.appearance && typeof patch.appearance === "object") {
      store.settings.appearance = normalizeAppearance({
        ...store.settings.appearance,
        ...patch.appearance
      });
    }

    applyNativeTheme();
    debounceSave();
    broadcast();
    return publicState();
  });

  ipcMain.handle("lumen:open-download", (_event, pathToOpen) => {
    if (typeof pathToOpen === "string" && fs.existsSync(pathToOpen)) {
      shell.openPath(pathToOpen).catch(() => {});
    }
  });

  ipcMain.handle("lumen:show-download", (_event, pathToOpen) => {
    if (typeof pathToOpen === "string" && fs.existsSync(pathToOpen)) {
      shell.showItemInFolder(pathToOpen);
    }
  });

  ipcMain.handle("lumen:open-external", (_event, url) => {
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {});
  });

  ipcMain.on("lumen:content-bounds", (_event, bounds) => {
    if (!bounds || typeof bounds !== "object") return;
    const width = Math.round(Number(bounds.width));
    const height = Math.round(Number(bounds.height));
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    if (width < 20 || height < 20) return;
    contentBounds = {
      x: Math.round(Number(bounds.x) || 0),
      y: Math.round(Number(bounds.y) || 0),
      width,
      height
    };
    syncViews();
  });

  ipcMain.on("lumen:overlay", (_event, open) => {
    updateOverlay(open);
  });

  ipcMain.on("lumen:window", (_event, action) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    if (action === "minimize") mainWindow.minimize();
    if (action === "maximize") {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
    if (action === "close") mainWindow.close();
  });
}

/* ---------- app lifecycle ---------- */

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.setName("Lumen");
  app.setAppUserModelId("com.lumen.browser");

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    loadStore();
    applyNativeTheme();
    setupIpc();
    setupDownloads();

    nativeTheme.on("updated", () => {
      applyNativeTheme();
      broadcast();
    });

    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });

    session.defaultSession.setSpellCheckerLanguages(["ru", "en-US"]);

    try {
      const userAgent = app.userAgentFallback
        .replace(/\sElectron\/[\d.]+/i, "")
        .replace(/\slumen-browser\/[\d.]+/i, "");
      session.defaultSession.setUserAgent(userAgent);
    } catch {}

    app.on("web-contents-created", (_event, contents) => {
      contents.on("will-attach-webview", (event) => event.preventDefault());
    });

    createMainWindow();

    app.on("activate", () => {
      if (!mainWindow) createMainWindow();
    });
  });

  app.on("before-quit", () => {
    saveSessionState();
    saveStoreNow();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
