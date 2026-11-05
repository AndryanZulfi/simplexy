# Rencana Tugas & Implementasi: Agent Direct Flash Chat

- **Status:** COMPLETED
- **Modul:** Agent Direct Chatbot & Task Inception
- **Direktori Spec:** `docs/specs/agent-direct-chat/`

---

## Tahap 1: Fondasi Basis Data & Paket Bersama (DB & Shared Contracts)

- [x] **Task 1.1: Pembuatan Skema Tabel di `packages/db`**
  - Definisikan tabel `agent_chat_sessions` dan `agent_chat_messages` di `packages/db/src/schema/agent_direct_chats.ts`.
  - Tambahkan kolom relasi `sourceChatSessionId` dan `sourceChatMessageId` pada `packages/db/src/schema/issues.ts`.
  - Ekspor skema baru pada `packages/db/src/schema/index.ts`.
  - Jalankan migrasi basis data: `pnpm db:generate`.

- [x] **Task 1.2: Definisi Tipe & Validasi di `packages/shared`**
  - Buat tipe TypeScript untuk `AgentChatSession`, `AgentChatMessage`, dan request/response DTO di `packages/shared/src/types/agent-direct-chat.ts`.
  - Buat skema validasi Zod untuk pembuatan chat, pengiriman pesan, dan aksi promosi ke Task di `packages/shared/src/validators/agent-direct-chat.ts`.
  - Ekspor seluruh kontrak baru di `packages/shared/src/index.ts`.

---

## Tahap 2: Layanan Backend & Routing API (Server Layer)

- [x] **Task 2.1: Implementasi `agent-direct-chat.ts` Service**
  - Buat service untuk menangani pembuatan sesi obrolan, query riwayat pesan, dan persistensi token.
  - Implementasikan logika kompilasi system prompt agent (nama, peran, kemampuan, instruksi khusus) untuk model chat completions.
  - Hubungkan service ke inference gateway (Hermes API Gateway atau 9router endpoint) menggunakan stream client.

- [x] **Task 2.2: Implementasi Endpoint Routing & SSE di `server/src/routes/agent-direct-chats.ts`**
  - `POST /api/companies/:companyId/agents/:agentId/chats` (buat sesi)
  - `GET  /api/companies/:companyId/agents/:agentId/chats` (daftar sesi)
  - `GET  /api/companies/:companyId/agents/:agentId/chats/:sessionId/messages` (ambil riwayat pesan)
  - `POST /api/companies/:companyId/agents/:agentId/chats/:sessionId/messages` (kirim pesan & alirkan SSE stream)
  - `POST /api/companies/:companyId/agents/:agentId/chats/:sessionId/messages/:messageId/promote-to-task` (konversi pesan menjadi Task)

- [x] **Task 2.3: Konteks Injeksi Task Runner**
  - Pembuatan issue via promosi chat otomatis menyertakan cuplikan riwayat obrolan sebagai latar belakang tugas.

- [x] **Task 2.4: Unit & Integration Testing Backend**
  - Tulis tes otomatis untuk alur chat, autentikasi perusahaan, dan pembuatan task di `server/src/__tests__/agent-direct-chat.test.ts`.

---

## Tahap 3: Antarmuka Pengguna & Komponen UI (UI Layer)

- [x] **Task 3.1: Klien API di `ui/src/api/agentDirectChats.ts`**
  - Buat fungsi query dan mutasi data menggunakan React Query.
  - Implementasikan parser stream Server-Sent Events (SSE) untuk konsumsi respon chat real-time.

- [x] **Task 3.2: Komponen Panel Obrolan (`AgentChatDrawer.tsx`)**
  - Buat komponen drawer/modal obrolan yang muncul dari sisi kanan layar.
  - Sediakan daftar riwayat pesan dengan auto-scroll ke bawah saat token mengalir.
  - Tampilkan kartu penanda Task (*task card embed*) jika pesan sudah pernah dipromosikan menjadi Task.

- [x] **Task 3.3: Komponen Modal Konversi Task (`PromoteChatToTaskModal.tsx`)**
  - Modal ringkas untuk konfirmasi judul, deskripsi, prioritas, dan assignee sebelum task dimasukkan ke board issue.

- [x] **Task 3.4: Integrasi Titik Masuk UI**
  - Tambahkan tombol **"Kirim Pesan"** di halaman `AgentDetail.tsx`.
  - Pasang verifikasi desain token dengan `pnpm check:token-gates`.

---

## Tahap 4: Verifikasi Akhir & Validasi End-to-End

- [x] **Task 4.1: Pengujian End-to-End**
  - Build dan integrasi sukses tanpa error lintas layer (`packages/db`, `packages/shared`, `server`, dan `ui`).
- [x] **Task 4.2: Audit Kualitas & Keamanan**
  - `assertCompanyAccess` terpasang di semua endpoint routing chat.
  - Token design system verified (`pnpm check:token-gates` lulus 100%).
