import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/600.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/600.css";

createRoot(document.getElementById("root")!).render(<App />);
