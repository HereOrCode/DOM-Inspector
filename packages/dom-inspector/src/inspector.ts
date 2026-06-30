import { ElementHighlighter, type HighlighterOptions } from "./overlay";
import { getElementPath, type DOMElementPath } from "./path";
import {
  type DOMInspectorPseudoElement,
  getPseudoElementMatch,
  type PseudoElementInfo,
  type RectLike
} from "./pseudo";

export type DOMInspectorHighlightOptions = HighlighterOptions;

export type DOMInspectorModifierKey = "Alt" | "Control" | "Meta" | "Shift";

export type DOMInspectorSelectionScopeOptions = {
  modifierKey?: DOMInspectorModifierKey;
};

export type DOMInspectResult = DOMElementPath & {
  element: Element;
  ownerDocument: Document;
  pseudoElement: DOMInspectorPseudoElement | null;
  pseudoElements: PseudoElementInfo[];
  pseudoElementRect: RectLike | null;
  rect: DOMRect;
  event: MouseEvent;
  selectorWithPseudo: string;
};

export type DOMInspectorOptions = {
  onSelect?: (result: DOMInspectResult) => void;
  onHover?: (result: DOMInspectResult) => void;
  onCancel?: () => void;
  autoStop?: boolean;
  preventDefault?: boolean;
  highlight?: boolean | DOMInspectorHighlightOptions;
  selectionScope?: false | DOMInspectorSelectionScopeOptions;
  document?: Document;
  exclude?: (element: Element) => boolean;
};

export type DOMInspector = {
  start: () => void;
  stop: () => void;
  destroy: () => void;
  isActive: () => boolean;
};

type ManagedDocument = {
  document: Document;
  highlighter: ElementHighlighter | null;
  observer: MutationObserver | null;
  previousCursor: string;
};

export function createDOMInspector(options: DOMInspectorOptions): DOMInspector {
  return new DOMInspectorController(options);
}

class DOMInspectorController implements DOMInspector {
  private readonly document: Document;
  private readonly frameLoadHandlers = new Map<HTMLIFrameElement, EventListener>();
  private readonly managedDocuments = new Map<Document, ManagedDocument>();
  private readonly selectionScope: Required<DOMInspectorSelectionScopeOptions> | null;
  private active = false;
  private hoveredElement: Element | null = null;
  private hoveredPseudoElement: DOMInspectorPseudoElement | null = null;
  private hoveredPath: Element[] = [];
  private hoveredPathIndex = 0;

  constructor(private readonly options: DOMInspectorOptions) {
    this.document = options.document ?? document;
    this.selectionScope = getSelectionScope(options.selectionScope);
  }

  start(): void {
    if (this.active) {
      return;
    }

    this.active = true;
    this.attachDocument(this.document);
  }

  stop(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.hoveredElement = null;
    this.hoveredPseudoElement = null;
    this.hoveredPath = [];
    this.hoveredPathIndex = 0;

    for (const [frame, handler] of this.frameLoadHandlers) {
      frame.removeEventListener("load", handler);
    }

    this.frameLoadHandlers.clear();

    for (const state of this.managedDocuments.values()) {
      state.document.documentElement.style.cursor = state.previousCursor;
      state.document.removeEventListener("mousemove", this.handleMouseMove, true);
      state.document.removeEventListener("mousedown", this.handleMouseDown, true);
      state.document.removeEventListener("click", this.handleClick, true);
      state.document.removeEventListener("keydown", this.handleKeyDown, true);
      state.document.removeEventListener("wheel", this.handleWheel, true);
      state.document.defaultView?.removeEventListener(
        "scroll",
        this.handleViewportChange,
        true
      );
      state.document.defaultView?.removeEventListener(
        "resize",
        this.handleViewportChange,
        true
      );
      state.observer?.disconnect();
      state.highlighter?.destroy();
    }

    this.managedDocuments.clear();
  }

  destroy(): void {
    this.stop();
  }

  isActive(): boolean {
    return this.active;
  }

