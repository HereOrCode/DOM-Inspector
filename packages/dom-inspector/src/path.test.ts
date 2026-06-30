// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getCssSelector, getElementPath, getJSPath, getXPath } from "./path";

describe("path generation", () => {
  it("generates the requested CSS selector, XPath, and JS path shape", () => {
    document.body.innerHTML = `
      <main>
        <div>
          <div>
            <div>first</div>
            <div id="target">second</div>
          </div>
        </div>
      </main>
    `;

    const target = document.querySelector("#target");

    expect(target).toBeInstanceOf(Element);
    expect(getCssSelector(target!)).toBe(
      "body > main > div > div > div:nth-child(2)"
    );
    expect(getXPath(target!)).toBe("/html/body/main/div/div/div[2]");
    expect(getJSPath(target!)).toBe(
      'document.querySelector("body > main > div > div > div:nth-child(2)")'
    );
  });

  it("uses XPath same-tag indexes and CSS element indexes correctly", () => {
    document.body.innerHTML = `
      <section>
        <span>label</span>
        <button id="target">primary</button>
        <button>secondary</button>
      </section>
    `;

    const target = document.querySelector("#target");

    expect(target).toBeInstanceOf(Element);
    expect(getCssSelector(target!)).toBe(
      "body > section > button:nth-child(2)"
    );
    expect(getXPath(target!)).toBe("/html/body/section/button[1]");
    expect(getXPath(target!, { alwaysIncludeIndex: true })).toBe(
      "/html[1]/body[1]/section[1]/button[1]"
    );
  });

  it("does not add nth-child when a different tag sibling exists", () => {
    document.body.innerHTML = `
      <div id="root">
        <main>content</main>
      </div>
      <dom-inspector-overlay></dom-inspector-overlay>
    `;

    const target = document.querySelector("#root");

    expect(target).toBeInstanceOf(Element);
    expect(getCssSelector(target!)).toBe("body > div");
  });

  it("generates a top-level JS path for elements inside open shadow DOM", () => {
    document.body.innerHTML = `
      <section>
        <div id="host"></div>
      </section>
    `;

    const host = document.querySelector("#host");
    expect(host).toBeInstanceOf(Element);

    const shadowRoot = host!.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `
      <button>First</button>
      <button id="target">Second</button>
    `;

    const target = shadowRoot.querySelector("#target");
    expect(target).toBeInstanceOf(Element);

    const path = getElementPath(target!);

    expect(path.rootKind).toBe("shadow");
    expect(path.selector).toBe("button:nth-child(2)");
    expect(path.shadowPath).toHaveLength(1);
    expect(path.shadowPath[0]?.hostSelector).toBe("body > section > div");
    expect(path.jsPath).toBe(
      'document.querySelector("body > section > div").shadowRoot.querySelector("button:nth-child(2)")'
    );
  });

  it("generates a top-level JS path for elements inside same-origin iframes", () => {
    document.body.innerHTML = "<iframe></iframe>";

    const frame = document.querySelector("iframe");
    expect(frame).toBeInstanceOf(HTMLIFrameElement);

    frame!.contentDocument!.body.innerHTML = `
      <main>
        <button id="target">Frame target</button>
      </main>
    `;

    const target = frame!.contentDocument!.querySelector("#target");
    expect(target?.nodeType).toBe(1);

    const path = getElementPath(target!, { rootDocument: document });

    expect(path.rootKind).toBe("iframe");
    expect(path.selector).toBe("body > main > button");
    expect(path.framePath).toHaveLength(1);
    expect(path.framePath[0]?.selector).toBe("body > iframe");
    expect(path.jsPath).toBe(
      'document.querySelector("body > iframe").contentDocument.querySelector("body > main > button")'
    );
  });

  it("generates a top-level JS path for shadow DOM inside same-origin iframes", () => {
    document.body.innerHTML = "<iframe></iframe>";

    const frame = document.querySelector("iframe");
    expect(frame).toBeInstanceOf(HTMLIFrameElement);

    frame!.contentDocument!.body.innerHTML = `
      <main>
        <div id="host"></div>
      </main>
    `;

    const host = frame!.contentDocument!.querySelector("#host");
    expect(host?.nodeType).toBe(1);

    const shadowRoot = host!.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = '<button id="target">Frame shadow target</button>';

    const target = shadowRoot.querySelector("#target");
    expect(target?.nodeType).toBe(1);

    const path = getElementPath(target!, { rootDocument: document });

    expect(path.rootKind).toBe("shadow");
    expect(path.selector).toBe("button");
    expect(path.framePath).toHaveLength(1);
    expect(path.framePath[0]?.selector).toBe("body > iframe");
    expect(path.shadowPath).toHaveLength(1);
    expect(path.shadowPath[0]?.hostSelector).toBe("body > main > div");
    expect(path.jsPath).toBe(
      'document.querySelector("body > iframe").contentDocument.querySelector("body > main > div").shadowRoot.querySelector("button")'
    );
  });
});
