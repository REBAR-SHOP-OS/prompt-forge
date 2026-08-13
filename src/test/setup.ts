import "@testing-library/jest-dom";

// jsdom does not implement Element.prototype.scrollIntoView, which Radix Select
// calls when opening a dropdown. Polyfill it so Select-based tests (e.g. the
// Make Full Film camera/theme pickers) do not throw.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
