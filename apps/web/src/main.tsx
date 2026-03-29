import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { AuthProvider } from "./app/AuthProvider";
import { UploadProvider } from "./app/UploadProvider";
import UploadStatusDock from "./components/UploadStatusDock";
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <UploadProvider>
        <RouterProvider router={router} />
        <UploadStatusDock />
      </UploadProvider>
    </AuthProvider>
  </React.StrictMode>
);
