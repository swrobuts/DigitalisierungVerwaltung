// React 19 stellt JSX nicht mehr im globalen Namespace bereit (nur unter
// React.JSX). Wir re-exportieren das hier für die alte Schreibweise
// `JSX.Element`, damit Komponenten ohne weitere React-Imports auskommen.

import type { JSX as ReactJSX } from "react";

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type ElementClass = ReactJSX.ElementClass;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}
