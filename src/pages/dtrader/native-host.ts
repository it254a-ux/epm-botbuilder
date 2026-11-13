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

/** Gives the template the website's login: it looks for its token in this tab's session storage. */
export function shareSiteLogin(): void {
  try {
    const raw = localStorage.getItem('auth_info');
    if (!raw) return;
    const info = JSON.parse(raw) as { access_token?: string; refresh_token?: string; expires_at?: number };
    if (!info?.access_token) return;
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
