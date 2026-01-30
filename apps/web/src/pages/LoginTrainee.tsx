import { useNavigate } from "react-router-dom";
import AuthCard from "../components/AuthCard";
import styles from "./Login.module.css";

export default function LoginTrainee() {
  const nav = useNavigate();

  return (
    <AuthCard title="Trainee Login">
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          nav("/chat");
        }}
      >
        <input className={styles.field} placeholder="Username" />
        <input className={styles.field} placeholder="Password" type="password" />
        <button className={styles.submit} type="submit">Submit</button>
      </form>
    </AuthCard>
  );
}
