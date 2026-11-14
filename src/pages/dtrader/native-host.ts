import './dtrader-host.css';
import frameCss from './dtrader-frame.css?inline';
/**
 * Runs Deriv's DTrader (built from dtrader-template, files in public/dtrader-app) in its own frame.
 * A frame keeps DTrader's chart engine completely separate from the Charts page's chart engine (two chart engines
 * in one page clashed and left a chart blank when moving between the two pages). The frame is created once, keeps
 * running while another page is showing (so coming back is instant), and is laid over the Dtrader page's area
 * when that page is open. It signs in with the website's login, account and theme.
 */
const FRAME_ID = 'epm-dtrader-frame';
const SRC = '/dtrader-app/';
const HIDDEN_CSS =
  'position:fixed;left:-99999px;top:0;width:1200px;height:800px;border:0;visibility:hidden;pointer-events:none;';

let loading: Promise<void> | null = null;
let frame: HTMLIFrameElement | null = null;
let host: HTMLElement | null = null;

type TStoreWindow = Window & {
  __epmSwitchAccount?: (id: string) => void;
  __deriv_store?: { ui?: { is_dark_mode_on?: boolean; setDarkMode?: (v: boolean) => void } };
};
const frameWin = (): TStoreWindow | null => (frame?.contentWindow as TStoreWindow | null) ?? null;
const frameDoc = (): Document | null => {
  try {
    return frame?.contentDocument ?? null;
  } catch {
    return null;
  }
};

/** The site's own light/dark choice (the site saves it as 'theme' and puts a class on <body>). */
const siteIsDark = (): boolean => {
  try {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
  } catch {
    /* no saved theme */
  }
  return document.body.classList.contains('theme--dark');
};

/** Tells DTrader's own theme setting before it starts, so it never opens in the wrong theme. */
function seedTheme(): void {
  try {
    const saved = JSON.parse(localStorage.getItem('ui_store') || '{}') || {};
    saved.is_dark_mode_on = siteIsDark();
    localStorage.setItem('ui_store', JSON.stringify(saved));
  } catch {
    /* ignore */
  }
}

/** Keeps the frame's theme (and chart) the same as the site's, now and whenever the site's theme switch is used. */
let themeSyncStarted = false;
function startThemeSync(): void {
  if (themeSyncStarted) return;
  themeSyncStarted = true;
  const apply = () => {
    const doc = frameDoc();
    if (!doc?.body) return;
    const dark = siteIsDark();
    const ui = frameWin()?.__deriv_store?.ui;
    if (ui?.setDarkMode && ui.is_dark_mode_on !== dark) ui.setDarkMode(dark);
    const cls = doc.body.classList;
    if (dark !== cls.contains('theme--dark')) {
      cls.remove('theme--light', 'theme--dark');
      cls.add(dark ? 'theme--dark' : 'theme--light');
    }
    doc.documentElement.classList.toggle('dark', dark);
    doc.documentElement.classList.toggle('light', !dark);
  };
  new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.setInterval(apply, 1500);
}

/** Gives the template the website's login: it looks for its token in this tab's session storage. */
export function shareSiteLogin(): void {
  try {
    const raw = localStorage.getItem('auth_info');
    if (!raw) return;
    const info = JSON.parse(raw) as { access_token?: string; refresh_token?: string; expires_at?: number };
    if (!info?.access_token) return;
    // Open on the account the website is on (Real or Demo), not on whichever account the template picks first.
    const loginid = localStorage.getItem('active_loginid');
    if (loginid) sessionStorage.setItem('active_loginid', loginid);
    // The site keeps the expiry in seconds, the template in milliseconds.
    const expires_at = info.expires_at ? (info.expires_at < 1e12 ? info.expires_at * 1000 : info.expires_at) : null;
    sessionStorage.setItem(
      'auth_info',
      JSON.stringify({ access_token: info.access_token, refresh_token: info.refresh_token, expires_at })
    );
  } catch {
    /* no login to share */
  }
}

/** Puts the frame exactly over the page's area while the Dtrader page is open, and out of sight otherwise. */
let placing = false;
function place(): void {
  if (!frame) return;
  if (!host || !host.isConnected) {
    frame.style.cssText = HIDDEN_CSS;
    return;
  }
  const r = host.getBoundingClientRect();
  frame.style.cssText = `position:fixed;left:${Math.round(r.left)}px;top:${Math.round(r.top)}px;width:${Math.round(
    r.width
  )}px;height:${Math.round(r.height)}px;border:0;z-index:1;background:transparent;`;
}
function startPlacing(): void {
  if (placing) return;
  placing = true;
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      place();
    });
  };
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, true);
  window.setInterval(schedule, 400);
}

