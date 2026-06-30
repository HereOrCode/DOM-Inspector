export type XPathOptions = {
  /**
   * Include [1] even when the element is the first or only matching sibling.
   */
  alwaysIncludeIndex?: boolean;
};

export type DOMPathRootKind = "document" | "iframe" | "shadow";

export type DOMInspectorFramePath = {
  element: HTMLIFrameElement;
  selector: string;
  xpath: string;
  fullXPath: string;
  jsPath: string;
};

export type DOMInspectorShadowPath = {
  host: Element;
  hostSelector: string;
  hostXPath: string;
  hostFullXPath: string;
  jsPath: string;
};

export type DOMElementPath = {
  rootKind: DOMPathRootKind;
  selector: string;
  xpath: string;
  fullXPath: string;
  jsPath: string;
  framePath: DOMInspectorFramePath[];
  shadowPath: DOMInspectorShadowPath[];
};

const ROOT_TAGS = new Set(["html", "body"]);

type AccessBridge =
  | {
      element: HTMLIFrameElement;
      fullXPath: string;
      kind: "iframe";
      selector: string;
      xpath: string;
    }
  | {
      fullXPath: string;
      host: Element;
      kind: "shadow";
      selector: string;
      xpath: string;
    };

export function getCssSelector(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === 1) {
    const tagName = getTagName(current);
    segments.unshift(getCssSegment(current));

    if (ROOT_TAGS.has(tagName)) {
      break;
    }

    current = current.parentElement;
  }

  return segments.join(" > ");
}

export function getXPath(element: Element, options: XPathOptions = {}): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === 1) {
    const tagName = getTagName(current);
    const index = getSameTagIndex(current);
    const shouldIncludeIndex =
      options.alwaysIncludeIndex || hasSameTagSibling(current);

    segments.unshift(`${tagName}${shouldIncludeIndex ? `[${index}]` : ""}`);

    if (tagName === "html") {
      break;
    }

    current = current.parentElement;
  }

  return `/${segments.join("/")}`;
}

export function getJSPath(element: Element): string {
  return `document.querySelector(${JSON.stringify(getCssSelector(element))})`;
}

export function getElementPath(
  element: Element,
  options: { rootDocument?: Document } = {}
): DOMElementPath {
  const rootDocument = options.rootDocument ?? element.ownerDocument;
  const selector = getCssSelector(element);
  const xpath = getXPath(element);
  const fullXPath = getXPath(element, { alwaysIncludeIndex: true });
  const bridges = collectAccessBridges(element, rootDocument);
  const orderedBridges = [...bridges].reverse();
  const framePath: DOMInspectorFramePath[] = [];
  const shadowPath: DOMInspectorShadowPath[] = [];
  let expression = "document";

  for (const bridge of orderedBridges) {
    if (bridge.kind === "iframe") {
      const frameExpression = `${expression}.querySelector(${JSON.stringify(
        bridge.selector
      )})`;

      framePath.push({
        element: bridge.element,
        selector: bridge.selector,
        xpath: bridge.xpath,
        fullXPath: bridge.fullXPath,
        jsPath: frameExpression
      });
      expression = `${frameExpression}.contentDocument`;
      continue;
    }

    const hostExpression = `${expression}.querySelector(${JSON.stringify(
      bridge.selector
    )})`;

    shadowPath.push({
      host: bridge.host,
      hostSelector: bridge.selector,
      hostXPath: bridge.xpath,
      hostFullXPath: bridge.fullXPath,
      jsPath: hostExpression
    });
    expression = `${hostExpression}.shadowRoot`;
  }

  return {
    rootKind: getRootKind(bridges),
    selector,
    xpath,
    fullXPath,
    jsPath: `${expression}.querySelector(${JSON.stringify(selector)})`,
    framePath,
    shadowPath
  };
}

function getCssSegment(element: Element): string {
  const tagName = getTagName(element);

  if (ROOT_TAGS.has(tagName)) {
    return tagName;
  }

  if (!hasSameTagSibling(element)) {
    return tagName;
  }

  return `${tagName}:nth-child(${getElementIndex(element)})`;
}

function getTagName(element: Element): string {
  return element.localName.toLowerCase();
}

function getElementIndex(element: Element): number {
  const siblings = getElementSiblings(element);

  if (!siblings) {
    return 1;
  }

  return siblings.indexOf(element) + 1;
}

function getSameTagIndex(element: Element): number {
  const siblings = getElementSiblings(element);

  if (!siblings) {
    return 1;
  }

  const tagName = getTagName(element);
  let index = 0;

  for (const child of siblings) {
    if (getTagName(child) === tagName) {
      index += 1;
    }

    if (child === element) {
      return index;
    }
  }

  return 1;
}

function hasSameTagSibling(element: Element): boolean {
  const siblings = getElementSiblings(element);

  if (!siblings) {
    return false;
  }

  const tagName = getTagName(element);
  let count = 0;

  for (const child of siblings) {
    if (getTagName(child) === tagName) {
      count += 1;
    }

    if (count > 1) {
      return true;
    }
  }

  return false;
}

function collectAccessBridges(
  element: Element,
  rootDocument: Document
): AccessBridge[] {
  const bridges: AccessBridge[] = [];
  let current: Element = element;
  let root = current.getRootNode();

  while (true) {
    if (isShadowRoot(root)) {
      const host = root.host;

      bridges.push({
        kind: "shadow",
        host,
        selector: getCssSelector(host),
        xpath: getXPath(host),
        fullXPath: getXPath(host, { alwaysIncludeIndex: true })
      });

      current = host;
      root = current.getRootNode();
      continue;
    }

    if (isDocument(root) && root !== rootDocument) {
      const frameElement = findFrameElementForDocument(root, rootDocument);

      if (!frameElement) {
        break;
      }

      bridges.push({
        kind: "iframe",
        element: frameElement,
        selector: getCssSelector(frameElement),
        xpath: getXPath(frameElement),
        fullXPath: getXPath(frameElement, { alwaysIncludeIndex: true })
      });

      current = frameElement;
      root = current.getRootNode();
      continue;
    }

    break;
  }

  return bridges;
}

function getRootKind(bridges: AccessBridge[]): DOMPathRootKind {
  const innermostBridge = bridges[0];

  if (!innermostBridge) {
    return "document";
  }

  return innermostBridge.kind === "shadow" ? "shadow" : "iframe";
}

function findFrameElementForDocument(
  targetDocument: Document,
  searchDocument: Document
): HTMLIFrameElement | null {
  const directFrame = targetDocument.defaultView?.frameElement;

  if (directFrame && getTagName(directFrame) === "iframe") {
    return directFrame as HTMLIFrameElement;
  }

  for (const frame of Array.from(searchDocument.querySelectorAll("iframe"))) {
    const childDocument = getAccessibleFrameDocument(frame);

    if (!childDocument) {
      continue;
    }

    if (childDocument === targetDocument) {
      return frame;
    }

    const nestedFrame = findFrameElementForDocument(
      targetDocument,
      childDocument
    );

    if (nestedFrame) {
      return nestedFrame;
    }
  }

  return null;
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

function getElementSiblings(element: Element): Element[] | null {
  if (element.parentElement) {
    return Array.from(element.parentElement.children);
  }

  const parentNode = element.parentNode;

  if (!parentNode || parentNode.nodeType !== 11) {
    return null;
  }

  return Array.from(parentNode.childNodes).filter(isElement);
}

function isDocument(root: Node): root is Document {
  return root.nodeType === 9;
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function isShadowRoot(root: Node): root is ShadowRoot {
  return root.nodeType === 11 && "host" in root;
}
