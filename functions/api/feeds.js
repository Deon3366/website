// functions/api/feeds.js
// Fetch two public feeds and return normalized JSON.
// Supports ?count= (default 6, max 50) and ?debug=1 for error visibility.

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const limit = clampInt(url.searchParams.get("count"), 6, 1, 50);
  const debug = url.searchParams.get("debug") === "1";

  const FEEDS = [
    { name: "BBC — Technology", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
    { name: "The Register — Security", url: "https://www.theregister.com/security/headlines.atom" },
  ];

  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

  const results = await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const res = await fetch(f.url, {
          headers: {
            "user-agent": ua,
            "accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
          },
          redirect: "follow",
          // edge cache for 15 minutes
          cf: { cacheTtl: 900, cacheEverything: true },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const items = parseFeed(xml).slice(0, limit);
        return { source: f.name, ok: true, items };
      } catch (err) {
        return { source: f.name, ok: false, error: String(err), items: [] };
      }
    })
  );

  return new Response(
    JSON.stringify(
      {
        feeds: results.map((r) =>
          debug ? r : { source: r.source, items: r.items } // hide errors unless debug=1
        ),
        generatedAt: new Date().toISOString(),
      },
      null,
      debug ? 2 : 0
    ),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    }
  );
};

// --- helpers ---
function clampInt(value, def, min, max) {
  const n = parseInt(value || `${def}`, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

// Tiny RSS/Atom parser sufficient for titles/links/dates
function parseFeed(xml) {
  const isAtom = /<feed[\s>]/i.test(xml);
  const out = [];

  if (isAtom) {
    const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
    for (const block of entries) {
      out.push({
        title: pick(block, /<title[^>]*>([\s\S]*?)<\/title>/i),
        link: pick(block, /<link[^>]*href="([^"]+)"/i),
        date:
          pick(block, /<updated[^>]*>([\s\S]*?)<\/updated>/i) ||
          pick(block, /<published[^>]*>([\s\S]*?)<\/published>/i),
      });
    }
  } else {
    const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    for (const block of items) {
      out.push({
        title: pick(block, /<title[^>]*>([\s\S]*?)<\/title>/i),
        link:
          pick(block, /<link[^>]*>([\s\S]*?)<\/link>/i) ||
          pick(block, /<guid[^>]*>([\s\S]*?)<\/guid>/i),
        date:
          pick(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
          pick(block, /<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i),
      });
    }
  }
  return out;

  function pick(str, re) {
    const m = str.match(re);
    if (!m) return "";
    return m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  }
}
