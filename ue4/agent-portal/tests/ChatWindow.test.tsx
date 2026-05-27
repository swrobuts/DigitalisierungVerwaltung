import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChatWindow } from "../src/components/ChatWindow";
import type { ChatMessage } from "../src/lib/types";

describe("ChatWindow", () => {
  it("zeigt Empty-State wenn keine Messages", () => {
    render(<ChatWindow messages={[]} isThinking={false} />);
    expect(screen.getByTestId("chat-empty-state")).toBeInTheDocument();
    expect(screen.getByText(/Hallo, ich bin CIVA/)).toBeInTheDocument();
  });

  it("rendert User-Bubble rechts und Assistant-Bubble links", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Hallo!", timestamp: "2026-05-25T10:00:00Z" },
      {
        role: "assistant",
        content: "Schön, dass Sie da sind.",
        timestamp: "2026-05-25T10:00:05Z",
      },
    ];
    render(<ChatWindow messages={messages} isThinking={false} />);
    expect(screen.getByTestId("bubble-user")).toHaveTextContent("Hallo!");
    expect(screen.getByTestId("bubble-assistant")).toHaveTextContent(
      "Schön, dass Sie da sind.",
    );
  });

  it("zeigt Thinking-Bubble wenn isThinking=true", () => {
    render(<ChatWindow messages={[]} isThinking={true} />);
    expect(screen.getByTestId("thinking-bubble")).toBeInTheDocument();
    expect(screen.getByText(/CIVA denkt nach/)).toBeInTheDocument();
  });

  it("respektiert Reihenfolge der Messages", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Erste", timestamp: "t1" },
      { role: "assistant", content: "Antwort 1", timestamp: "t2" },
      { role: "user", content: "Zweite", timestamp: "t3" },
    ];
    render(<ChatWindow messages={messages} isThinking={false} />);
    const bubbles = screen.getAllByTestId(/^bubble-/);
    expect(bubbles).toHaveLength(3);
    expect(bubbles[0]).toHaveTextContent("Erste");
    expect(bubbles[2]).toHaveTextContent("Zweite");
  });
});
