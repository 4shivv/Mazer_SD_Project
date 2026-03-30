import { useNavigate } from "react-router-dom";
import { useState } from "react";
import AuthCard from "../components/AuthCard";
import PasswordVisibilityIcon from "../components/PasswordVisibilityIcon";
import styles from "./Login.module.css";
import * as Auth from "../lib/auth";
import { useAuth } from "../app/AuthProvider";

export default function LoginTrainee() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await Auth.login(identifier, password, "trainee");
      setUser(res.user);
      nav("/chat");
    } catch (err: any) {
      if (err?.message === "instructor_pending_approval") {
        setError("Instructor account is pending admin approval.");
      } else if (err?.message === "login_role_mismatch") {
        setError("This account is not a trainee account. Please use the correct login page.");
      } else {
        setError(err.message || "Login failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Trainee Login">
      {error && <div style={{ color: "#ff6b6b", marginBottom: "1rem" }}>{error}</div>}
      <form className={styles.form} onSubmit={handleSubmit} autoComplete="on">
        <input
          className={styles.field}
          placeholder="Username or email"
          type="text"
          name="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          required
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
            required
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
