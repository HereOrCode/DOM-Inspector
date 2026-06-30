export type HighlighterOptions = {
  borderColor?: string;
  backgroundColor?: string;
  borderRadius?: number;
  zIndex?: number;
};

type RectLike = {
  height: number;
  left: number;
  top: number;
  width: number;
};

const DEFAULT_BORDER_COLOR = "#7c3aed";
const DEFAULT_BACKGROUND_COLOR = "rgba(124, 58, 237, 0.12)";
const DEFAULT_Z_INDEX = 2147483647;

export class ElementHighlighter {
  private readonly element: HTMLElement;

  constructor(
    private readonly document: Document,
    options: HighlighterOptions = {}
  ) {
    this.element = document.createElement("dom-inspector-overlay");
    this.element.setAttribute("data-dom-inspector-overlay", "true");
    this.element.style.cssText = [
      "position: fixed",
      "top: 0",
      "left: 0",
      "display: none",
      "pointer-events: none",
      "box-sizing: border-box",
      `border: 1px dashed ${options.borderColor ?? DEFAULT_BORDER_COLOR}`,
      `background: ${options.backgroundColor ?? DEFAULT_BACKGROUND_COLOR}`,
      `border-radius: ${options.borderRadius ?? 0}px`,
      `z-index: ${options.zIndex ?? DEFAULT_Z_INDEX}`,
      "transition: transform 80ms ease, width 80ms ease, height 80ms ease"
    ].join(";");

    const parent = document.body ?? document.documentElement;
    parent.appendChild(this.element);
  }

  show(target: Element): void {
    this.showRect(target.getBoundingClientRect());
  }

  showRect(rect: RectLike): void {
    this.element.style.display = "block";
    this.element.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    this.element.style.width = `${rect.width}px`;
    this.element.style.height = `${rect.height}px`;
  }

  hide(): void {
    this.element.style.display = "none";
  }

  destroy(): void {
    this.element.remove();
  }
}
