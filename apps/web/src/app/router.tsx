import { createBrowserRouter, Navigate } from "react-router-dom";
import { Home } from "./Home";
import { RequireAuth } from "./RequireAuth";
import { RequireRole } from "./RequireRole";
import LoginTrainee from "../pages/LoginTrainee";
import LoginInstructor from "../pages/LoginInstructor";
import LoginAdmin from "../pages/LoginAdmin";
import Register from "../pages/Register";
import Admin from "../pages/Admin";
import AdminUpload from "../pages/AdminUpload";
import Chat from "../pages/Chat";
import Dashboard from "../pages/Dashboard";
import Library from "../pages/Library";
import InstructorSettings from "../pages/InstructorSettings";

export const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  { path: "/login/trainee", element: <LoginTrainee /> },
  { path: "/login/instructor", element: <LoginInstructor /> },
  { path: "/login/admin", element: <LoginAdmin /> },
  { path: "/register", element: <Register /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/chat", element: <Chat /> },
      { path: "/library", element: <Library /> },
      {
        element: <RequireRole allowedRoles={["instructor"]} />,
        children: [{ path: "/instructor/settings", element: <InstructorSettings /> }],
      },
      {
        element: <RequireRole allowedRoles={["admin"]} />,
        children: [
          { path: "/admin", element: <Admin /> },
          { path: "/admin/upload", element: <AdminUpload /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
