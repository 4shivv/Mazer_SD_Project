import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Home } from "./Home";
import { useAuth } from "./AuthProvider";

vi.mock("./AuthProvider", () => ({
  useAuth: vi.fn(),
}));

describe("Home", () => {
  it("shows the loading state while auth is resolving", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: true,
      refresh: vi.fn(),
      setUser: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders role selection when there is no authenticated user", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      refresh: vi.fn(),
      setUser: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "I’m an Instructor" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I’m a Trainee" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create an account" })).toBeInTheDocument();
  });

  it("redirects authenticated users into chat", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: "user-1",
        username: "operator",
        email: "operator@example.com",
        role: "trainee",
      },
      loading: false,
      refresh: vi.fn(),
      setUser: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<div>Chat landing</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Chat landing")).toBeInTheDocument();
  });
});
