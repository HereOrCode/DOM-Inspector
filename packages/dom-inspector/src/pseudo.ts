export type DOMInspectorPseudoElement = "::before" | "::after";

export type RectLike = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
  x: number;
  y: number;
};

export type PseudoElementHit = {
  pseudoElement: DOMInspectorPseudoElement;
  rect: RectLike;
};

export type PseudoElementInfo = {
  pseudoElement: DOMInspectorPseudoElement;
  rect: RectLike | null;
};

export type PseudoElementMatch = {
  hit: PseudoElementHit | null;
  pseudoElements: PseudoElementInfo[];
};

const PSEUDO_ELEMENTS: DOMInspectorPseudoElement[] = ["::after", "::before"];
const HIT_SLOP = 4;

export function getPseudoElementHit(
  element: Element,
  clientX: number,
  clientY: number
): PseudoElementHit | null {
  return getPseudoElementMatch(element, clientX, clientY).hit;
}

export function getPseudoElementMatch(
  element: Element,
  clientX: number,
  clientY: number
): PseudoElementMatch {
  const pseudoElements = getPseudoElements(element);

  for (const info of pseudoElements) {
    if (!info.rect) {
      continue;
    }

    if (containsPoint(info.rect, clientX, clientY, HIT_SLOP)) {
      return {
        hit: { pseudoElement: info.pseudoElement, rect: info.rect },
        pseudoElements
      };
    }
  }

  return { hit: null, pseudoElements };
}

export function getPseudoElements(element: Element): PseudoElementInfo[] {
  const view = element.ownerDocument.defaultView;

  if (!view) {
    return [];
  }

  const pseudoElements: PseudoElementInfo[] = [];

  for (const pseudoElement of PSEUDO_ELEMENTS) {
    if (!hasVisiblePseudoElement(element, pseudoElement)) {
      continue;
    }

    pseudoElements.push({
      pseudoElement,
      rect: getPseudoElementRect(element, pseudoElement)
    });
  }

  return pseudoElements;
}

function getPseudoElementRect(
  element: Element,
  pseudoElement: DOMInspectorPseudoElement
): RectLike | null {
  const view = element.ownerDocument.defaultView;

  if (!view) {
    return null;
  }

  const style = view.getComputedStyle(element, pseudoElement);

  if (!isVisiblePseudoStyle(style)) {
    return null;
  }

  const baseRect = element.getBoundingClientRect();
  const leftInset = readLength(style.left, baseRect.width);
  const rightInset = readLength(style.right, baseRect.width);
  const topInset = readLength(style.top, baseRect.height);
  const bottomInset = readLength(style.bottom, baseRect.height);
  let width = readLength(style.width, baseRect.width);
  let height = readLength(style.height, baseRect.height);
  const hasGeometrySignal =
    style.position === "absolute" ||
    style.position === "fixed" ||
    width !== null ||
    height !== null ||
    leftInset !== null ||
    rightInset !== null ||
    topInset !== null ||
    bottomInset !== null;

  if (!hasGeometrySignal) {
    return null;
  }

  if (width === null && leftInset !== null && rightInset !== null) {
    width = Math.max(baseRect.width - leftInset - rightInset, 0);
  }

  if (height === null && topInset !== null && bottomInset !== null) {
    height = Math.max(baseRect.height - topInset - bottomInset, 0);
  }

  if (width === null || height === null) {
    return null;
  }

  const x =
    leftInset !== null
      ? baseRect.left + leftInset
      : rightInset !== null
        ? baseRect.right - rightInset - width
        : pseudoElement === "::before"
          ? baseRect.left
          : baseRect.right - width;
  const y =
    topInset !== null
      ? baseRect.top + topInset
      : bottomInset !== null
        ? baseRect.bottom - bottomInset - height
        : pseudoElement === "::before"
          ? baseRect.top
          : baseRect.bottom - height;

  return {
    x,
    y,
    top: y,
    left: x,
    width,
    height,
    right: x + width,
    bottom: y + height
  };
}

function hasVisiblePseudoElement(
  element: Element,
  pseudoElement: DOMInspectorPseudoElement
): boolean {
  const view = element.ownerDocument.defaultView;

  if (!view) {
    return false;
  }

  return isVisiblePseudoStyle(view.getComputedStyle(element, pseudoElement));
}

function isVisiblePseudoStyle(style: CSSStyleDeclaration | null): boolean {
  return Boolean(
    style &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.content !== "none" &&
      style.content !== "normal"
  );
}

function containsPoint(
  rect: RectLike,
  clientX: number,
  clientY: number,
  slop: number
): boolean {
  return (
    clientX >= rect.left - slop &&
    clientX <= rect.right + slop &&
    clientY >= rect.top - slop &&
    clientY <= rect.bottom + slop
  );
}

function readLength(value: string, basis: number): number | null {
  if (!value || value === "auto") {
    return null;
  }

  if (value.endsWith("%")) {
    const percentage = Number.parseFloat(value);

    return Number.isFinite(percentage) ? (basis * percentage) / 100 : null;
  }

  const pixels = Number.parseFloat(value);

  return Number.isFinite(pixels) ? pixels : null;
}
