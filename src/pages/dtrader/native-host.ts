import './dtrader-host.css';
/**
 * Runs Deriv's DTrader (built from dtrader-template, files in public/dtrader-app) inside the site's own page,
 * with no iframe. It signs in with the website's login, and stays loaded after the first visit so coming
 * back to it is instant.
 */
const ASSET_BASE = '/dtrader-app/';
const HOLDER_ID = 'epm-dtrader-holder';
const ROOT_ID = 'derivatives_trader';

let loading: Promise<void> | null = null;
let themeSyncStarted = false;

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

/**
 * Keeps DTrader (and its chart) in the site's theme, both when it opens and whenever the site's theme switch is used.
 * DTrader writes the same <body> theme classes as the site, so the site's saved choice is always the one that wins.
 */
function startThemeSync(): void {
  if (themeSyncStarted) return;
  themeSyncStarted = true;
  const apply = () => {
    const dark = siteIsDark();
    const ui = (window as unknown as { __deriv_store?: { ui?: { is_dark_mode_on?: boolean; setDarkMode?: (v: boolean) => void } } })
      .__deriv_store?.ui;
    if (ui?.setDarkMode && ui.is_dark_mode_on !== dark) ui.setDarkMode(dark);
    const cls = document.body.classList;
    if (dark !== cls.contains('theme--dark')) {
      cls.remove('theme--light', 'theme--dark');
      cls.add(dark ? 'theme--dark' : 'theme--light');
    }
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
  };
  new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.setInterval(apply, 1500);
  apply();
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

/** A hidden place that keeps DTrader alive while another tab is showing. */
function getHolder(): HTMLElement {
  let holder = document.getElementById(HOLDER_ID);
  if (!holder) {
    holder = document.createElement('div');
    holder.id = HOLDER_ID;
    holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:1200px;height:800px;overflow:hidden;visibility:hidden;';
    document.body.appendChild(holder);
  }
  return holder;
}

function getRoot(): HTMLElement {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'derivatives-trader';
    root.style.cssText = 'height:100%;width:100%;';
    getHolder().appendChild(root);
  }
  return root;
}

const addCss = (href: string) =>
  new Promise<void>(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });

const addScript = (src: string) =>
  new Promise<void>(resolve => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.body.appendChild(s);
  });

/** Starts DTrader once (safe to call many times, e.g. from the site's tab preloading). */
export function loadDtrader(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    shareSiteLogin();
    startAccountSync();
    seedTheme();
    startThemeSync();
    getRoot();
    const html = await (await fetch(ASSET_BASE)).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const abs = (u: string) => (u.startsWith('http') || u.startsWith('/') ? u : ASSET_BASE + u);
    const styles = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map(l => abs(l.getAttribute('href') || ''));
    const scripts = Array.from(doc.querySelectorAll('script[src]')).map(s => abs(s.getAttribute('src') || ''));
    await Promise.all(styles.filter(Boolean).map(addCss));
    for (const src of scripts.filter(Boolean)) await addScript(src);
  })().catch(err => {
    loading = null;
    throw err;
  });
  return loading;
}

/** Shows DTrader inside `container` (the page's frame). */
export function attachDtrader(container: HTMLElement): void {
  container.appendChild(getRoot());
}

/** Puts DTrader back in the hidden holder so it keeps running. */
export function detachDtrader(): void {
  const root = document.getElementById(ROOT_ID);
  if (root) getHolder().appendChild(root);
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
    (window as unknown as { __epmSwitchAccount?: (id: string) => void }).__epmSwitchAccount?.(now);
  }, 500);
}
