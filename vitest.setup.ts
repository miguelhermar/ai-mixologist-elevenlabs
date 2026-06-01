import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount React trees and reset jsdom between tests to avoid cross-test leakage.
afterEach(() => {
  cleanup();
});
