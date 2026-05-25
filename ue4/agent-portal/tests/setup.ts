import "@testing-library/jest-dom/vitest";

// jsdom kennt scrollIntoView nicht — wir polyfillen es als No-Op, damit
// ChatWindow's Auto-Scroll in Tests nicht crasht.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}
