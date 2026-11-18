import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App.tsx";
import { AstraProvider } from "./context/AstraProvider.tsx";
import { MicProvider } from "./context/MicProvider.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AstraProvider>
      <MicProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MicProvider>
    </AstraProvider>
  </StrictMode>,
);
