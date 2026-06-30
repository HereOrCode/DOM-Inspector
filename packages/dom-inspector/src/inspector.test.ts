// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDOMInspector,
  type DOMInspectResult,
  type DOMInspector,
  type DOMInspectorOptions
} from "./inspector";

describe("DOM inspector scope selection", () => {
  const inspectors: DOMInspector[] = [];

  beforeEach(() => {
    const getComputedStyle = window.getComputedStyle.bind(window);

    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element: Element, pseudoElement?: string | null) => {
        if (pseudoElement) {
          return {
            content: "none",
            display: "none",
            visibility: "visible"
          } as CSSStyleDeclaration;
        }

        return getComputedStyle(element);
      }
    );
  });

  afterEach(() => {
    for (const inspector of inspectors) {
      inspector.destroy();
    }

    inspectors.length = 0;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("expands the selected scope with Alt plus wheel up", () => {
    const { button, target } = setupNestedTarget();
    let selected: DOMInspectResult | null = null;
    const hovered: DOMInspectResult[] = [];

    const inspector = createTestInspector(inspectors, {
      document,
      highlight: false,
      onHover: (result) => hovered.push(result),
      onSelect: (result) => {
        selected = result;
      }
    });

    inspector.start();
    dispatchMouseMove(target);

    const wheelEvent = dispatchWheel(target, {
      altKey: true,
      deltaY: -100
    });

    dispatchMouseMove(target);
    dispatchClick(target);

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(hovered.at(-1)?.element).toBe(button);
    const selectedResult = expectSelected(selected);

    expect(selectedResult.element).toBe(button);
    expect(selectedResult.selector).toBe("body > main > section > button");
  });

  it("shrinks the selected scope with Alt plus wheel down", () => {
    const { button, section, target } = setupNestedTarget();
    const hovered: DOMInspectResult[] = [];

    const inspector = createTestInspector(inspectors, {
      document,
      highlight: false,
      autoStop: false,
      onHover: (result) => hovered.push(result),
      onSelect: () => {}
    });

    inspector.start();
    dispatchMouseMove(target);
    dispatchWheel(target, { altKey: true, deltaY: -100 });
    dispatchWheel(target, { altKey: true, deltaY: -100 });

    expect(hovered.at(-1)?.element).toBe(section);

    const wheelEvent = dispatchWheel(target, {
      altKey: true,
      deltaY: 100
    });

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(hovered.at(-1)?.element).toBe(button);
  });

  it("does not intercept normal wheel scrolling", () => {
    const { target } = setupNestedTarget();
    let selected: DOMInspectResult | null = null;

    const inspector = createTestInspector(inspectors, {
      document,
      highlight: false,
      onSelect: (result) => {
        selected = result;
      }
    });

    inspector.start();
    dispatchMouseMove(target);

    const wheelEvent = dispatchWheel(target, { deltaY: -100 });
    dispatchClick(target);

    expect(wheelEvent.defaultPrevented).toBe(false);
    expect(expectSelected(selected).element).toBe(target);
  });

  it("prevents native select behavior before point selection", () => {
    const select = setupSelectTarget();
    let selected: DOMInspectResult | null = null;

    const inspector = createTestInspector(inspectors, {
      document,
      highlight: false,
      onSelect: (result) => {
        selected = result;
      }
    });

    inspector.start();

    const mouseDownEvent = dispatchMouseDown(select);
    dispatchClick(select);

    expect(mouseDownEvent.defaultPrevented).toBe(true);
    expect(expectSelected(selected).element).toBe(select);
  });

  it("allows native select behavior when preventDefault is false", () => {
    const select = setupSelectTarget();

    const inspector = createTestInspector(inspectors, {
      document,
      highlight: false,
      preventDefault: false,
      onSelect: () => {}
    });

    inspector.start();

    const mouseDownEvent = dispatchMouseDown(select);

    expect(mouseDownEvent.defaultPrevented).toBe(false);
  });
});

function expectSelected(result: DOMInspectResult | null): DOMInspectResult {
  expect(result).not.toBeNull();

  return result!;
}

function createTestInspector(
  inspectors: DOMInspector[],
  options: DOMInspectorOptions
): DOMInspector {
  const inspector = createDOMInspector(options);

  inspectors.push(inspector);
  return inspector;
}

function setupNestedTarget(): {
  button: HTMLButtonElement;
  section: HTMLElement;
  target: HTMLSpanElement;
} {
  document.body.innerHTML = `
    <main>
      <section id="section">
        <button id="button" type="button">
          <span id="target">Target</span>
        </button>
      </section>
    </main>
  `;

  return {
    button: document.querySelector("#button")!,
    section: document.querySelector("#section")!,
    target: document.querySelector("#target")!
  };
}

function setupSelectTarget(): HTMLSelectElement {
  document.body.innerHTML = `
    <main>
      <label>
        Mode
        <select id="mode">
          <option value="selector">Selector</option>
          <option value="xpath">XPath</option>
        </select>
      </label>
    </main>
  `;

  return document.querySelector("#mode")!;
}

function dispatchMouseMove(
  target: Element,
  clientX = 1,
  clientY = 1
): MouseEvent {
  const event = new MouseEvent("mousemove", {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    composed: true
  });

  target.dispatchEvent(event);
  return event;
}

function dispatchMouseDown(
  target: Element,
  clientX = 1,
  clientY = 1
): MouseEvent {
  const event = new MouseEvent("mousedown", {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY,
    composed: true
  });

  target.dispatchEvent(event);
  return event;
}

function dispatchClick(
  target: Element,
  clientX = 1,
  clientY = 1
): MouseEvent {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    composed: true
  });

  target.dispatchEvent(event);
  return event;
}

function dispatchWheel(
  target: Element,
  options: WheelEventInit
): WheelEvent {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: 1,
    clientY: 1,
    composed: true,
    ...options
  });

  target.dispatchEvent(event);
  return event;
}
