/*
 * "You've returned to this before" — browser port of the app's
 * mobile/lib/related.ts (awe-app repo). KEEP THE TWO IN SYNC; the mobile
 * file is the source of truth for thresholds and the stopword list.
 *
 * Runs entirely in this browser: plain token overlap (tf-idf cosine),
 * no model, no network, nothing sent anywhere.
 */
(function () {
  const MIN_SHARED = 2;
  const MIN_SCORE = 0.08;
  const MIN_TOKENS = 5;

  const STOP = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'was', 'were', 'are', 'is',
    'has', 'have', 'had', 'its', 'it', 'not', 'but', 'you', 'your', 'yours',
    'his', 'her', 'hers', 'their', 'they', 'them', 'she', 'he', 'we', 'our',
    'ours', 'me', 'my', 'mine', 'i', 'im', 'ive', 'a', 'an', 'of', 'to', 'in',
    'on', 'at', 'by', 'as', 'or', 'be', 'been', 'being', 'so', 'if', 'then',
    'than', 'too', 'very', 'just', 'still', 'there', 'here', 'where', 'when',
    'what', 'which', 'who', 'how', 'why', 'all', 'any', 'each', 'more', 'most',
    'some', 'such', 'only', 'own', 'same', 'about', 'into', 'over', 'under',
    'again', 'once', 'out', 'off', 'up', 'down', 'from', 'because', 'while',
    'until', 'both', 'few', 'now', 'today', 'one', 'two', 'first', 'never',
    'ever', 'even', 'also', 'back', 'like', 'got', 'get', 'did', 'does', 'do',
    'dont', 'didnt', 'cant', 'couldnt', 'thing', 'things', 'something',
    'someone', 'day', 'time', 'kept', 'keep', 'went', 'going', 'came', 'come',
    'noticed', 'notice', 'noticing', 'moment', 'prompt', 'whole', 'little',
    'small', 'really', 'thought', 'think', 'feel', 'felt', 'feels',
  ]);

  function tokens(text) {
    return text
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w));
  }

  function termFreq(words) {
    const tf = new Map();
    for (const w of words) tf.set(w, (tf.get(w) || 0) + 1);
    return tf;
  }

  function findRelated(target, all, max) {
    max = max || 2;
    const targetWords = tokens(target.body);
    if (targetWords.length < MIN_TOKENS) return [];

    const others = all.filter(
      (r) => r.id !== target.id && tokens(r.body).length >= MIN_TOKENS,
    );
    if (others.length === 0) return [];

    const docs = [target].concat(others).map((r) => ({ r, tf: termFreq(tokens(r.body)) }));
    const n = docs.length;

    const df = new Map();
    for (const d of docs) {
      for (const w of d.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
    }
    const idf = (w) => Math.log(1 + n / (df.get(w) || 1));

    const weight = (tf) => {
      const v = new Map();
      for (const [w, f] of tf) v.set(w, f * idf(w));
      return v;
    };
    const norm = (v) => {
      let s = 0;
      for (const x of v.values()) s += x * x;
      return Math.sqrt(s);
    };

    const tv = weight(docs[0].tf);
    const tn = norm(tv);
    if (tn === 0) return [];

    const scored = [];
    for (const d of docs.slice(1)) {
      let shared = 0;
      let dot = 0;
      const dv = weight(d.tf);
      for (const [w, x] of dv) {
        const y = tv.get(w);
        if (y !== undefined) {
          shared += 1;
          dot += x * y;
        }
      }
      const dn = norm(dv);
      if (shared < MIN_SHARED || dn === 0) continue;
      const score = dot / (tn * dn);
      if (score >= MIN_SCORE) scored.push({ r: d.r, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, max).map((s) => s.r);
  }

  window.AweRelated = { findRelated };
})();
