import { motion } from "motion/react";
import { DemoControls } from "./Hero";
import { demoEase, useDemoSequence } from "./useDemoSequence";
const delays = [600, 600, 600, 600, 600];
const nodes = [
  ["WhatsApp", "Pertanyaan dikirim", "01"],
  ["AI Agent", "Maksud dipahami", "02"],
  ["Workflow yang Diizinkan", "Akses diperiksa", "03"],
  ["Data Bisnis", "Stok dibaca", "04"],
  ["Respons", "Jawaban ditampilkan", "05"],
];
export function Workflow() {
 const sequence = useDemoSequence(delays);
 return <section className="workflow-section" id="cara-kerja" aria-labelledby="workflow-title"><div className="section-shell" ref={sequence.ref} data-testid="workflow-demo" data-step={sequence.step}>
   <div className="section-heading"><div><span className="section-kicker">02 / Di balik percakapan</span><h2 id="workflow-title">Bukan sekadar menjawab.<br/>Ada alur kerja di baliknya.</h2></div><p>Dalam rancangan Simplexy, AI memahami permintaan, lalu menjalankan workflow yang diizinkan untuk mengakses data bisnis.</p></div>
   <div className="workflow-meta"><span>Skenario: cek stok Produk A</span><span className="demo-label">Ilustrasi Demo</span></div>
   <ol className="workflow-nodes">{nodes.map(([title, description, number], index) => <li key={title} className={sequence.step > index ? "is-active" : ""}>
      <motion.div className="workflow-node" animate={{ y: sequence.step > index || sequence.reduced ? 0 : 6 }} transition={{ duration: sequence.reduced ? 0 : 0.3, ease: demoEase }}><span className="node-number">{sequence.step > index ? "✓" : number}</span><h3>{title}</h3><p>{description}</p></motion.div>
      {index < nodes.length - 1 && <span className="node-connector" aria-hidden="true"><motion.span initial={false} animate={{ scaleX: sequence.step > index ? 1 : 0 }} transition={{ duration: sequence.reduced ? 0 : 0.4, ease: "easeOut" }} /></span>}
   </li>)}</ol>
   <div className="workflow-result" aria-live="polite">{sequence.complete ? <><span>Hasil simulasi</span><strong>Stok Produk A: 12 dus.</strong><span>Jawaban kembali ke percakapan.</span></> : <><span>Alur simulasi</span><strong>{sequence.step === 0 ? "Menunggu pertanyaan stok…" : nodes[Math.min(sequence.step - 1, 4)][1]}</strong></>}</div>
   <DemoControls sequence={sequence} />
   <p className="workflow-disclaimer">Visualisasi konsep. Tidak mengirim pesan WhatsApp atau mengakses database sungguhan.</p>
 </div></section>;
}
