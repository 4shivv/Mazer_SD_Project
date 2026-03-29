import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Library from "./Library";
import { useAuth } from "../app/AuthProvider";
import { listAvailableDocuments } from "../lib/api";

vi.mock("../app/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  listAvailableDocuments: vi.fn(),
}));

describe("Library", () => {
  it("shows uploaded knowledge-base documents to authenticated users", async () => {
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

    vi.mocked(listAvailableDocuments).mockResolvedValue({
      documents: [
        {
          id: "doc-1",
          title: "Electronic Warfare Fundamentals",
          original_filename: "Electronic-Warfare-Fundamentals.pdf",
          document_type: "textbook",
          mime_type: "application/pdf",
          size_bytes: 1024,
          status: "ready",
          chunk_count: 12,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          processing_error: null,
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/library"]}>
        <Routes>
          <Route path="/library" element={<Library />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Electronic Warfare Fundamentals")).toBeInTheDocument();
      expect(screen.getByText(/Electronic-Warfare-Fundamentals\.pdf/)).toBeInTheDocument();
    });
  });
});
