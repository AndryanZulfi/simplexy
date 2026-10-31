# Agent lokal per workspace

Status: implementasi eksperimental, verifikasi end-to-end dan keamanan belum selesai.

## Tujuan

Pengguna membuat akun dan organisasi di instance authenticated, lalu memakai agent PI yang disediakan operator tanpa mengisi adapter atau API Key model. UI menyebut Agent lokal karena eksekusi berada pada komputer tempat Simplexy berjalan, bukan cloud.

## Konfigurasi operator

Fitur tidak aktif secara default. Lihat variabel SIMPLEXY_LOCAL_* di `.env.example`. Operator menyediakan binary PI absolut, model `provider/model`, dan konfigurasi provider PI. Jangan menyalin folder `.pi` atau `.hermes` pribadi ke workspace. Gateway model bukan bukti runtime siap.

Untuk pengujian, gunakan PAPERCLIP_HOME terpisah, deployment authenticated, public URL sesuai origin browser, dan signup aktif. Jangan gunakan local_trusted untuk menguji isolasi dua akun karena mode itu mengasumsikan operator lokal yang dipercaya.

## Alur dan pemulihan

Signup hanya membuat identitas/session. POST /api/companies membentuk organisasi, membership pemilik, dan meminta provisioning agent PI. Pengguna tidak dipromosikan menjadi instance admin.

Jika organisasi berhasil tetapi provisioning gagal, response 201 menyertakan localAgentProvisioning.status=failed. Organisasi tetap tersedia. Pemilik/admin dapat mengulang POST /api/companies/:companyId/local-agent tanpa membuat organisasi lagi. Identitas agent default deterministik per company agar retry tidak menduplikasi agent. Ini bukan transaksi atomik company + agent.

## Batas keamanan

Folder kerja, home/config PI, session, dan memory harus company-scoped. Perbedaan cwd atau prompt bukan sandbox. Runtime harus menolak eksekusi jika boundary OS tidak tersedia. Credential platform model berada pada operator; token yang terlihat agent harus dibatasi untuk workspace/run, bukan raw credential operator. Koneksi integrasi dan izin API tetap diperiksa terhadap company/actor.

Owner company pada baseline Simplexy adalah operator berhak luas. Jangan membuka fitur ini ke publik sebelum seluruh jalur eksekusi host, probe adapter, workspace command, file read, dan mutasi konfigurasi diuji untuk bypass.

## Verifikasi

- `pnpm exec vitest run server/src/__tests__/local-workspace-agents.test.ts server/src/__tests__/health.test.ts`
- `PAPERCLIP_E2E_BASE_URL=http://127.0.0.1:3105 pnpm exec playwright test --config tests/e2e/playwright-local-workspace-agents.config.ts`
- Tambahkan SIMPLEXY_E2E_LIVE_PI=true hanya dengan provider nyata yang sudah dikonfigurasi.
- `pnpm check:token-gates`
- Gate repo: `pnpm -r typecheck`, `pnpm test:run`, `pnpm build`.

Tes API dua akun tidak membuktikan sandbox filesystem. Harus ada probe pembacaan/penulisan lintas workspace, symlink, environment secret, descendant process, dan network ke layanan host yang tidak diizinkan.
