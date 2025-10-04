// functions/api/feeds.js
export const onRequestGet = async ({ request }) => {
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
          headers: { "user-agent": ua, "accept": "application/rss+xml, application/xml, text/xml, */*" },
          redirect: "follow",
          cf: { cacheTtl: 900, cacheEverything: true },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const parsed = parseFeed(xml, f.url);
        return { source: f.name, ok: true, items: parsed.slice(0, 6) };
      } catch (err) {
        return { source: f.name, ok: false, error: String(err), items: [] };
      }
    })
  );

  const url = new URL(request.url);
  const debug = url.searchParams.get("debug") === "1";

  return new Response(
    JSON.stringify(
      {
        feeds: results.map((r) => (debug ? r : { source: r.source, items: r.items })),
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    }
  );
};

// Very small RSS/Atom parser (regex-based for simplicity)
function parseFeed(xml, url) {
  const isAtom = /<feed[\s>]/i.test(xml) && /<\/feed>/i.test(xml);
  const items = [];

  if (isAtom) {
    // <entry><title>…</title><link href="…"/><updated>…</updated>
    const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
    for (const block of entries) {
      const title = capture(block, /<title[^>]*>([\s\S]*?)<\/title>/i);
      const link = capture(block, /<link[^>]*href="([^"]+)"/i);
      const date = capture(block, /<updated[^>]*>([\s\S]*?)<\/updated>/i);
      items.push({ title, link, date });
    }
  } else {
    // RSS: <item><title>…</title><link>…</link><pubDate>…</pubDate>
    const entries = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    for (const block of entries) {
      const title = capture(block, /<title[^>]*>([\s\S]*?)<\/title>/i);
      const link =
        capture(block, /<link[^>]*>([\s\S]*?)<\/link>/i) || capture(block, /<guid[^>]*>([\s\S]*?)<\/guid>/i);
      const date =
        capture(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
        capture(block, /<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i);
      items.push({ title, link, date });
    }
  }
  return items;

  function capture(str, re) {
    const m = str.match(re);
    if (!m) return "";
    return m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
  }
}