  private readonly handleMouseMove = (event: MouseEvent): void => {
    const path = this.getInspectablePath(event);
    const target = path[0];

    if (!target) {
      return;
    }

    const nextIndex =
      this.hoveredPath[0] === target
        ? Math.min(this.hoveredPathIndex, path.length - 1)
        : 0;

    this.hoveredPath = path;
    this.hoveredPathIndex = nextIndex;
    this.updateHoveredElement(path[nextIndex]!, event);
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) {
      return;
    }

    const target = this.getInspectablePath(event)[0];

    if (!target) {
      return;
    }

    if (this.options.preventDefault !== false) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  };

  private readonly handleClick = (event: MouseEvent): void => {
    const path = this.getInspectablePath(event);
    const target = this.getClickTarget(path);

    if (!target) {
      return;
    }

    const result = this.createResult(target, event);

    if (this.options.preventDefault !== false) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    this.showHighlight(result);

    try {
      this.options.onSelect?.(result);
    } finally {
      if (this.options.autoStop !== false) {
        this.stop();
      }
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (
      !this.selectionScope ||
      !hasModifierKey(event, this.selectionScope.modifierKey)
    ) {
      return;
    }

    const direction = getWheelDirection(event);

    if (direction === 0) {
      return;
    }

    const path = this.getInspectablePath(event);

    if (path.length > 0 && path[0] !== this.hoveredPath[0]) {
      this.hoveredPath = path;
      this.hoveredPathIndex = 0;
    }

    if (this.hoveredPath.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const nextIndex = clamp(
      this.hoveredPathIndex + direction,
      0,
      this.hoveredPath.length - 1
    );

    if (nextIndex === this.hoveredPathIndex) {
      return;
    }

    this.hoveredPathIndex = nextIndex;
    this.updateHoveredElement(this.hoveredPath[nextIndex]!, event);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    this.stop();
    this.options.onCancel?.();
  };

  private readonly handleViewportChange = (): void => {
    if (!this.hoveredElement) {
      return;
    }

    const highlighter = this.getHighlighter(this.hoveredElement.ownerDocument);

    if (highlighter) {
      this.hideInactiveHighlighters(this.hoveredElement.ownerDocument);
      highlighter.show(this.hoveredElement);
    }
  };

  private getInspectablePath(event: MouseEvent): Element[] {
    const path = event.composedPath().filter(isElementLike);

    if (path.some((entry) => this.options.exclude?.(entry))) {
      return [];
    }

    const inspectablePath: Element[] = [];

    for (const entry of path) {
      if (
        this.managedDocuments.has(entry.ownerDocument) &&
        !entry.hasAttribute("data-dom-inspector-overlay")
      ) {
        inspectablePath.push(entry);
      }
    }

    if (inspectablePath.length > 0) {
      return inspectablePath;
    }

    return isElementLike(event.target) &&
      this.managedDocuments.has(event.target.ownerDocument)
      ? [event.target]
      : [];
  }

  private getClickTarget(path: Element[]): Element | null {
    if (this.hoveredElement && path.includes(this.hoveredElement)) {
      return this.hoveredElement;
    }

    return path[0] ?? null;
  }

  private updateHoveredElement(element: Element, event: MouseEvent): void {
    const result = this.createResult(element, event);

    if (
      element === this.hoveredElement &&
      result.pseudoElement === this.hoveredPseudoElement
    ) {
      return;
    }

    this.hoveredElement = element;
    this.hoveredPseudoElement = result.pseudoElement;
    this.showHighlight(result);
    this.options.onHover?.(result);
  }

  private createResult(element: Element, event: MouseEvent): DOMInspectResult {
    const path = getElementPath(element, { rootDocument: this.document });
    const pseudoMatch = getPseudoElementMatch(
      element,
      event.clientX,
      event.clientY
    );
    const pseudoHit = pseudoMatch.hit;

    return {
      ...path,
      element,
      ownerDocument: element.ownerDocument,
      pseudoElement: pseudoHit?.pseudoElement ?? null,
      pseudoElements: pseudoMatch.pseudoElements,
      pseudoElementRect: pseudoHit?.rect ?? null,
      rect: element.getBoundingClientRect(),
      event,
      selectorWithPseudo: pseudoHit
        ? `${path.selector}${pseudoHit.pseudoElement}`
        : path.selector
    };
  }

  private attachDocument(targetDocument: Document): void {
    if (this.managedDocuments.has(targetDocument)) {
      return;
    }

    const previousCursor = targetDocument.documentElement.style.cursor;
    const highlighter =
      this.options.highlight === false
        ? null
        : new ElementHighlighter(
            targetDocument,
            typeof this.options.highlight === "object"
              ? this.options.highlight
              : undefined
          );
    const Observer = targetDocument.defaultView?.MutationObserver;
    const observer = Observer
      ? new Observer(() => this.syncChildFrames(targetDocument))
      : null;

    targetDocument.documentElement.style.cursor = "crosshair";
    targetDocument.addEventListener("mousemove", this.handleMouseMove, true);
    targetDocument.addEventListener("mousedown", this.handleMouseDown, true);
    targetDocument.addEventListener("click", this.handleClick, true);
    targetDocument.addEventListener("keydown", this.handleKeyDown, true);
    targetDocument.addEventListener("wheel", this.handleWheel, {
      capture: true,
      passive: false
    });
    targetDocument.defaultView?.addEventListener(
      "scroll",
      this.handleViewportChange,
      true
    );
    targetDocument.defaultView?.addEventListener(
      "resize",
      this.handleViewportChange,
      true
    );
    observer?.observe(targetDocument.documentElement, {
      childList: true,
      subtree: true
    });

    this.managedDocuments.set(targetDocument, {
      document: targetDocument,
      highlighter,
      observer,
      previousCursor
    });
    this.syncChildFrames(targetDocument);
  }

  private syncChildFrames(targetDocument: Document): void {
    for (const frame of Array.from(
      targetDocument.querySelectorAll("iframe")
    )) {
      this.observeFrameLoad(frame);

      const frameDocument = getAccessibleFrameDocument(frame);

      if (frameDocument) {
        this.attachDocument(frameDocument);
      }
    }
  }

  private observeFrameLoad(frame: HTMLIFrameElement): void {
    if (this.frameLoadHandlers.has(frame)) {
      return;
    }

    const handler = (): void => {
      if (!this.active) {
        return;
      }

      const frameDocument = getAccessibleFrameDocument(frame);

      if (frameDocument) {
        this.attachDocument(frameDocument);
      }
    };

    frame.addEventListener("load", handler);
    this.frameLoadHandlers.set(frame, handler);
  }

  private showHighlight(result: DOMInspectResult): void {
    const highlighter = this.getHighlighter(result.element.ownerDocument);

    if (!highlighter) {
      return;
    }

    this.hideInactiveHighlighters(result.element.ownerDocument);

    if (result.pseudoElementRect) {
      highlighter.showRect(result.pseudoElementRect);
      return;
    }

    highlighter.show(result.element);
  }

  private hideInactiveHighlighters(activeDocument: Document): void {
    for (const state of this.managedDocuments.values()) {
      if (state.document !== activeDocument) {
        state.highlighter?.hide();
      }
    }
  }

  private getHighlighter(targetDocument: Document): ElementHighlighter | null {
    return this.managedDocuments.get(targetDocument)?.highlighter ?? null;
  }
}

function getAccessibleFrameDocument(
  frame: HTMLIFrameElement
): Document | null {
  try {
    return frame.contentDocument?.documentElement ? frame.contentDocument : null;
  } catch {
    return null;
  }
}

function getSelectionScope(
  options: false | DOMInspectorSelectionScopeOptions | undefined
): Required<DOMInspectorSelectionScopeOptions> | null {
  if (options === false) {
    return null;
  }

  return {
    modifierKey: options?.modifierKey ?? "Alt"
  };
}

function hasModifierKey(
  event: MouseEvent,
  modifierKey: DOMInspectorModifierKey
): boolean {
  switch (modifierKey) {
    case "Alt":
      return event.altKey;
    case "Control":
      return event.ctrlKey;
    case "Meta":
      return event.metaKey;
    case "Shift":
      return event.shiftKey;
  }
}

function getWheelDirection(event: WheelEvent): number {
  if (event.deltaY < 0) {
    return 1;
  }

  if (event.deltaY > 0) {
    return -1;
  }

  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isElementLike(value: unknown): value is Element {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Node).nodeType === 1 &&
    typeof (value as Element).tagName === "string"
  );
}
