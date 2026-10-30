import { motion } from "motion/react";
import { demoEase, heroDelays, stockAnswer, stockQuestion, useDemoSequence } from "./useDemoSequence";

export function DemoControls({ sequence }: { sequence: ReturnType<typeof useDemoSequence> }) {
  return <div className="demo-controls">
    <span>{sequence.reduced ? "Tampilan tanpa animasi" : sequence.complete ? "Simulasi selesai" : sequence.paused ? "Animasi dijeda" : "Simulasi berjalan"}</span>
    {!sequence.reduced && <><button onClick={sequence.toggle} disabled={sequence.complete} aria-pressed={sequence.paused}>{sequence.paused ? "Lanjutkan" : "Jeda"}</button><button onClick={sequence.replay}>Putar ulang</button></>}
  </div>;
}

export function StockSheet() {
  return <div className="stock-sheet"><div className="sheet-title"><span>▤</span><strong>Data stok</strong><small>SIMULASI</small></div><table><thead><tr><th>Produk</th><th>Stok</th><th>Satuan</th></tr></thead><tbody><tr><td>Produk A</td><td><strong>12</strong></td><td>dus</td></tr></tbody></table><div className="sheet-foot">✓ Data ditemukan dalam ilustrasi</div></div>;
}

export function Hero() {
  const sequence = useDemoSequence(heroDelays);
  const { step, reduced } = sequence;
  const enter = { initial: reduced ? false as const : { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: reduced ? 0 : 0.3, ease: demoEase } };
  return <section className="hero section-shell" id="demo" aria-labelledby="hero-title">
    <div className="hero-copy">
      <motion.div {...enter} className="eyebrow">Operasional bisnis, lewat percakapan</motion.div>
      <motion.h1 {...enter} transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.12, ease: demoEase }} id="hero-title">Tanya lewat chat.<br/>Bisnis tetap<br/><em>bergerak.</em></motion.h1>
      <p>Bayangkan cek stok, membaca laporan, dan mencatat data tanpa berpindah aplikasi. Kenali alur kerja Simplexy lewat satu percakapan sederhana.</p>
      <div className="hero-actions"><a className="primary-button" href="#showcase">Coba ilustrasi demo <span aria-hidden="true">↗</span></a><a className="text-link" href="#cara-kerja">Lihat cara kerja <span aria-hidden="true">↓</span></a></div>
      <p className="hero-note">Dirancang untuk kebutuhan operasional bisnis.<br/>Demo ini tidak terhubung ke sistem nyata.</p>
    </div>
    <div className="hero-stage" ref={sequence.ref} data-testid="hero-demo" data-step={step}>
      <div className="stage-caption"><span>01 / Percakapan jadi tindakan</span><span className="demo-label">Ilustrasi Demo</span></div>
      <motion.div className="phone" initial={reduced ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.15, ease: demoEase }}>
        <div className="phone-status"><span>9:41</span><span aria-hidden="true">▥ ▰</span></div>
        <div className="chat-header"><span className="chat-back" aria-hidden="true">‹</span><span className="agent-initial">S</span><div><strong>Simplexy</strong><small>Asisten bisnis · simulasi</small></div><span className="chat-menu" aria-hidden="true">···</span></div>
        <div className="conversation" aria-live="polite" aria-atomic="true">
          <span className="chat-day">Contoh percakapan</span>
          {step === 0 && <p className="empty-chat">Percakapan akan dimulai…</p>}
          {step >= 1 && <motion.div {...enter} className="bubble user-bubble">{stockQuestion}<small>09.41 ✓✓</small></motion.div>}
          {step >= 2 && step < 4 && <motion.div {...enter} className="bubble typing">{step === 2 ? "Memahami pertanyaan" : "Memeriksa data stok"}<span aria-hidden="true"> ···</span></motion.div>}
          {step >= 3 && <div className="lookup-note">✓ Workflow cek stok diizinkan</div>}
          {step >= 4 && <motion.div {...enter} className="bubble ai-bubble">{stockAnswer}<small>Data simulasi · 09.41</small></motion.div>}
        </div>
        <div className="mock-composer" aria-hidden="true"><span>Pesan dalam ilustrasi</span><span>↑</span></div>
        <div className="phone-home" />
      </motion.div>
      <div className="sheet-slot">{step >= 5 && <motion.div className="floating-sheet" initial={reduced ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.4, ease: demoEase }}><StockSheet /></motion.div>}</div>
      <DemoControls sequence={sequence} />
    </div>
  </section>;
}
