/* Admin panel. Works only on the platform's own domains and only for role=admin accounts
   (the server enforces both -- this page is just a convenience). Rendered with textContent only. */
(function () {
    var app = document.getElementById('app');
    function api(path, method, body) {
        return fetch(path, { method: method || 'GET', credentials: 'same-origin',
            headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); });
    }
    function el(tag, attrs, kids) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k];
            else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
        });
        (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
        return e;
    }
    function clear() { while (app.firstChild) app.removeChild(app.firstChild); }
    function act(body) { return api('/api/admin', 'POST', body).then(function (r) { if (r.error) alert(r.error); load(); }); }

    function login() {
        clear();
        var email = el('input', { type: 'email', placeholder: 'Admin email', autocomplete: 'username' }), pw = el('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' }), msg = el('div', { class: 'err' });
        var go = el('button', { class: 'primary', text: 'Sign in', onclick: function () {
            api('/api/auth?action=login', 'POST', { email: email.value, password: pw.value }).then(function (r) {
                if (r.owner) load(); else msg.textContent = r.error || 'Could not sign in.'; }); } });
        app.appendChild(el('div', { class: 'card adm-login' }, [el('div', { class: 'adm-mark', text: 'EP' }), el('h2', { text: 'Admin sign in' }), el('p', { class: 'sub', text: 'Executive Prime Markets' }), email, el('div', { style: 'height:10px' }), pw, msg, el('div', { style: 'margin-top:14px' }, [go])]));
    }

    var PALETTE = [['#f5c451', '#ff9f43'], ['#38bdf8', '#8b7bff'], ['#22d39a', '#38bdf8'], ['#ff7a90', '#ffb020'], ['#8b7bff', '#ff7ab6']];
    function avatar(text, i) {
        var c = PALETTE[i % PALETTE.length];
        return el('div', { class: 'adm-av', style: '--c1:' + c[0] + ';--c2:' + c[1], text: (text || '?').trim().charAt(0).toUpperCase() });
    }
    function btn(label, kind, fn) { return el('button', { class: kind, text: label, onclick: fn }); }
    function stat(value, label, color) { return el('div', { class: 'adm-stat', style: '--c:' + color }, [el('b', { text: String(value) }), el('span', { text: label })]); }

    function render(sites, owners, flags) {
        clear();
        app.appendChild(el('div', { class: 'adm-top' }, [
            el('div', { class: 'adm-mark', text: 'EP' }),
            el('div', { class: 'adm-title' }, [el('b', { text: 'Executive Prime Markets' }), el('span', { text: 'Admin' })]),
            el('div', { class: 'adm-grow' }),
            btn('Sign out', 'b-ghost', function () { api('/api/auth?action=logout', 'POST').then(login); })]));

        var count = function (st) { return sites.filter(function (x) { return x.status === st; }).length; };
        app.appendChild(el('div', { class: 'adm-stats' }, [
            stat(sites.length, 'Sites', '#f5c451'), stat(count('active'), 'Active', '#22d39a'),
            stat(count('pending'), 'Waiting for approval', '#ffb020'), stat(owners.length, 'Accounts', '#8b7bff')]));

        var on = !flags || flags.forced_real !== false;
        var sw = el('button', { class: 'adm-switch', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': 'Account label switch', onclick: function () { act({ action: 'set_flag', key: 'forced_real', on: !on }); } });
        app.appendChild(el('div', { class: 'card adm-switch-card' }, [
            el('div', { class: 'adm-switch-text' }, [el('h2', { text: 'Account label' }),
                el('p', { class: 'sub', text: 'Account DOT94283012 is shown as "Real account" while this switch is ON. Switch it OFF and it shows as Demo like the others. The balance is always the true balance.' })]),
            el('span', { class: 'adm-state ' + (on ? 'on' : 'off'), text: on ? 'ON' : 'OFF' }), sw]));

        var siteItems = sites.map(function (s, i) {
            var acts = el('div', { class: 'adm-actions' });
            if (s.status !== 'active') acts.appendChild(btn('✓ Approve', 'b-ok', function () { act({ action: 'set_status', site_id: s.id, status: 'active' }); }));
            if (s.status !== 'suspended') acts.appendChild(btn('⏸ Suspend', 'b-warn', function () { act({ action: 'set_status', site_id: s.id, status: 'suspended' }); }));
            if (s.custom_domain_requested) acts.appendChild(btn('🌐 Approve ' + s.custom_domain_requested, 'b-gold', function () {
                if (confirm('Add ' + s.custom_domain_requested + ' to Vercel and your Deriv redirect list first. Switch the site now?')) act({ action: 'approve_custom', site_id: s.id }); }));
            acts.appendChild(btn('％ Set rate', 'b-info', function () {
                var v = prompt('Platform share % for ' + s.name + ' (blank = plan default)', String(s.platform_share));
                if (v === null) return; act({ action: 'set_rate', site_id: s.id, platform_share: v.trim() === '' ? null : Number(v) }); }));
            acts.appendChild(btn('🗑 Delete', 'b-bad', function () {
                if (confirm('Permanently delete the site "' + s.name + '" (' + s.domain + ')? This cannot be undone.')) act({ action: 'delete_site', site_id: s.id }); }));
            return el('div', { class: 'adm-item' }, [avatar(s.name, i), el('div', { class: 'adm-main' }, [
                el('div', { class: 'adm-name' }, [el('span', { text: s.name }), el('span', { class: 'pill ' + s.status, text: s.status }), el('span', { class: 'pill plan', text: s.plan }), el('span', { class: 'pill share', text: 'You keep ' + s.platform_share + '%' })]),
                el('div', { class: 'adm-meta', text: s.domain + (s.owner_email ? ' · ' + s.owner_email : '') })]), acts]);
        });
        app.appendChild(el('div', { class: 'card' }, [el('h2', { text: 'Sites' }), el('p', { class: 'sub', text: 'Approve, pause or remove a site, and set your share.' }),
            siteItems.length ? el('div', { class: 'adm-list' }, siteItems) : el('p', { class: 'muted', text: 'No sites yet.' })]));

        var ownerItems = owners.map(function (o, i) {
            var acts = el('div', { class: 'adm-actions' });
            if (o.role === 'operator') {
                acts.appendChild(btn(o.disabled ? '▶ Enable' : '⏸ Disable', o.disabled ? 'b-ok' : 'b-warn', function () { act({ action: 'disable_owner', owner_id: o.id, disabled: !o.disabled }); }));
                acts.appendChild(btn('🗑 Delete', 'b-bad', function () {
                    if (confirm('Permanently delete the account ' + o.email + ' AND its site? This cannot be undone.')) act({ action: 'delete_owner', owner_id: o.id }); }));
            }
            var kids = [avatar(o.name || o.email, i + 2), el('div', { class: 'adm-main' }, [
                el('div', { class: 'adm-name' }, [el('span', { text: o.name || o.email }), el('span', { class: 'pill plan', text: o.role }), el('span', { class: 'pill ' + (o.disabled ? 'disabled' : 'active'), text: o.disabled ? 'disabled' : 'active' })]),
                el('div', { class: 'adm-meta', text: o.email })])];
            if (acts.childNodes.length) kids.push(acts);
            return el('div', { class: 'adm-item' }, kids);
        });
        app.appendChild(el('div', { class: 'card' }, [el('h2', { text: 'Accounts' }), el('p', { class: 'sub', text: 'Everyone who can sign in.' }),
            ownerItems.length ? el('div', { class: 'adm-list' }, ownerItems) : el('p', { class: 'muted', text: 'No accounts yet.' })]));
    }

    function load() {
        Promise.all([api('/api/admin?resource=sites'), api('/api/admin?resource=owners'), api('/api/admin?resource=flags')]).then(function (r) {
            if (r[0].__status === 401) return login();
            if (r[0].__status === 403) { clear(); app.appendChild(el('p', { class: 'err', text: 'This account is not an admin.' })); return; }
            if (r[0].__status === 404) { clear(); app.appendChild(el('p', { class: 'err', text: 'Admin is not available on this domain.' })); return; }
            render(r[0].sites || [], r[1].owners || [], r[2]);
        });
    }
    load();
})();
