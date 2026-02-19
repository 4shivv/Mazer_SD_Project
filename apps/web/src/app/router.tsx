import { createBrowserRouter, Navigate } from "react-router-dom";
import { Home } from "./Home";
import { RequireAuth } from "./RequireAuth";
import { RequireAdmin } from "./RequireAdmin";
import LoginTrainee from "../pages/LoginTrainee";
import LoginInstructor from "../pages/LoginInstructor";
import Register from "../pages/Register";
import Admin from "../pages/Admin";
import AdminUpload from "../pages/AdminUpload";
import Chat from "../pages/Chat";
import Dashboard from "../pages/Dashboard";

export const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  { path: "/login/trainee", element: <LoginTrainee /> },
  { path: "/login/instructor", element: <LoginInstructor /> },
  { path: "/register", element: <Register /> },

  {
    element: <RequireAuth />,
    children: [
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/chat", element: <Chat /> },

      {
        element: <RequireAdmin />,
        children: [
          { path: "/admin", element: <Admin /> },
          { path: "/admin/upload", element: <AdminUpload /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

