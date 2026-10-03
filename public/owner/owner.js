/* Operator dashboard. All data is rendered with textContent (never innerHTML). */
(function () {
    var app = document.getElementById('app');
    var FONTS = ['', 'Inter', 'Roboto', 'Poppins', 'DM Sans', 'Lato', 'Nunito', 'Open Sans', 'Montserrat', 'Raleway', 'Source Sans 3'];

    function api(path, method, body) {
        return fetch(path, {
            method: method || 'GET', credentials: 'same-origin',
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); });
    }
    function el(tag, attrs, children) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k];
            else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
        });
        (children || []).forEach(function (c) { if (c) e.appendChild(c); });
        return e;
    }
    function clear() { while (app.firstChild) app.removeChild(app.firstChild); }

    // field(name,label,type,value) -> { wrap, input, setError }
    function field(name, label, type, value, hint) {
        var input = type === 'textarea' ? el('textarea', { name: name }) :
            type === 'font' ? el('select', { name: name }, FONTS.map(function (f) { return el('option', { value: f, text: f || '(default)' }); })) :
            el('input', { name: name, type: type || 'text', autocomplete: 'off' });
        input.value = value || '';
        var err = el('div', { class: 'err' });
        var wrap = el('div', {}, [el('label', { text: label }), input, hint ? el('small', { text: hint }) : null, err]);
        return { wrap: wrap, input: input, setError: function (m) { err.textContent = m || ''; } };
    }
    function showErrors(fields, res) {
        Object.keys(fields).forEach(function (k) { fields[k].setError((res.fields && res.fields[k]) || ''); });
    }

    function authView() {
        clear();
        var email = field('email', 'Email', 'email'), pw = field('password', 'Password', 'password', '', 'At least 10 characters.');
        var name = field('name', 'Your name', 'text'), msg = el('div', { class: 'err' });
        var registering = false;
        var title = el('h2', { text: 'Sign in' });
        var btn = el('button', { class: 'primary', text: 'Sign in' });
        var toggle = el('button', { text: 'Create an account' });
        name.wrap.classList.add('hidden');
        function sync() {
            title.textContent = registering ? 'Create your account' : 'Sign in';
            btn.textContent = registering ? 'Create account' : 'Sign in';
            toggle.textContent = registering ? 'I already have an account' : 'Create an account';
            name.wrap.classList.toggle('hidden', !registering);
        }
        toggle.addEventListener('click', function () { registering = !registering; msg.textContent = ''; sync(); });
        btn.addEventListener('click', function () {
            btn.disabled = true; msg.textContent = '';
            api('/api/auth?action=' + (registering ? 'register' : 'login'), 'POST',
                { email: email.input.value, password: pw.input.value, name: name.input.value })
                .then(function (r) { btn.disabled = false; if (r.owner) boot(); else msg.textContent = r.error || 'Could not continue.'; });
        });
        app.appendChild(el('div', { class: 'card' }, [title, name.wrap, email.wrap, pw.wrap, msg, el('div', { class: 'row', style: 'margin-top:12px' }, [btn, toggle])]));
    }

    function siteForm(site, owner) {
        clear();
        var creating = !site, isCustom = site ? site.plan === 'custom' : false, fields = {}, rows = [];
        var root = window.location.hostname.split('.').slice(-2).join('.');

        app.appendChild(el('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' }, [
            el('span', { class: 'muted', text: owner.email }),
            el('button', { text: 'Sign out', onclick: function () { api('/api/auth?action=logout', 'POST').then(boot); } }),
        ]));

        var planBox = null, subF, domF;
        if (creating) {
            var free = el('input', { type: 'radio', name: 'plan', value: 'free', checked: 'checked' });
            var cust = el('input', { type: 'radio', name: 'plan', value: 'custom' });
            subF = field('subdomain', 'Free address', 'text', '', 'Your site will be live at once at <name>.' + root + '. The platform keeps 25% of commission and handles customer support.');
            domF = field('custom_domain', 'Your own domain', 'text', '', 'e.g. trade.yourbrand.com. Needs approval. The platform keeps 15% and you set your own support contacts.');
            domF.wrap.classList.add('hidden');
            var flip = function () { var c = cust.checked; domF.wrap.classList.toggle('hidden', !c); subF.wrap.classList.toggle('hidden', c); isCustom = c; contactBox.classList.toggle('hidden', !c); };
            free.addEventListener('change', flip); cust.addEventListener('change', flip);
            planBox = el('div', { class: 'card' }, [el('h2', { text: 'Choose your address' }),
                el('label', {}, [free, document.createTextNode(' Free address (live immediately)')]),
                el('label', {}, [cust, document.createTextNode(' My own domain (after approval)')]), subF.wrap, domF.wrap]);
            fields.subdomain = subF; fields.custom_domain = domF;
        } else {
            var rate = el('div', { class: 'card' }, [el('h2', { text: 'Your site' }),
                el('div', {}, [el('span', { class: 'pill', text: site.status }), document.createTextNode(' '), el('strong', { text: site.domain })]),
                el('p', { class: 'muted', text: 'Plan: ' + site.plan + '. You receive ' + site.operator_share + '% of commission; the platform keeps ' + site.platform_share + '%.' })]);
            if (site.status === 'pending') rate.appendChild(el('p', { text: 'Waiting for approval. You will be live once your domain is set up.' }));
            app.appendChild(rate);
        }
        if (planBox) app.appendChild(planBox);

        var brand = el('div', { class: 'card' }, [el('h2', { text: 'Branding' })]);
        [['name', 'Site name', 'text'], ['logo_url', 'Logo URL (https://…)', 'text'], ['primary_color', 'Main colour (#rrggbb)', 'text'], ['font', 'Font', 'font'],
         ['about', 'About', 'textarea'], ['vision', 'Vision', 'textarea'], ['mission', 'Mission', 'textarea']].forEach(function (d) {
            var f = field(d[0], d[1], d[2], site ? site[d[0]] : ''); fields[d[0]] = f; brand.appendChild(f.wrap);
        });
        app.appendChild(brand);

        var contactBox = el('div', { class: 'card' }, [el('h2', { text: 'Support contacts' }), el('p', { class: 'muted', text: 'Shown to your clients. Leave blank to hide.' })]);
        [['whatsapp', 'WhatsApp (with country code)', 'text'], ['phone', 'Phone', 'text'], ['support_email', 'Support email', 'email'], ['telegram', 'Telegram username', 'text']].forEach(function (d) {
            var f = field(d[0], d[1], d[2], site ? site[d[0]] : ''); fields[d[0]] = f; contactBox.appendChild(f.wrap);
        });
        contactBox.classList.toggle('hidden', !isCustom);
        app.appendChild(contactBox);

        var msg = el('div', { class: 'ok' }), save = el('button', { class: 'primary', text: creating ? 'Create my site' : 'Save changes' });
        save.addEventListener('click', function () {
            var body = {}; Object.keys(fields).forEach(function (k) { body[k] = fields[k].input.value; });
            if (creating && !isCustom) delete body.custom_domain;
            if (creating && isCustom) delete body.subdomain;
            save.disabled = true; msg.textContent = '';
            api('/api/my-site', creating ? 'POST' : 'PUT', body).then(function (r) {
                save.disabled = false; showErrors(fields, r);
                if (r.site) { msg.textContent = 'Saved.'; if (creating) boot(); } else { msg.className = 'err'; msg.textContent = r.error || ''; }
            });
        });
        app.appendChild(el('div', { class: 'row' }, [save, msg]));

        if (!creating && site.plan === 'free') {
            var d = field('domain', 'Move to your own domain', 'text', site.custom_domain_requested, 'Request approval for your own domain (the platform then keeps 15% instead of 25%).');
            var m2 = el('div', { class: 'muted' });
            var b2 = el('button', { text: 'Request my own domain', onclick: function () {
                api('/api/my-site', 'PUT', { action: 'request_custom_domain', domain: d.input.value }).then(function (r) { m2.textContent = r.site ? 'Request sent.' : (r.error || ''); }); } });
            app.appendChild(el('div', { class: 'card', style: 'margin-top:16px' }, [d.wrap, b2, m2]));
        }
    }

    function boot() {
        api('/api/auth?action=me').then(function (r) {
            if (!r.owner) return authView();
            if (r.owner.role === 'admin') { clear(); app.appendChild(el('p', {}, [el('a', { href: '/admin', text: 'Go to the admin panel' })])); return; }
            api('/api/my-site').then(function (s) { siteForm(s.site, r.owner); });
        });
    }
    boot();
})();
