/** @jest-environment jsdom */
import { dedupeHead } from "./dedupeHead";

function setHead(html) {
    document.head.innerHTML = html;
}

describe("dedupeHead (SEO-1.1.1 runtime de-duplication)", () => {
    afterEach(() => { document.head.innerHTML = ""; });

    test("removes the prerendered duplicate, keeps the React-managed copy", () => {
        setHead(`
      <title data-prerendered="1">Old Prerendered</title>
      <title>Live React</title>
      <meta data-prerendered="1" name="description" content="pre">
      <meta name="description" content="live">
      <link data-prerendered="1" rel="canonical" href="https://x/a">
      <link rel="canonical" href="https://x/a">
    `);
        dedupeHead();
        const titles = document.head.querySelectorAll("title");
        const descs = document.head.querySelectorAll('meta[name="description"]');
        const canon = document.head.querySelectorAll('link[rel="canonical"]');
        expect(titles.length).toBe(1);
        expect(descs.length).toBe(1);
        expect(canon.length).toBe(1);
        // keeps the live (non-prerendered) one
        expect(titles[0].textContent).toBe("Live React");
        expect(titles[0].hasAttribute("data-prerendered")).toBe(false);
        expect(descs[0].getAttribute("content")).toBe("live");
    });

    test("keeps the prerendered tag when it is the only copy (never drops to zero)", () => {
        setHead(`<title data-prerendered="1">Only Copy</title>`);
        dedupeHead();
        const titles = document.head.querySelectorAll("title");
        expect(titles.length).toBe(1);
        expect(titles[0].textContent).toBe("Only Copy");
    });

    test("collapses exact-duplicate JSON-LD blocks but keeps distinct ones", () => {
        setHead(`
      <script type="application/ld+json">{"@type":"Organization","name":"Wayly"}</script>
      <script type="application/ld+json">{"@type":"Organization","name":"Wayly"}</script>
      <script type="application/ld+json">{"@type":"WebSite","name":"Wayly"}</script>
    `);
        dedupeHead();
        const ld = document.querySelectorAll('script[type="application/ld+json"]');
        expect(ld.length).toBe(2); // one Organization + one WebSite
    });

    test("no-op when everything is already single", () => {
        setHead(`<title>One</title><meta name="description" content="d">`);
        dedupeHead();
        expect(document.head.querySelectorAll("title").length).toBe(1);
        expect(document.head.querySelectorAll('meta[name="description"]').length).toBe(1);
    });
});
