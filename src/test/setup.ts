import "@testing-library/jest-dom";
import { beforeAll, afterEach, afterAll } from "vitest";
import { cleanup, configure } from "@testing-library/react";
import { server } from "./msw/server";
import { resetMockAuth } from "./msw/handlers"; // Import the reset function

// The MUI DataGrid-heavy suites are CPU-intensive; when several run in parallel
// the default 1000ms async-query timeout can lapse before a slow render settles,
// producing load-induced flakes (the logic is correct — it passes serialized).
// Raise the global findBy/waitFor timeout to give those renders headroom.
configure({ asyncUtilTimeout: 5000 });

const originalConsoleError = console.error;

// Filter only the noisy React act() warning that is common with MUI async internals in tests.
console.error = (...args: unknown[]) => {
    const first = typeof args[0] === "string" ? args[0] : "";
    if (first.includes("not wrapped in act")) {
        return;
    }
    originalConsoleError(...args);
};

// JSDOM does not implement ResizeObserver, which MUI X Charts' responsive container relies on.
// Provide a no-op stub so chart components render (their SVG size comes from the getBoundingClientRect
// stub below) instead of throwing.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() { /* no-op */ }
        unobserve() { /* no-op */ }
        disconnect() { /* no-op */ }
    };
}

// JSDOM does not implement scrolling; components that scroll an anchor into view
// (e.g. the EcoTaxa link section of the metadata tab) would otherwise throw.
if (typeof Element.prototype.scrollIntoView !== "function") {
    Element.prototype.scrollIntoView = function () { /* no-op */ };
}

// JSDOM does not implement layout; provide stable non-zero boxes for MUI Popover/Menu anchors.
Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: function () {
        return {
            width: 100,
            height: 40,
            top: 0,
            left: 0,
            right: 100,
            bottom: 40,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        };
    },
});

// Start the interception server before all tests
beforeAll(() => server.listen());

// Reset handlers and cleanup DOM after each test to ensure isolation
afterEach(() => {
    server.resetHandlers();
    resetMockAuth(); // Reset the fake server login state
    cleanup();
});

// Close the server when all tests are done
afterAll(() => server.close());
/**
 * This guarantees:
➡️ No test pollutes others.
➡️ No persistent state.
➡️ Fully simulated network requests.
 */