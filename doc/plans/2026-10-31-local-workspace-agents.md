# Agent lokal per workspace

Status: implementasi diminta pengguna. Branch `feat/local-workspace-agents`.

## Kontrak

- Opt-in operator `SIMPLEXY_LOCAL_AGENTS_ENABLED=true`, tidak mengubah instance lama atau cloud-managed.
- Signup tetap membuat identitas. Pengguna authenticated boleh membuat organisasi tanpa menjadi instance admin hanya ketika mode ini aktif.
- Organisasi baru memperoleh satu agent PI terkelola, tanpa setup adapter atau API Key oleh anggota.
- Backend menandai `adapterConfig.managedLocalWorkspace=true`; identitas company berasal dari database/auth, bukan input client.
- UI mengikuti DESIGN.md dan token existing, Bahasa Indonesia. Tampilkan Agent lokal, bukan cloud; lokasi eksekusi bukan klaim kesiapan runtime.
- Home PI, session, memory/file kerja, dan konfigurasi credential dipisah per company. Jangan menyalin profil atau secret pribadi pengguna laptop.
- Filesystem isolation harus enforced sandbox/OS, tidak cukup cwd/prompt. Runtime fail closed jika isolasi tidak tersedia.
- Credential platform model hanya konfigurasi eksplisit operator; credential integrasi tetap company-scoped. Akses network agent tidak boleh membypass otorisasi API.

## Pembagian pemilik

- Backend worker: company creation authorization, provisioning service, tes server.
- UI worker: onboarding tanpa setup, label agent lokal, capability health additive, tes UI.
- Runtime discovery worker: evaluasi runtime PI, sandbox existing, Docker/macOS, batas keamanan.
- Parent: keputusan keamanan runtime, spec/integrasi, environment lokal terpisah, eksekusi E2E, review akhir.

## Kriteria penerimaan

1. Akun baru dapat membuat organisasi dan menemukan agent default tanpa konfigurasi manual.
2. Task benar-benar menjalankan PI terpasang dan memberikan hasil; state tersimpan hanya di workspace terkait.
3. Akun/workspace kedua tidak dapat membaca identitas/task/session/file/credential workspace pertama melalui API atau tools agent.
4. Runtime tidak menerima home personal, env secret host, command/cwd arbitrary dari anggota.
5. Kegagalan runtime dan provisioning tampil jujur dan tidak menandai agent siap tanpa bukti.
6. Feature off mempertahankan flow lama; cloud-managed tidak mendapat self-service lokal.

## Verifikasi

Tes terarah backend/UI/runtime; typecheck dan build; smoke signup dua user dan task live PI; probe adversarial filesystem/env; browser flow dan status. Full repo gates dicoba sesuai AGENTS.md. Tidak menyatakan keamanan produksi dari smoke lokal.

## Batas

Satu adapter PI dulu; tidak menambah cloud provider, billing, remote installer, atau Kubernetes. Konfigurasi profile Hermes personal tidak diubah. Jika runtime enforcement lokal tidak feasible, laporkan blocker sebelum menjalankan agent tanpa isolasi.
