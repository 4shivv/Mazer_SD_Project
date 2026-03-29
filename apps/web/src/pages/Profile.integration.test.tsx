import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Profile from "./Profile";
import { useAuth } from "../app/AuthProvider";

vi.mock("../app/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../lib/auth", () => ({
  logout: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("Profile", () => {
  it("renders the authenticated user's account details", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: "user-1",
        username: "operator",
        email: "operator@example.com",
        role: "instructor",
      },
      loading: false,
      refresh: vi.fn(),
      setUser: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/profile"]}>
        <Routes>
          <Route path="/profile" element={<Profile />} />
          <Route path="/instructor/settings" element={<div>Instructor Settings</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("operator")).toBeInTheDocument();
    expect(screen.getByText("operator@example.com")).toBeInTheDocument();
    expect(screen.getByText("instructor")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Instructor Settings" }));
    expect(screen.getByText("Instructor Settings")).toBeInTheDocument();
  });
});
