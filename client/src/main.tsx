/**
 * Bootstrap, in the order FR-019 requires.
 *
 * The honesty statement is already in the served HTML before this file runs; React takes
 * ownership of it and renders the same words, so it is never the thing that disappears
 * while something else loads. The shell mounts immediately, with no configuration and no
 * transport. Only then is the configuration document fetched, and only if it validates
 * does a transport open.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { loadRuntimeConfig } from "./config/runtime";
import { openControlSubscription } from "./transport/mqtt";
import { HonestyBanner } from "./ui/HonestyBanner";
import "./styles.css";

const banner = document.getElementById("honesty");
if (banner !== null) {
  createRoot(banner).render(
    <StrictMode>
      <HonestyBanner />
    </StrictMode>,
  );
}

const shell = document.getElementById("root");
if (shell !== null) {
  createRoot(shell).render(
    <StrictMode>
      <App load={loadRuntimeConfig} open={openControlSubscription} />
    </StrictMode>,
  );
}
