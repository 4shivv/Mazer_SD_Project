import { useNavigate } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import PasswordVisibilityIcon from "../components/PasswordVisibilityIcon";
import styles from "./Login.module.css";
import { useState } from "react";
import * as Auth from "../lib/auth";
import { formatRegisterApiError, validateRegisterForm } from "../lib/registerErrors";
import { useAuth } from "../app/AuthProvider";

type AccountType = "trainee" | "instructor";

export default function Register() {
  const nav = useNavigate();
  const { setUser } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("trainee");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    const clientMsg = validateRegisterForm(identifier, password);
    if (clientMsg) {
      setError(clientMsg);
      return;
    }

    setLoading(true);

    try {
      const res = await Auth.register(identifier, password, accountType);
      if (res.pendingApproval) {
        setUser(null);
        setNotice(res.message || "Instructor account created. Await admin approval.");
        nav("/login/instructor", { replace: true });
      } else if (res.user) {
        setUser(res.user);
        nav(res.user.role === "admin" ? "/admin" : "/chat", { replace: true });
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(formatRegisterApiError(raw));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Create Account">
      {error && <div style={{ color: "#ff6b6b", marginBottom: "1rem" }}>{error}</div>}
      {notice && <div style={{ color: "#3ddc97", marginBottom: "1rem" }}>{notice}</div>}

      <form className={styles.form} onSubmit={handleRegister} autoComplete="on">
        <label className={styles.roleLabel}>Account type</label>

        <div className={styles.roleGroup}>
          <button
            type="button"
            className={styles.roleBtn}
            data-selected={accountType === "trainee"}
            onClick={() => setAccountType("trainee")}
          >
            Trainee
          </button>

          <button
            type="button"
            className={styles.roleBtn}
            data-selected={accountType === "instructor"}
            onClick={() => setAccountType("instructor")}
          >
            Instructor
          </button>
        </div>

        <input
          className={styles.field}
          placeholder="Email or username"
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
            name="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
            aria-describedby="register-password-hint"
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
        <p id="register-password-hint" className={styles.fieldHint}>
          Password must be at least 8 characters.
        </p>

        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Account"}
        </button>
      </form>

      <p style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.9rem" }}>
        Admin accounts are provisioned separately.{" "}
        <button
          type="button"
          className={styles.registerLink}
          onClick={() => nav("/login/admin")}
        >
          Admin login
        </button>
      </p>

      <p style={{ marginTop: "0.5rem", textAlign: "center", fontSize: "0.9rem" }}>
        Already have an account?{" "}
        <button
          type="button"
          className={styles.registerLink}
          onClick={() => nav("/")}
        >
          Sign in
        </button>
      </p>
    </AuthCard>
  );
}
