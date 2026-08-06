/*
 * Awe Well · web journal (app.awe-well.com)
 *
 * Read-only v1: sign in with Apple (same account as the app) -> entitlement
 * gate (check-entitlement edge fn, fails closed) -> the reading room.
 * All user text is rendered with textContent; nothing is ever innerHTML'd.
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://flhnxekpcvebjzhjvlsu.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_fkWD7iVtNQedsjHUSddfPw_h1WGUpyc';

  // Created inside the guarded boot at the bottom; null until then.
  var client = null;

  var entries = [];        // [{id, createdAt, prompt, body}]
  var selectedId = null;
  var query = '';

  // ---------- tiny DOM helpers ----------
  function $(id) { return document.getElementById(id); }
  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  var VIEWS = ['view-loading', 'view-signedout', 'view-gate', 'view-journal', 'view-compose'];
  function show(id) {
    VIEWS.forEach(function (v) { $(v).hidden = v !== id; });
  }
  function loading(msg) {
    $('loading-msg').textContent = msg || 'One moment';
    show('view-loading');
  }

  function formatDate(iso) {
    var d = new Date(iso);
    var opts = { weekday: 'short', month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) {
      opts = { month: 'short', day: 'numeric', year: 'numeric' };
    }
    return d.toLocaleDateString(undefined, opts);
  }

  // ---------- analytics ----------
  // Counts THAT something happened, never what was written (assets/
  // analytics.js). Guarded so a blocked analytics script cannot break
  // the journal. Web sends two events in v1: app_opened once per authed
  // page load, entry_created after a save.
  var openTracked = false;
  function track(name) {
    if (window.AweAnalytics) window.AweAnalytics.track(name);
  }

  // ---------- auth ----------
  function signIn() {
    client.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: window.location.origin + window.location.pathname },
    }).then(function (res) {
      if (res.error) showSignInError(res.error.message);
    });
  }
  function signOut() {
    client.auth.signOut().finally(function () { show('view-signedout'); });
  }
  function showSignInError(msg) {
    var e = $('signin-error');
    e.textContent = msg;
    e.hidden = false;
  }

  // ---------- gate ----------
  function checkGate() {
    // checkGate can run more than once per load (initial session check plus
    // auth state changes), so the flag, not the call site, enforces "once".
    if (!openTracked) {
      openTracked = true;
      track('app_opened');
    }
    loading('Checking your subscription');
    client.functions.invoke('check-entitlement', { body: {} }).then(function (res) {
      if (res.error) {
        var status = res.error.context && res.error.context.status;
        if (status === 401) { signOut(); return; }
        $('gate-title').textContent = "Can't check right now";
        $('gate-msg').textContent =
          'Something between us and the subscription service is not answering. ' +
          'Nothing is wrong with your account. Try again in a minute.';
        $('btn-retry').hidden = false;
        show('view-gate');
        return;
      }
      if (res.data && res.data.active) {
        loadJournal();
      } else {
        $('gate-title').textContent = "You're signed in";
        $('gate-msg').textContent =
          'The journal on the web comes with the Awe Well subscription, ' +
          'which lives in the app. Your words are safe and waiting.';
        $('btn-retry').hidden = true;
        show('view-gate');
      }
    });
  }

  // ---------- journal ----------
  function loadJournal() {
    loading('Opening your journal');
    client
      .from('reflections')
      .select('id, prompt, body, created_at')
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) {
          $('gate-title').textContent = "Can't open the journal right now";
          $('gate-msg').textContent = res.error.message;
          $('btn-retry').hidden = false;
          show('view-gate');
          return;
        }
        entries = (res.data || []).map(function (r) {
          return { id: r.id, createdAt: r.created_at, prompt: r.prompt, body: r.body };
        });
        selectedId = entries.length ? entries[0].id : null;
        renderList();
        renderEntry();
        show('view-journal');
      });
  }

  function visible() {
    var q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(function (r) {
      return (r.prompt + ' ' + r.body).toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderList() {
    var rows = $('rows');
    rows.textContent = '';
    var list = visible();
    var empty = $('list-empty');
    if (entries.length === 0) {
      empty.textContent = "No reflections yet. They're written in the app.";
      empty.hidden = false;
    } else if (list.length === 0) {
      empty.textContent = 'Nothing in your journal matches that search.';
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }
    list.forEach(function (r) {
      var b = el('button', 'row' + (r.id === selectedId ? ' sel' : ''));
      b.setAttribute('role', 'listitem');
      b.appendChild(el('span', 'd', formatDate(r.createdAt)));
      b.appendChild(el('span', 's', r.body));
      b.addEventListener('click', function () { select(r.id, true); });
      rows.appendChild(b);
    });
  }

  function select(id, openPane) {
    selectedId = id;
    renderList();
    renderEntry();
    if (openPane) document.querySelector('.room').classList.add('reading');
    $('read-pane').scrollTop = 0;
  }

  function renderEntry() {
    var box = $('entry');
    box.textContent = '';
    var r = null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === selectedId) { r = entries[i]; break; }
    }
    if (!r) return;

    box.appendChild(el('div', 'edate', formatDate(r.createdAt)));
    if (r.prompt) {
      var pb = el('div', 'promptbox');
      pb.appendChild(el('span', 'sp', '✦'));
      pb.appendChild(el('p', null, r.prompt));
      box.appendChild(pb);
    }
    box.appendChild(el('div', 'ebody', r.body));

    // On-device resurfacing, same scorer as the app. Searches the whole
    // journal, not the filtered view, so a search never hides a return.
    var related = window.AweRelated.findRelated(r, entries);
    if (related.length > 0) {
      var s = el('div', 'surface');
      var h = el('h2', null, "You've returned to this before");
      s.appendChild(h);
      s.appendChild(el('p', 'why', 'Found in this browser, from the words alone.'));
      related.forEach(function (m) {
        var ex = el('button', 'excerpt');
        ex.appendChild(el('span', 'd', formatDate(m.createdAt)));
        ex.appendChild(el('span', 't', m.body));
        ex.addEventListener('click', function () { select(m.id, true); });
        s.appendChild(ex);
      });
      box.appendChild(s);
    }

    var wf = el('p', 'writefrom');
    var wfb = el('button', 'linkish', 'Write from this');
    wfb.addEventListener('click', function () {
      startEditor({ kind: 'entry', r: r });
    });
    wf.appendChild(wfb);
    box.appendChild(wf);
  }

  // ---------- writing room ----------
  // Three doors, all landing in the same editor: a saved invitation from
  // the bank (retired on save, same as the app), a past entry to write
  // from (the deepening move), or an open page.
  var composeFrom = null;
  var composeDirty = false;

  function openCompose() {
    composeFrom = null;
    composeDirty = false;
    $('compose-body').value = '';
    $('compose-editor').hidden = true;
    $('compose-doors').hidden = false;
    show('view-compose');
    client
      .from('saved_prompts')
      .select('id, text, source')
      .order('saved_at', { ascending: false })
      .then(function (res) {
        var list = $('door-saved-list');
        list.textContent = '';
        var rows = res.data || [];
        $('door-saved-head').hidden = rows.length === 0;
        rows.forEach(function (sp) {
          var d = el('button', 'door');
          d.appendChild(el('span', 'door-top', sp.text));
          d.appendChild(el('span', 'door-sub', sp.source || 'saved for later'));
          d.addEventListener('click', function () {
            startEditor({ kind: 'saved', sp: sp });
          });
          list.appendChild(d);
        });
      });
  }

  function startEditor(from) {
    composeFrom = from;
    var ctx = $('compose-context');
    ctx.textContent = '';
    if (from.kind === 'saved') {
      var pb = el('div', 'promptbox');
      pb.appendChild(el('span', 'sp', '✦'));
      pb.appendChild(el('p', null, from.sp.text));
      ctx.appendChild(pb);
    } else if (from.kind === 'entry') {
      ctx.appendChild(el('div', 'edate', formatDate(from.r.createdAt)));
      if (from.r.prompt) {
        var pb2 = el('div', 'promptbox');
        pb2.appendChild(el('span', 'sp', '✦'));
        pb2.appendChild(el('p', null, from.r.prompt));
        ctx.appendChild(pb2);
      }
      var o = el('div', 'origin-entry');
      o.appendChild(el('div', 'origin-body', from.r.body));
      ctx.appendChild(o);
    }
    $('compose-doors').hidden = true;
    $('compose-editor').hidden = false;
    $('compose-hint').textContent = '⌘↩ saves';
    show('view-compose');
    setTimeout(function () { $('compose-body').focus(); }, 50);
  }

  function leaveCompose() {
    if (composeDirty && $('compose-body').value.trim()) {
      if (!window.confirm('Discard this reflection? It has not been saved.')) {
        return;
      }
    }
    composeDirty = false;
    $('compose-body').value = '';
    show('view-journal');
  }

  function saveReflection() {
    var body = $('compose-body').value.trim();
    if (!body) return;
    var prompt = '';
    if (composeFrom && composeFrom.kind === 'saved') prompt = composeFrom.sp.text;
    if (composeFrom && composeFrom.kind === 'entry') prompt = composeFrom.r.prompt || '';
    $('btn-save-reflection').disabled = true;
    client
      .from('reflections')
      .insert({ prompt: prompt, body: body })
      .select('id, prompt, body, created_at')
      .single()
      .then(function (res) {
        $('btn-save-reflection').disabled = false;
        if (res.error) {
          $('compose-hint').textContent = 'Could not save: ' + res.error.message;
          return;
        }
        composeDirty = false;
        $('compose-body').value = '';
        track('entry_created');
        // Written from a saved invitation -> it retires from the bank,
        // exactly as the app does.
        if (composeFrom && composeFrom.kind === 'saved') {
          client.from('saved_prompts').delete().eq('id', composeFrom.sp.id)
            .then(function () {});
        }
        var r = res.data;
        entries.unshift({ id: r.id, createdAt: r.created_at, prompt: r.prompt, body: r.body });
        selectedId = r.id;
        renderList();
        renderEntry();
        show('view-journal');
      });
  }

  // ---------- boot ----------
  // The 4s fallback arms before anything that can throw: the loading screen
  // must never strand anyone. If the session check hasn't answered by then,
  // fall through to sign-in; a signed-in person just lands back in their
  // session when they click the button.
  loading();
  setTimeout(function () {
    if (!$('view-loading').hidden) show('view-signedout');
  }, 4000);

  try {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // Analytics borrows this client for the session JWT; it never makes
    // its own. Guarded: a blocked analytics.js must not reach the catch
    // below and scare anyone off sign-in.
    if (window.AweAnalytics) window.AweAnalytics.init(client);
  } catch (e) {
    show('view-signedout');
    showSignInError(
      'This browser blocked part of the page (often a privacy extension). ' +
      'Sign-in may not work until it is allowed. (' + (e && e.message) + ')',
    );
  }

  try {
    $('btn-signin').addEventListener('click', signIn);
    $('btn-signout').addEventListener('click', signOut);
    $('btn-signout-gate').addEventListener('click', signOut);
    $('btn-retry').addEventListener('click', checkGate);
    $('search').addEventListener('input', function (e) {
      query = e.target.value;
      renderList();
    });
    $('btn-back').addEventListener('click', function () {
      document.querySelector('.room').classList.remove('reading');
    });
    $('btn-write').addEventListener('click', openCompose);
    $('btn-compose-back').addEventListener('click', leaveCompose);
    $('door-open').addEventListener('click', function () {
      startEditor({ kind: 'open' });
    });
    $('btn-save-reflection').addEventListener('click', saveReflection);
    $('compose-body').addEventListener('input', function () {
      composeDirty = true;
    });
    $('compose-body').addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveReflection();
    });
    window.addEventListener('beforeunload', function (e) {
      if (!$('view-compose').hidden && composeDirty && $('compose-body').value.trim()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    window.addEventListener('resize', fitBack);
    fitBack();
    // Surface an OAuth error bounced back in the URL, if any.
    var params = new URLSearchParams(window.location.search);
    if (params.get('error_description')) {
      showSignInError(params.get('error_description'));
    }
  } catch (e) {
    // Wiring failure leaves the page readable; sign-in may be degraded.
  }

  // Show the back link only on narrow screens (CSS swaps panes there).
  function fitBack() {
    $('btn-back').hidden = window.innerWidth > 820;
  }

  if (client) {
    try {
      client.auth.onAuthStateChange(function (_event, session) {
        if (session) checkGate();
        else show('view-signedout');
      });
      client.auth.getSession().then(function (res) {
        if (res.data && res.data.session) checkGate();
        else show('view-signedout');
      }, function () {
        show('view-signedout');
      });
    } catch (e) {
      show('view-signedout');
    }
  }
})();
