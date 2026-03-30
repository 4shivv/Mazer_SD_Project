import { useNavigate } from "react-router-dom";
import { useState } from "react";
import AuthCard from "../components/AuthCard";
import PasswordVisibilityIcon from "../components/PasswordVisibilityIcon";
import styles from "./Login.module.css";
import * as Auth from "../lib/auth";
import { useAuth } from "../app/AuthProvider";

export default function LoginInstructor() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!identifier.trim() || !password) {
      setError("Please enter your email/username and password.");
      return;
    }

    try {
      setLoading(true);
      const res = await Auth.login(identifier.trim(), password, "instructor");
      setUser(res.user);
      nav("/chat", { replace: true });
    } catch (err: any) {
      if (err?.message === "instructor_pending_approval") {
        setError("Instructor account is pending admin approval.");
      } else if (err?.message === "login_role_mismatch") {
        setError("This account is not an instructor account. Please use the correct login page.");
      } else {
        setError(err?.message || "Login failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Instructor Login">
      {error && <div style={{ marginTop: 8, color: "crimson" }}>{error}</div>}
      <form className={styles.form} onSubmit={onSubmit} autoComplete="on">
        <input
          className={styles.field}
          placeholder="Email or username"
          name="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
        />
        <div className={styles.passwordWrap}>
          <input
            className={styles.field}
            placeholder="Password"
            type={showPassword ? "text" : "password"}
            name="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setShowPassword((v) => !v)}
            title={showPassword ? "Hide password" : "Show password"}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            <PasswordVisibilityIcon visible={showPassword} />
          </button>
        </div>
        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className={styles.registerRow}>
          Don&apos;t have an account?{" "}
          <button type="button" className={styles.registerLink} onClick={() => nav("/register")}>
            Create one
          </button>
        </p>
        <p className={styles.registerRow}>
          Need a different login?{" "}
          <button type="button" className={styles.registerLink} onClick={() => nav("/")}>
            Back to role selection
          </button>
        </p>
      </form>
    </AuthCard>
  );
}
