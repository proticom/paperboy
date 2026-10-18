const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { parseHTML } = require("linkedom");

const background = fs.readFileSync(path.join(__dirname, "../background.js"), "utf8");
const injected = background.slice(background.indexOf("function installPaperboySerializerInPage"), background.indexOf("// Translate Chrome"));

for (const native of [false, true, "includes-closed", "throws", "ignores-options", "missing-installer"]) {
  for (const action of ["capture", "pick"]) {
    test(`${action} serializes nested open roots (${native || "fallback"})`, async () => {
      const { window, document } = parseHTML('<html><head><title>Example</title></head><body><article><x-example></x-example><x-private></x-private></article></body></html>');
      const host = document.querySelector("x-example");
      const open = host.attachShadow({ mode: "open" });
      // linkedom omits ShadowRoot.mode, which is present in browsers.
      Object.defineProperty(open, "mode", { value: "open" });
      open.innerHTML = '<x-code></x-code>';
      const inner = open.querySelector("x-code").attachShadow({ mode: "open" });
      Object.defineProperty(inner, "mode", { value: "open" });
      inner.innerHTML = '<pre class="language-js"><code>first();\n  second();</code></pre>';
      document.querySelector("x-private").attachShadow({ mode: "closed" }).innerHTML = "<pre>secret</pre>";
      const nativeCalls = [];
      if (native && native !== "missing-installer") {
        window.Element.prototype.getHTML = function(options) {
          nativeCalls.push(options);
          if (native === "throws") throw new Error("Unsupported options");
          if (native === "ignores-options") return this.innerHTML;
          if (native === true) return '<template shadowrootmode="open"><x-code><template shadowrootmode="open"><pre class="language-js"><code>first();\n  second();</code></pre></template></x-code></template>';
          return '<x-example><template shadowrootmode="open"><x-code><template shadowrootmode="open"><pre class="language-js"><code>first();\n  second();</code></pre></template></x-code><x-private><template shadowrootmode="closed"><pre>secret</pre></template></x-private></template></x-example>';
        };
      }
      const messages = [];
      const article = document.querySelector("article");
      window.Element.prototype.getBoundingClientRect = () => ({ top: 10, left: 10, width: 500, height: 300 });
      document.elementFromPoint = () => article;
      const pageWindow = {
        location: { href: "https://example.org/" },
        innerWidth: 1000, innerHeight: 800,
        getComputedStyle: () => ({ overflowY: "visible", overflowX: "visible" }),
        addEventListener() {}, removeEventListener() {},
      };
      const context = vm.createContext({ document, window: pageWindow, Node: window.Node,
        chrome: { runtime: { sendMessage: (message) => messages.push(message) } },
        setTimeout: (callback) => callback(),
      });
      vm.runInContext(injected, context);
      if (native !== "missing-installer") {
        context.installPaperboySerializerInPage();
        context.installPaperboySerializerInPage();
      }
      let payload;
      if (action === "capture") payload = await context.capturePageInPage();
      else {
        context.startPickerInPage();
        document.dispatchEvent(new window.Event("mousemove"));
        document.dispatchEvent(new window.Event("click", { cancelable: true }));
        const enter = new window.Event("keydown", { cancelable: true });
        enter.key = "Enter";
        document.dispatchEvent(enter);
        assert.equal(messages.length, 1);
        assert.equal(messages[0].type, "paperboy:region-picked");
        payload = messages[0].data;
        assert.equal(payload.regionCount, 1);
      }
      if (native === "missing-installer") {
        assert.equal(payload.html, action === "capture" ? document.documentElement.outerHTML : article.outerHTML);
      } else {
        assert.match(payload.html, /<template shadowrootmode="open">/);
        assert.match(payload.html, /first\(\);\n  second\(\);/);
      }
      assert.equal(payload.html.includes("secret"), false);
      assert.equal(payload.html.includes('shadowrootmode="closed"'), false);
      assert.equal(host.innerHTML, "");
      assert.equal(inner.querySelector("code").textContent, "first();\n  second();");
      if (native && native !== "missing-installer") {
        assert.equal(nativeCalls.length, 1);
        assert.equal(nativeCalls[0].serializableShadowRoots, true);
        assert.deepEqual([...nativeCalls[0].shadowRoots], [open, inner]);
        delete window.Element.prototype.getHTML;
      }
    });
  }
}

for (const action of ["captureActiveTab", "startPickerOnActiveTab"]) {
  test(`${action} installs serialization before injecting the action`, async () => {
    const calls = [];
    const listener = { addListener() {} };
    const context = vm.createContext({ chrome: {
      runtime: { onInstalled: listener, onStartup: listener, onMessage: listener },
      tabs: { query: async () => [{ id: 7 }] },
      scripting: { executeScript: async ({ target, func }) => {
        calls.push({ tabId: target.tabId, functionName: func.name });
        return [{ result: { html: "<main>Example</main>" } }];
      } },
    } });
    vm.runInContext(background, context);
    const result = await context[action]();
    assert.deepEqual(calls, [
      { tabId: 7, functionName: "installPaperboySerializerInPage" },
      { tabId: 7, functionName: action === "captureActiveTab" ? "capturePageInPage" : "startPickerInPage" },
    ]);
    assert.equal(JSON.stringify(result), action === "captureActiveTab"
      ? '{"ok":true,"data":{"html":"<main>Example</main>"}}' : '{"ok":true}');
  });
}
