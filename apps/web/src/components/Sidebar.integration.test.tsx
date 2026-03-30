import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Sidebar from "./Sidebar";

vi.mock("../app/AuthProvider", () => ({
  useAuth: () => ({
    user: {
      id: "user-1",
      username: "operator",
      email: "operator@example.com",
      role: "trainee",
    },
  }),
}));

vi.mock("../lib/chatStore", () => ({
  listSessions: vi.fn().mockResolvedValue([
    { id: "a", title: "Radar troubleshooting", updatedAt: 1 },
    { id: "b", title: "EW notes", updatedAt: 2 },
  ]),
}));

describe("Sidebar search", () => {
  it("filters persisted chats by title", async () => {
    render(
      <MemoryRouter>
        <Sidebar open={true} onClose={() => {}} onNewChat={() => {}} historyRefreshKey={0} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Radar troubleshooting")).toBeInTheDocument();
      expect(screen.getByText("EW notes")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Search Chats" }));

    const dialog = screen.getByRole("dialog", { name: /search chats/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Search saved chat titles"), {
      target: { value: "radar" },
    });

    expect(within(dialog).getByText("Radar troubleshooting")).toBeInTheDocument();
    expect(within(dialog).queryByText("EW notes")).not.toBeInTheDocument();
  });
});
