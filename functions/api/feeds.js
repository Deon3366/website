// functions/api/feeds.js
export const onRequestGet = async ({ request, env, next }) => {
  const FEEDS = [
    // NCSC "News" RSS
    "https://www.ncsc.gov.uk/api/1/services/v1/news.rss",
    // The Register "Security" RSS
    "https://www.theregister.com/security/headlines.atom",
  ];

  // Fetch all feeds in parallel
  const xmls = await Promise.all(
    FEEDS.map(async (url) => {
      const res = await fetch(url, { cf: { cacheTtl: 900, cacheEverything: true } });
      if (!res.ok) throw new Error(`Failed to fetch ${url}`);
      return { url, text: await res.text() };
    })
  );

  // Minimal XML parsing (RSS or Atom) -> {source, items:[{title, link, date}]}
  const parse = (url, xml) => {
    // Detect Atom vs RSS by tag presence
    const isAtom = /<feed[\s>]/i.test(xml) && /<\/feed>/i.test(xml);

    const take = (arr, n = 5) => arr.slice(0, n);

    if (isAtom) {
      // Atom: <entry><title>..</title><link href=".."/><updated>..</updated>
      const entries = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => {
        const block = m[0];
        const t = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [ , "" ])[1]
          .replace(/<!\[CDATA\[|\]\]>/g, "")
          .trim();
        const l = (block.match(/<link[^>]*href="([^"]+)"/i) || [ , "#" ])[1];
        const d = (block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) || [ , "" ])[1];
        return { title: t, link: l, date: d };
      });
      return { source: url, items: take(entries) };
    } else {
      // RSS 2.0: <item><title>..</title><link>..</link><pubDate>..</pubDate>
      const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => {
        const block = m[0];
        const t = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [ , "" ])[1]
          .replace(/<!\[CDATA\[|\]\]>/g, "")
          .trim();
        const l = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [ , "#" ])[1].trim();
        const d = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [ , "" ])[1];
        return { title: t, link: l, date: d };
      });
      return { source: url, items: take(items) };
    }
  };

  const data = xmls.map(({ url, text }) => parse(url, text));

  return new Response(JSON.stringify({ feeds: data }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
  });
};
