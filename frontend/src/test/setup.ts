import '@testing-library/jest-dom/vitest';
import '../i18n/index.js';

// Mantine's MantineProvider uses window.matchMedia for color scheme detection.
// jsdom does not implement it, so we provide a minimal mock.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Mantine's Modal and other components use ResizeObserver.
if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Mantine's Combobox calls scrollIntoView on option elements.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
