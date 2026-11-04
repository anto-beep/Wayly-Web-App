/** @jest-environment jsdom */
import { dedupeHead, dedupePrerenderedHead, observeDedupeHead } from "./dedupeHead";

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

describe("dedupePrerenderedHead + observeDedupeHead (no timing gap)", () => {
    afterEach(() => { document.head.innerHTML = ""; });

    test("dedupePrerenderedHead removes only prerendered copies when a live copy exists", () => {
        setHead(`
      <title data-prerendered="1">Pre</title>
      <title>Live</title>
      <link data-prerendered="1" rel="canonical" href="https://x/a">
      <link rel="canonical" href="https://x/a">
    `);
        dedupePrerenderedHead();
        expect(document.head.querySelectorAll("title").length).toBe(1);
        expect(document.head.querySelector("title").textContent).toBe("Live");
        expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    });

    test("dedupePrerenderedHead never removes a React-managed node or drops to zero", () => {
        setHead(`<title>LiveA</title><title>LiveB</title>`);
        dedupePrerenderedHead();
        expect(document.head.querySelectorAll("title").length).toBe(2); // untouched
        setHead(`<title data-prerendered="1">Only</title>`);
        dedupePrerenderedHead();
        expect(document.head.querySelectorAll("title").length).toBe(1);
    });

    test("observer removes the prerendered copy as soon as a live tag is inserted", async () => {
        setHead(`
      <title data-prerendered="1">Pre</title>
      <meta data-prerendered="1" name="description" content="pre">
      <link data-prerendered="1" rel="canonical" href="https://x/a">
    `);
        const observer = observeDedupeHead();
        expect(document.head.querySelectorAll("title").length).toBe(1);
        // Simulate React 19 hoisting its own copies.
        const t = document.createElement("title"); t.textContent = "Live";
        const m = document.createElement("meta"); m.setAttribute("name", "description"); m.setAttribute("content", "live");
        const c = document.createElement("link"); c.setAttribute("rel", "canonical"); c.setAttribute("href", "https://x/a");
        document.head.append(t, m, c);
        await Promise.resolve(); // MutationObserver callbacks run as microtasks
        await Promise.resolve();
        expect(document.head.querySelectorAll("title").length).toBe(1);
        expect(document.head.querySelector("title").textContent).toBe("Live");
        expect(document.head.querySelectorAll('meta[name="description"]').length).toBe(1);
        expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
        observer.disconnect();
    });
});
