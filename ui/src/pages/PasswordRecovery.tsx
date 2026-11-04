import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { authApi, AuthApiError } from "../api/auth";
import { Button } from "@/components/ui/button";

export function PasswordRecovery({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const request = useMutation({
    mutationFn: () => authApi.requestPasswordReset(email.trim()),
    onSuccess: () => { setSent(true); setError(null); setOtp(""); setResendAt(Date.now() + 60_000); },
    onError: (err) => setError(err instanceof AuthApiError && err.status === 429
      ? "Terlalu banyak permintaan. Tunggu satu menit lalu coba lagi."
      : "Kode belum dapat dikirim. Coba lagi atau hubungi administrator."),
  });
  const reset = useMutation({
    mutationFn: () => authApi.resetPassword({ email: email.trim(), otp, password }),
    onSuccess: () => { setDone(true); setError(null); setPassword(""); setConfirmation(""); setOtp(""); },
    onError: (err) => setError(err instanceof AuthApiError && err.status === 429
      ? "Terlalu banyak percobaan. Tunggu satu menit lalu coba lagi."
      : "Kode tidak valid atau sudah kedaluwarsa. Coba lagi atau minta kode baru."),
  });
  const busy = request.isPending || reset.isPending;
  const inputClass = "w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring";
  return <>
    <h1 className="text-xl font-semibold">{done ? "Kata sandi diperbarui" : "Lupa kata sandi?"}</h1>
    <p className="mt-1 text-sm text-muted-foreground" role="status">
      {done ? "Silakan masuk dengan kata sandi baru. Semua sesi sebelumnya telah diakhiri."
        : sent ? "Jika email terdaftar, kode 6 digit akan dikirim. Kode berlaku selama 5 menit. Periksa juga folder spam."
          : "Masukkan email akun Anda untuk menerima kode reset."}
    </p>
    {!done && <form className="mt-6 space-y-4" onSubmit={(event) => {
      event.preventDefault();
      if (busy) return;
      setError(null);
      if (!sent) { request.mutate(); return; }
      if (password !== confirmation) { setError("Konfirmasi kata sandi tidak cocok."); return; }
      reset.mutate();
    }}>
      <div>
        <label htmlFor="recovery-email" className="text-xs text-muted-foreground mb-1 block">Email</label>
        <input id="recovery-email" type="email" autoComplete="username" required readOnly={sent} disabled={busy} className={inputClass} value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      {sent && <>
        <div>
          <label htmlFor="recovery-otp" className="text-xs text-muted-foreground mb-1 block">Kode OTP</label>
          <input id="recovery-otp" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required disabled={busy} className={inputClass} value={otp} onChange={e => setOtp(e.target.value)} aria-describedby={error ? "recovery-error" : undefined} />
        </div>
        <div>
          <label htmlFor="recovery-password" className="text-xs text-muted-foreground mb-1 block">Kata sandi baru</label>
          <input id="recovery-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={busy} className={inputClass} value={password} onChange={e => setPassword(e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">Gunakan 8–128 karakter.</p>
        </div>
        <div>
          <label htmlFor="recovery-confirmation" className="text-xs text-muted-foreground mb-1 block">Konfirmasi kata sandi</label>
          <input id="recovery-confirmation" type="password" autoComplete="new-password" required disabled={busy} className={inputClass} value={confirmation} onChange={e => setConfirmation(e.target.value)} />
        </div>
      </>}
      {error && <p id="recovery-error" role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Memproses…" : sent ? "Simpan kata sandi" : "Kirim kode OTP"}</Button>
      {sent && <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" disabled={busy} onClick={() => { setSent(false); setOtp(""); setError(null); }}>Ganti email</Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => {
          if (Date.now() < resendAt) { setError("Tunggu satu menit sebelum meminta kode baru."); return; }
          request.mutate();
        }}>Kirim ulang kode</Button>
      </div>}
    </form>}
    <Button type="button" variant="ghost" className="mt-5" disabled={busy} onClick={onBack}>Kembali masuk</Button>
  </>;
}
