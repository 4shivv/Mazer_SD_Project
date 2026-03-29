import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Admin from "./Admin";
import { useAuth } from "../app/AuthProvider";
import * as Auth from "../lib/auth";
import { runAdminWipe, updateRetentionPolicy } from "../lib/api";

vi.mock("../app/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../lib/auth", () => ({
  listPendingInstructors: vi.fn().mockResolvedValue({ users: [] }),
  logout: vi.fn().mockResolvedValue({ ok: true }),
  approveInstructor: vi.fn(),
}));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    runAdminWipe: vi.fn().mockResolvedValue({
      status: "completed",
      conversations_deleted: 0,
      embeddings_deleted: 0,
      models_deleted: 2,
      model_cache_paths_cleared: 1,
      deleted_model_names: ["llama3.2", "nomic-embed-text"],
      storage_freed_gb: 0,
      wipe_audit: { confirmation_code_verified: true },
      errors: [],
    }),
    updateRetentionPolicy: vi.fn(),
  };
});

describe("Admin", () => {
  it("submits model reset requests through the secure wipe form", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: "admin-1",
        username: "admin",
        email: "admin@example.com",
        role: "admin",
      },
      loading: false,
      refresh: vi.fn(),
      setUser: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(Auth.listPendingInstructors).toHaveBeenCalledWith(200);
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "Reset model weights and cache" }));
    fireEvent.change(screen.getByPlaceholderText("Confirmation code"), {
      target: { value: "CONFIRM-WIPE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run Wipe" }));

    await waitFor(() => {
      expect(runAdminWipe).toHaveBeenCalledWith({
        wipe_conversations: false,
        wipe_embeddings: false,
        wipe_model_weights: true,
        confirmation_code: "CONFIRM-WIPE",
      });
    });

    expect(updateRetentionPolicy).not.toHaveBeenCalled();
    expect(screen.getByText("Wipe completed with status: completed.")).toBeInTheDocument();
    expect(screen.getByText(/"models_deleted": 2/)).toBeInTheDocument();
  });
});
