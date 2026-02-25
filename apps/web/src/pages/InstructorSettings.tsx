import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import AuthCard from "../components/AuthCard";
import {
  getInstructorConfig,
  updateInstructorConfig,
  type InstructorConfig,
} from "../lib/api";
import styles from "./Login.module.css";

type ConfigForm = {
  personality_prompt: string;
  temperature: string;
  max_tokens: string;
  retrieval_threshold: string;
};

function toForm(config: InstructorConfig): ConfigForm {
  return {
    personality_prompt: config.personality_prompt,
    temperature: String(config.temperature),
    max_tokens: String(config.max_tokens),
    retrieval_threshold: String(config.retrieval_threshold),
  };
}

export default function InstructorSettings() {
  const nav = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [config, setConfig] = useState<InstructorConfig | null>(null);
  const [form, setForm] = useState<ConfigForm>({
    personality_prompt: "",
    temperature: "0.3",
    max_tokens: "512",
    retrieval_threshold: "0.75",
  });

  async function loadConfig() {
    try {
      setLoading(true);
      setError(null);
      const result = await getInstructorConfig();
      setConfig(result.config);
      setForm(toForm(result.config));
    } catch (err: any) {
      setError(err?.message || "Failed to load instructor settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    if (user.role !== "instructor") {
      nav("/chat", { replace: true });
      return;
    }
    void loadConfig();
  }, [user, nav]);

  function setField<K extends keyof ConfigForm>(key: K, value: ConfigForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!config) return;

    setError(null);
    setNotice(null);

    const personalityPrompt = form.personality_prompt.trim();
    const temperature = Number(form.temperature);
    const maxTokens = Number(form.max_tokens);
    const retrievalThreshold = Number(form.retrieval_threshold);

    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
      setError("Temperature must be a number between 0 and 1.");
      return;
    }
    if (!Number.isInteger(maxTokens) || maxTokens < 64 || maxTokens > 4096) {
      setError("Max tokens must be an integer between 64 and 4096.");
      return;
    }
    if (!Number.isFinite(retrievalThreshold) || retrievalThreshold < 0 || retrievalThreshold > 1) {
      setError("Retrieval threshold must be a number between 0 and 1.");
      return;
    }

    const payload: {
      personality_prompt?: string;
      temperature?: number;
      max_tokens?: number;
      retrieval_threshold?: number;
    } = {};

    if (personalityPrompt !== config.personality_prompt) {
      payload.personality_prompt = personalityPrompt;
    }
    if (temperature !== config.temperature) {
      payload.temperature = temperature;
    }
    if (maxTokens !== config.max_tokens) {
      payload.max_tokens = maxTokens;
    }
    if (retrievalThreshold !== config.retrieval_threshold) {
      payload.retrieval_threshold = retrievalThreshold;
    }

    if (Object.keys(payload).length === 0) {
      setNotice("No changes to save.");
      return;
    }

    try {
      setSaving(true);
      const result = await updateInstructorConfig(payload);
      setConfig(result.config);
      setForm(toForm(result.config));
      setNotice("Settings saved.");
    } catch (err: any) {
      setError(err?.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthCard title="Instructor Settings">
      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading settings...</p>
      ) : (
        <>
          {error && <div style={{ color: "#ff6b6b", marginBottom: "1rem" }}>{error}</div>}
          {notice && <div style={{ color: "#3ddc97", marginBottom: "1rem" }}>{notice}</div>}

          <form className={styles.form} onSubmit={onSave}>
            <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Personality Prompt
            </label>
            <textarea
              className={styles.field}
              style={{ minHeight: "140px", resize: "vertical" }}
              value={form.personality_prompt}
              onChange={(e) => setField("personality_prompt", e.target.value)}
              placeholder="Define response tone and behavior guidance"
              maxLength={8000}
            />

            <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Temperature (0 to 1)
            </label>
            <input
              className={styles.field}
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={form.temperature}
              onChange={(e) => setField("temperature", e.target.value)}
            />

            <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Max Tokens (64 to 4096)
            </label>
            <input
              className={styles.field}
              type="number"
              min={64}
              max={4096}
              step={1}
              value={form.max_tokens}
              onChange={(e) => setField("max_tokens", e.target.value)}
            />

            <label style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              Retrieval Threshold (0 to 1)
            </label>
            <input
              className={styles.field}
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={form.retrieval_threshold}
              onChange={(e) => setField("retrieval_threshold", e.target.value)}
            />

            <button className={styles.submit} type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </form>

          <div style={{ marginTop: "0.75rem", color: "var(--muted)", fontSize: "0.85rem" }}>
            Last updated: {config?.updated_at ? new Date(config.updated_at).toLocaleString() : "Never"}
          </div>

          <button
            onClick={() => nav(-1)}
            style={{
              display: "block",
              width: "100%",
              marginTop: "1rem",
              padding: "0.75rem",
              backgroundColor: "#6b5cff",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Back
          </button>
        </>
      )}
    </AuthCard>
  );
}
