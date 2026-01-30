import { Routes, Route, Navigate } from "react-router-dom";
import RoleSelect from "./pages/RoleSelect";
import LoginTrainee from "./pages/LoginTrainee";
import LoginInstructor from "./pages/LoginInstructor";
import Chat from "./pages/Chat";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RoleSelect />} />
      <Route path="/login/trainee" element={<LoginTrainee />} />
      <Route path="/login/instructor" element={<LoginInstructor />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
