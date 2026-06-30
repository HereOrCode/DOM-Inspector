export {
  createDOMInspector,
  type DOMInspectResult,
  type DOMInspector,
  type DOMInspectorHighlightOptions,
  type DOMInspectorModifierKey,
  type DOMInspectorSelectionScopeOptions,
  type DOMInspectorOptions
} from "./inspector";

export {
  getCssSelector,
  getElementPath,
  getJSPath,
  getXPath,
  type DOMElementPath,
  type DOMInspectorFramePath,
  type DOMInspectorShadowPath,
  type DOMPathRootKind,
  type XPathOptions
} from "./path";

export type {
  DOMInspectorPseudoElement,
  PseudoElementHit,
  PseudoElementInfo,
  PseudoElementMatch
} from "./pseudo";
