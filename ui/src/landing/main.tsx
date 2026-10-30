import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { Hero } from "./Hero";
import { Workflow } from "./Workflow";
import { Showcase } from "./Showcase";
import "./landing.css";

document.documentElement.lang = "id";
document.documentElement.classList.remove("dark");
document.documentElement.style.colorScheme = "light";
document.title = "Simplexy | Operasional bisnis lewat percakapan";

function Landing() {
  return <MotionConfig reducedMotion="user"><div className="landing"><a className="skip-link" href="#main">Lewati ke konten</a><header className="site-header section-shell"><a className="wordmark" href="/" aria-label="Simplexy beranda"><img src="/simplexy-brand-symbol.png" alt="" width="32" height="36" />Simplexy<span className="brand-period">.</span></a><nav aria-label="Navigasi utama"><a href="#cara-kerja">Cara kerja</a><a href="#showcase">Contoh penggunaan</a></nav><a className="header-action" href="/dashboard">Buka dashboard <span aria-hidden="true">↗</span></a></header><main id="main"><Hero /><Workflow /><Showcase /></main><footer className="section-shell site-footer"><a className="wordmark" href="/">Simplexy.</a><p>Lebih dekat dengan bisnis Anda.</p><span>Konsep produk · Ilustrasi Demo</span></footer></div></MotionConfig>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Simplexy root element is missing");
createRoot(root).render(<StrictMode><Landing /></StrictMode>);
