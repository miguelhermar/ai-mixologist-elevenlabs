import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

// --- Mock the ElevenLabs React SDK so no real connection is attempted. ---
const startSession = vi.fn();
const endSession = vi.fn();
let mockStatus = "disconnected";

vi.mock("@elevenlabs/react", () => ({
  ConversationProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useConversationControls: () => ({ startSession, endSession }),
  useConversationStatus: () => ({ status: mockStatus }),
}));

import { BarConcierge } from "./BarConcierge";

describe("BarConcierge", () => {
  beforeEach(() => {
    startSession.mockReset();
    endSession.mockReset();
    mockStatus = "disconnected";
    vi.restoreAllMocks();
    // Keep workflow logs out of test output (and let us assert error logging).
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  it("renders the disconnected call-to-action and the optional pre-call form", () => {
    render(<BarConcierge />);
    expect(
      screen.getByRole("button", { name: /step up to the bar/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("status-line")).toHaveTextContent(/bar's closed/i);
    // Phase 4: the personalization form is shown before connecting.
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
  });

  it("passes filled personalization as dynamicVariables, defaulting blanks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ signedUrl: "wss://signed.example/abc" }),
      }))
    );

    render(<BarConcierge />);
    await userEvent.type(screen.getByLabelText(/your name/i), "Miguel");
    await userEvent.click(screen.getByRole("button", { name: /low-abv/i }));
    await userEvent.click(screen.getByRole("button", { name: /^gin$/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /step up to the bar/i })
    );

    await waitFor(() => expect(startSession).toHaveBeenCalledTimes(1));
    expect(startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        dynamicVariables: {
          user_name: "Miguel",
          taste_profile: "no strong preference yet",
          abv_mode: "low-abv",
          available_spirits: "Gin",
        },
      })
    );
  });

  it("passes default dynamicVariables when the form is left blank", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ signedUrl: "wss://signed.example/abc" }),
      }))
    );

    render(<BarConcierge />);
    await userEvent.click(
      screen.getByRole("button", { name: /step up to the bar/i })
    );

    await waitFor(() => expect(startSession).toHaveBeenCalledTimes(1));
    // Every referenced {{var}} must have a concrete runtime value — placeholder
    // defaults do NOT fill them in a live session, so we send defaults ourselves.
    expect(startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        dynamicVariables: {
          user_name: "friend",
          taste_profile: "no strong preference yet",
          abv_mode: "regular",
          available_spirits: "whatever you have on hand",
        },
      })
    );
  });

  it("fetches a signed URL and starts a websocket session on click", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ signedUrl: "wss://signed.example/abc" }),
      }))
    );

    render(<BarConcierge />);
    await userEvent.click(
      screen.getByRole("button", { name: /step up to the bar/i })
    );

    await waitFor(() => expect(startSession).toHaveBeenCalledTimes(1));
    expect(startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        signedUrl: "wss://signed.example/abc",
        connectionType: "websocket",
      })
    );
    expect(fetch).toHaveBeenCalledWith("/api/signed-url");
  });

  it("surfaces an error and does not start a session when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    );

    render(<BarConcierge />);
    await userEvent.click(
      screen.getByRole("button", { name: /step up to the bar/i })
    );

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(startSession).not.toHaveBeenCalled();
    // Failure is logged for developer visibility.
    expect(console.error).toHaveBeenCalled();
  });

  it("shows the close-the-tab control while connected", () => {
    mockStatus = "connected";
    render(<BarConcierge />);
    expect(
      screen.getByRole("button", { name: /close the tab/i })
    ).toBeInTheDocument();
  });
});
