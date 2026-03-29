import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    fireEvent.change(screen.getByPlaceholderText("Search saved chat titles"), {
      target: { value: "radar" },
    });

    expect(screen.getByText("Radar troubleshooting")).toBeInTheDocument();
    expect(screen.queryByText("EW notes")).not.toBeInTheDocument();
  });
});
