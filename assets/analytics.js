/*
 * Awe Well · first-party analytics (web)
 *
 * Action is knowable; content is sacred. This file can say THAT something
 * happened, never what was written: no entry text, no prompts, no counts
 * or scores derived from words. The /track edge function enforces the same
 * rule with a hard allowlist, so a bug here surfaces as a loud 400 on the
 * server, not a quiet leak.
 *
 * Fire-and-forget: track() never throws, never blocks the page, and goes
 * silent when offline or when anything in here breaks. Losing an event is
 * always better than losing a moment of someone's journal.
 *
 * Web sends exactly two events in v1: app_opened on an authed page load,
 * entry_created after a reflection saves. The server stamps the time; the
 * browser clock is never trusted. Identity comes only from the session JWT
 * in the Authorization header; nothing identifying goes in the body.
 */
(function () {
  'use strict';

  // Same project as app.js; duplicated here so this file stands alone and
  // a blocked or stale copy of either script cannot break the other.
  var SUPABASE_URL = 'https://flhnxekpcvebjzhjvlsu.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_fkWD7iVtNQedsjHUSddfPw_h1WGUpyc';

  // Read off this script's own ?v cache token, so the version can never
  // drift from what index.html actually loaded. Falls back to a value the
  // server's version pattern still accepts.
  var SITE_VERSION = (function () {
    var src = document.currentScript && document.currentScript.src;
    var m = src && src.match(/[?&]v=(\d{1,8})/);
    return m ? 'v' + m[1] : 'v0';
  })();

  // Handed in once by app.js after it creates the shared Supabase client.
  // Never create a second client here: two GoTrue instances race over the
  // same storage key.
  var client = null;

  function init(supabaseClient) {
    client = supabaseClient;
  }

  function send(eventName, token) {
    try {
      fetch(SUPABASE_URL + '/functions/v1/track', {
        method: 'POST',
        // keepalive lets an event survive the tab closing right after save.
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + (token || SUPABASE_ANON_KEY),
        },
        body: JSON.stringify({
          event_name: eventName,
          surface: 'web',
          app_version: SITE_VERSION,
        }),
      }).catch(function () {});
    } catch (e) {
      // Analytics must never take the journal down with it.
    }
  }

  function track(eventName) {
    try {
      if (!client) { send(eventName, null); return; }
      // getSession reads local state, no network round trip. With a live
      // session the JWT rides the Authorization header and the server
      // resolves user_id from it; signed out, the anon key goes instead
      // and the event lands with user_id null.
      client.auth.getSession().then(function (res) {
        var s = res.data && res.data.session;
        send(eventName, (s && s.access_token) || null);
      }, function () {
        send(eventName, null);
      });
    } catch (e) {
      // Same posture as send: swallow everything.
    }
  }

  window.AweAnalytics = { init: init, track: track };
})();
