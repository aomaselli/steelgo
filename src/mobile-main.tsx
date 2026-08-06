import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";

import "./styles.css";

const router = getRouter();

const container = document.getElementById("root");

if (!container) {
    throw new Error("Root element not found");
}

ReactDOM.createRoot(container).render(
    <React.StrictMode>
        <RouterProvider router={router} />
    </React.StrictMode>,
);