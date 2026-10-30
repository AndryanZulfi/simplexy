import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";

export const demoEase = [0.22, 1, 0.36, 1] as const;
export const stockQuestion = "Berapa stok produk A sekarang?";
export const stockAnswer = "Berdasarkan data yang terhubung, stok produk A adalah 12 dus.";
export const heroDelays = [600, 800, 1200, 1200, 800];

export function useDemoSequence(delays: number[]) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, { amount: 0.2 });
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const remaining = useRef(delays[0]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (reduced || paused || hidden || !visible || step >= delays.length) return;
    const started = performance.now();
    let fired = false;
    const timer = window.setTimeout(() => {
      fired = true;
      remaining.current = delays[step + 1] ?? 0;
      setStep(step + 1);
    }, remaining.current);
    return () => {
      clearTimeout(timer);
      if (!fired) remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [step, paused, hidden, visible, reduced, delays, revision]);
  return {
    ref, step: reduced ? delays.length : step, paused, reduced,
    toggle: () => setPaused(value => !value),
    replay: () => { remaining.current = delays[0]; setStep(0); setPaused(false); setRevision(value => value + 1); },
    complete: reduced || step === delays.length,
  };
}
