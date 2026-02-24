import { useNavigate } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import styles from "./Login.module.css";
import { useState } from "react";
import * as Auth from "../lib/auth";
import { useAuth } from "../app/AuthProvider";

type AccountType = "trainee" | "instructor";

export default function Register() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("trainee");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const res = await Auth.register(username, password, accountType);
      if (res.pendingApproval) {
        setUser(null);
        setNotice(res.message || "Instructor account created. Await admin approval.");
        nav("/login/instructor", { replace: true });
      } else if (res.user) {
        setUser(res.user);
        nav("/chat", { replace: true });
      }
    } catch (err: any) {
      if (err?.message === "admin_self_register_forbidden") {
        setError("Admin self-registration is disabled.");
      } else {
      setError(err.message || "Registration failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Create Account">
      {error && <div style={{ color: "#ff6b6b", marginBottom: "1rem" }}>{error}</div>}
      {notice && <div style={{ color: "#3ddc97", marginBottom: "1rem" }}>{notice}</div>}
      <form className={styles.form} onSubmit={handleRegister}>
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
          placeholder="Username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
        <input
          className={styles.field}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Account"}
        </button>
      </form>
      <p style={{ marginTop: "1rem", textAlign: "center", fontSize: "0.9rem" }}>
        Already have an account? <a onClick={() => nav("/")} style={{ cursor: "pointer", color: "#6b5cff" }}>Sign in</a>
      </p>
    </AuthCard>
  );
}
