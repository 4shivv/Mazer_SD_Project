import { useNavigate } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import styles from "./Login.module.css";
import { useState } from "react";
import * as Auth from "../lib/auth";
import { useAuth } from "../app/AuthProvider";

type AccountType = "user" | "admin";

export default function Register() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("user");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await Auth.register(email, password, accountType);
      setUser(res.user);
      nav("/chat", { replace: true });
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Create Account">
      {error && <div style={{ color: "#ff6b6b", marginBottom: "1rem" }}>{error}</div>}
      <form className={styles.form} onSubmit={handleRegister}>
        <label className={styles.roleLabel}>Account type</label>
        <div className={styles.roleGroup}>
          <button
            type="button"
            className={styles.roleBtn}
            data-selected={accountType === "user"}
            onClick={() => setAccountType("user")}
          >
            Student
          </button>
          <button
            type="button"
            className={styles.roleBtn}
            data-selected={accountType === "admin"}
            onClick={() => setAccountType("admin")}
          >
            Instructor
          </button>
        </div>
        <input
          className={styles.field}
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
