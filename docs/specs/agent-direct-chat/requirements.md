# Spesifikasi Kebutuhan: Agent Direct Flash Chat

- **Status:** DRAFT (Menunggu Review)
- **Modul:** Agent Direct Chatbot & Task Inception
- **Direktori Spec:** `docs/specs/agent-direct-chat/`

---

## 1. Latar Belakang & Masalah
Saat ini interaksi pengguna dengan agent di Simplexy hanya melalui pembuatan **Issue/Task**. Jalur ini memicu *heartbeat execution loop* lengkap: menyewa workspace (*sandbox leasing*), sinkronisasi Git worktree, dan pemuatan seluruh *skill bundle*. Hal ini memerlukan waktu 5–30 detik per interaksi.

Pengguna membutuhkan sarana komunikasi langsung (*conversational*) dengan respons instan (< 1 detik) untuk:
1. Tanya-jawab cepat dan klarifikasi instruksi agent.
2. Brainstorming ide atau solusi teknis sebelum mengeksekusi kode.
3. Mengubah hasil diskusi obrolan menjadi Task resmi di board secara langsung tanpa kehilangan konteks.

---

## 2. Kebutuhan Fungsional (Functional Requirements)

### FR-1: Sesi Chatbot Langsung (Fast-Lane Chat)
- Pengguna dapat memulai percakapan instan dengan agent tertentu langsung dari antarmuka web (drawer / dialog chat pada halaman detail agent).
- Sistem tidak boleh memicu alokasi workspace, Git checkout, atau *heartbeat run* pada percakapan langsung ini.
- Respon agent harus dialirkan secara *streaming* (*Server-Sent Events* / SSE) dengan *Time-to-First-Token* (TTFT) kurang dari 1 detik.
- Konteks dasar agent (Nama, Role, Capabilities, dan System Instructions) harus diinjeksikan secara konsisten ke dalam prompt obrolan.

### FR-2: Riwayat Percakapan (Chat Persistence)
- Percakapan dikelompokkan ke dalam sesi (`agent_chat_sessions`) dan pesan (`agent_chat_messages`).
- Riwayat percakapan tetap tersimpan dan dapat dibuka kembali oleh pengguna.
- Riwayat terisolasi per `company_id` dan per `agent_id` sesuai batasan multi-tenancy Simplexy.

### FR-3: Pembuatan Task dari Chat (Task Inception & Synchronization)
- **Inisiasi Manual:** Pengguna dapat menekan tombol **"Jadikan Task"** pada bubble pesan obrolan tertentu.
- Sistem otomatis membuka formulir pembuatan Task dengan `title` dan `description` yang terisi dari konteks obrolan terkait.
- Task yang dibuat menyimpan referensi balik ke obrolan asal (`source_chat_session_id`, `source_chat_message_id`).
- Pada bubble chat asal, muncul kartu penanda (*task reference card*) yang menampilkan nomor Task (misal: `[SIM-12]`), judul, status terkini, dan tautan langsung ke detail issue.
- Saat Task runner mengeksekusi issue tersebut, cuplikan konteks obrolan (*chat transcript snippet*) otomatis disertakan sebagai latar belakang tugas.

---

## 3. Kebutuhan Non-Fungsional (Non-Functional Requirements)

### NFR-1: Performa & Latensi
- TTFT respons pertama agent maksimal 1000ms pada koneksi jaringan stabil.
- Utilisasi resource backend harus ringan (I/O streaming tanpa blocking thread atau child process berat).

### NFR-2: Keamanan & Multi-Tenancy
- Akses ke endpoint chat wajib memvalidasi otentikasi user dan keanggotaan aktif user pada organisasi (`assertCompanyAccess`).
- Tidak boleh terjadi kebocoran riwayat obrolan antar organisasi (*company boundary isolation*).

### NFR-3: Kompatibilitas Antarmuka & Bahasa
- UI wajib mematuhi sistem token warna, tipografi, dan spasi yang didefinisikan dalam `DESIGN.md`.
- Copywriting antarmuka menggunakan Bahasa Indonesia formal produk SaaS yang lugas, ringkas, dan bebas jargon klise AI.

---

## 4. Batasan Ruang Lingkup (Out of Scope)
- Fitur ini tidak menggantikan peran Issue Board untuk pekerjaan kompleks yang membutuhkan mutasi berkas atau tools terminal.
- Mode suara (*voice chat/WebRTC*) tidak disertakan pada tahap ini.
- Pembuatan sub-task bertingkat dari satu pesan tidak didukung; satu pesan obrolan hanya dapat dipromosikan menjadi satu Task utama.