let selfRepairAt = 0;
function onFrameReady(): void {
  const doc = frameDoc();
  const win = frameWin();
  if (!doc || !win) return;
  const style = doc.createElement('style');
  style.textContent = frameCss;
  doc.head.appendChild(style);
  // "Transfer" / "Deposit" belong to the website, not to the frame
  doc.addEventListener(
    'click',
    e => {
      const a = (e.target as Element | null)?.closest?.('a');
      const href = a?.getAttribute('href') || '';
      if (/^\/(transfer|cashier)/i.test(href)) {
        e.preventDefault();
        window.location.href = href;
      }
    },
    true
  );
  // self-repair: an old tab asking for a file that no longer exists -> reload once to get the new version
  const heal = (msg: unknown) => {
    const text = String((msg as { message?: string })?.message ?? msg ?? '');
    if (!/ChunkLoadError|Loading chunk|Loading CSS chunk/i.test(text)) return;
    if (Date.now() - selfRepairAt < 60000) return;
    selfRepairAt = Date.now();
    win.location.reload();
  };
  win.addEventListener('error', e => heal(e.error ?? e.message));
  win.addEventListener('unhandledrejection', e => heal(e.reason));
}

function getFrame(): HTMLIFrameElement {
  if (frame && frame.isConnected) return frame;
  const f = document.createElement('iframe');
  f.id = FRAME_ID;
  f.title = 'DTrader';
  f.setAttribute('allow', 'clipboard-write; fullscreen');
  // no top navigation: whatever happens inside the frame, it can never take over the whole tab
  f.setAttribute(
    'sandbox',
    'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals'
  );
  f.style.cssText = HIDDEN_CSS;
  f.src = SRC;
  document.body.appendChild(f);
  frame = f;
  return f;
}

/** Starts DTrader once (safe to call many times, e.g. from the site's tab preloading). */
export function loadDtrader(): Promise<void> {
  if (loading) return loading;
  loading = new Promise<void>(resolve => {
    shareSiteLogin();
    seedTheme();
    startThemeSync();
    startAccountSync();
    startUrlSync();
    startPlacing();
    const f = getFrame();
    f.addEventListener('load', () => {
      onFrameReady();
      place();
      resolve();
    });
    place();
  });
  return loading;
}

/** Shows DTrader over `container` (the page's area). */
export function attachDtrader(container: HTMLElement): void {
  pendingSlug = readSlugFromPath() || pendingSlug;
  host = container;
  if (frame) place();
}

/** Moves DTrader out of sight; it keeps running. */
export function detachDtrader(): void {
  host = null;
  place();
}

/**
 * Follows the website's account switcher: when the site's active account changes, DTrader switches to the
 * same account (no reload), so Real/Demo always match the rest of the site.
 */
let watching = false;
export function startAccountSync(): void {
  if (watching) return;
  watching = true;
  let last = localStorage.getItem('active_loginid');
  window.setInterval(() => {
    const now = localStorage.getItem('active_loginid');
    if (!now || now === last) return;
    last = now;
    try {
      sessionStorage.setItem('active_loginid', now);
    } catch {
      /* ignore */
    }
    frameWin()?.__epmSwitchAccount?.(now);
  }, 500);
}

/**
 * Clean web addresses: /dtrader/rise-fall, /dtrader/accumulators, /dtrader/even-odd, ...
 * The address follows the selected trade type, and opening such an address selects that trade type.
 * (DTrader itself writes long ?chart_type=...&symbol=... addresses; those are not shown.)
 */
const slugOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/^-+|-+$/g, '');

let pendingSlug: string | null = null;
let urlSyncing = false;
const TYPES_SELECTOR = '.derivatives-trader .trade__trade-types';

function readSlugFromPath(): string | null {
  const m =
    window.location.pathname.match(/^\/dtrader\/([a-z-]+)\/?$/i) || window.location.hash.match(/^#dtrader\/([a-z-]+)$/i);
  return m ? m[1].toLowerCase() : null;
}

export function startUrlSync(): void {
  if (urlSyncing) return;
  urlSyncing = true;

  const original = history.replaceState.bind(history);

  window.setInterval(() => {
    if (!document.body.classList.contains('epm-dtrader-active')) return;
    const box = frameDoc()?.querySelector(TYPES_SELECTOR);
    if (!box) return;
    const chips = Array.from(box.querySelectorAll<HTMLButtonElement>('button'));
    if (!chips.length) return;
    const selected = chips.find(c => c.getAttribute('data-state') === 'selected');

    if (pendingSlug) {
      const wanted = chips.find(c => slugOf(c.textContent || '') === pendingSlug);
      pendingSlug = null;
      if (wanted && wanted !== selected) {
        wanted.click();
        return;
      }
    }

    if (!selected) return;
    const slug = slugOf(selected.textContent || '');
    if (!slug) return;
    if (window.location.pathname.startsWith('/dtrader')) {
      const target = `/dtrader/${slug}`;
      if (window.location.pathname !== target || window.location.search || window.location.hash) {
        original(window.history.state, '', target);
      }
    } else {
      // inside the home page's Dtrader tab: keep the site's #hash style
      const target = `${window.location.pathname}#dtrader/${slug}`;
      if (window.location.search || window.location.hash !== `#dtrader/${slug}`) {
        original(window.history.state, '', target);
      }
    }
  }, 250);
}

