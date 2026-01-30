import { useNavigate } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import styles from "./RoleSelect.module.css";

export default function RoleSelect() {
  const nav = useNavigate();
  return (
    <AuthCard title="Mazer" subtitle="Select your role to begin">
      <div className={styles.stack}>
        <button className={styles.primary} onClick={() => nav("/login/instructor")}>
          I’m an Instructor
        </button>
        <button className={styles.primary} onClick={() => nav("/login/trainee")}>
          I’m a Trainee
        </button>
        <button className={styles.link} onClick={() => nav("/login/trainee")}>
          Create an account
        </button>
      </div>
    </AuthCard>
  );
}
