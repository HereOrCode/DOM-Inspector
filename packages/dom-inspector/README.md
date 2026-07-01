# @hereorcode/dom-inspector

A lightweight browser-side DOM inspector that returns selector, XPath, and JS
path information for clicked elements.

## Status

This package has not been published to npm yet. Use it from this pnpm workspace
or build/link it locally while developing.

## Installation

After the package is published to npm, install it with your package manager:

```bash
npm install @hereorcode/dom-inspector
```

```bash
pnpm add @hereorcode/dom-inspector
```

```bash
yarn add @hereorcode/dom-inspector
```

```bash
bun add @hereorcode/dom-inspector
```

## Usage

```ts
import { createDOMInspector } from "@hereorcode/dom-inspector";

const inspector = createDOMInspector({
  selectionScope: { modifierKey: "Alt" },
  onSelect(result) {
    console.log(result.selector);
    console.log(result.xpath);
    console.log(result.jsPath);
  }
});

inspector.start();
```

Hold `Alt`/`Option` while scrolling to expand or shrink the current hover scope
before clicking. Pass `selectionScope: false` to disable this behavior.

## Local Development

From the repository root:

```bash
pnpm install
pnpm --filter @hereorcode/dom-inspector typecheck
pnpm --filter @hereorcode/dom-inspector test
pnpm --filter @hereorcode/dom-inspector build
```

Use the generated `dist` output only after running the build command. During
workspace development, the demo app imports this package through
`"@hereorcode/dom-inspector": "workspace:*"`.
