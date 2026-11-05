# Desain Arsitektur & Antarmuka: Agent Direct Flash Chat

- **Status:** DRAFT (Menunggu Review)
- **Modul:** Agent Direct Chatbot & Task Inception
- **Direktori Spec:** `docs/specs/agent-direct-chat/`

---

## 1. Arsitektur Tingkat Tinggi (High-Level Architecture)

```
[Web Browser / UI]
   │
   ├─► POST /api/companies/:cid/agents/:aid/chats (Buat / pilih sesi)
   ├─► GET  /api/companies/:cid/agents/:aid/chats/:sid/messages (Ambil riwayat)
   ├─► POST /api/companies/:cid/agents/:aid/chats/:sid/messages (Kirim pesan -> SSE Stream)
   └─► POST /api/companies/:cid/issues (Buat Task dengan referensi chat)
   │
[Express REST API Gateway]
   │
   ├── Auth & Company Membership Guard
   ├── AgentFastChatService
   │      ├── Susun System Prompt (Nama Agent, Role, Instructions)
   │      ├── Ambil Riwayat Pesan Terakhir
   │      └── Teruskan ke Provider Router
   │
   ├── Gateway / Provider Layer
   │      ├── Hermes Gateway API (:8642) / 9router (:20128)
   │      └── Streaming SSE chunk balik ke client
   │
   └── PostgreSQL Database (Drizzle ORM)
          ├── agent_chat_sessions
          ├── agent_chat_messages
          └── issues (relasi source_chat_session_id)
```

---

## 2. Skema Basis Data (Database Schema)

### A. Tabel `agent_chat_sessions`
```typescript
export const agentChatSessions = pgTable("agent_chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("Percakapan Baru"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### B. Tabel `agent_chat_messages`
```typescript
export const agentChatMessages = pgTable("agent_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => agentChatSessions.id, { onDelete: "cascade" }),
  senderType: text("sender_type").notNull(), // 'user' | 'agent' | 'system'
  senderId: text("sender_id").notNull(),
  content: text("content").notNull(),
  createdTaskId: uuid("created_task_id").references(() => issues.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### C. Pembaruan Tabel `issues`
Menambahkan metadata referensi obrolan pada kolom skema `issues`:
- `sourceChatSessionId: uuid("source_chat_session_id")`
- `sourceChatMessageId: uuid("source_chat_message_id")`

---

## 3. Spesifikasi Kontrak API (API Contracts)

### 3.1 Daftar / Buat Sesi Chat
`POST /api/companies/:companyId/agents/:agentId/chats`
- **Request Body:** `{ title?: string }`
- **Response (201):**
  ```json
  {
    "id": "uuid-sesi",
    "companyId": "uuid-company",
    "agentId": "uuid-agent",
    "title": "Analisa Autentikasi",
    "createdAt": "2026-11-04T08:00:00Z"
  }
  ```

### 3.2 Ambil Riwayat Pesan
`GET /api/companies/:companyId/agents/:agentId/chats/:sessionId/messages`
- **Response (200):**
  ```json
  [
    {
      "id": "uuid-pesan-1",
      "senderType": "user",
      "content": "Bagaimana cara kerja caching di sistem ini?",
      "createdAt": "2026-11-04T08:01:00Z"
    },
    {
      "id": "uuid-pesan-2",
      "senderType": "agent",
      "content": "Caching menggunakan Redis pada port 6379...",
      "createdTaskId": null,
      "createdAt": "2026-11-04T08:01:02Z"
    }
  ]
  ```

### 3.3 Kirim Pesan & Terima Stream (SSE)
`POST /api/companies/:companyId/agents/:agentId/chats/:sessionId/messages`
- **Headers:** `Accept: text/event-stream`
- **Request Body:** `{ content: "Tolong jelaskan struktur foldernya" }`
- **Response (SSE Stream):**
  ```text
  event: token
  data: {"delta": "Struktur"}

  event: token
  data: {"delta": " folder terdiri dari..."}

  event: done
  data: {"messageId": "uuid-pesan-agent", "totalTokens": 42}
  ```

### 3.4 Buat Task dari Obrolan
`POST /api/companies/:companyId/agents/:agentId/chats/:sessionId/messages/:messageId/promote-to-task`
- **Request Body:**
  ```json
  {
    "title": "Optimasi Redis Caching",
    "description": "Deskripsi otomatis atau hasil suntingan pengguna",
    "priority": "medium"
  }
  ```
- **Response (201):**
  ```json
  {
    "task": {
      "id": "uuid-task",
      "identifier": "SIM-15",
      "title": "Optimasi Redis Caching",
      "status": "todo"
    },
    "message": {
      "id": "uuid-pesan-asal",
      "createdTaskId": "uuid-task"
    }
  }
  ```

---

## 4. Desain Komponen Antarmuka (UI/UX Design)

### 4.1 Titik Masuk (Entry Points)
1. **Halaman Detail Agent (`/agents/:id`)**:
   - Ditambahkan tombol aksi utama: **"Kirim Pesan"** (di samping tombol *Run now* / *Assign Task*).
   - Membuka panel geser (*Side Drawer*) atau modal obrolan berukuran lega.
2. **Global Agent Quick Switcher**:
   - Akses cepat untuk memilih agent dan langsung membuka jendela chat tanpa meninggalkan halaman saat ini.

### 4.2 Tata Letak Jendela Chat (*Drawer Layout*)
- **Header**: Avatar agent, nama agent, label role/spesialisasi, dan tombol tutup.
- **Message List**:
  - Bubble pesan pengguna: rata kanan, berlatar token `--accent`.
  - Bubble pesan agent: rata kiri, berlatar token `--card`, mendukung rendering Markdown, blok kode bersintaks, dan tombol salin.
  - Kartu Tautan Task: Jika pesan telah dijadikan task, muncul embed card bertuliskan nomor issue, status terkini, dan tombol navigasi langsung ke board.
- **Aksi pada Pesan Agent**:
  - Tombol kecil di bawah bubble agent: **"Jadikan Task"** (ikon checklist).
- **Footer**:
  - Area input teks multiline dengan *shortcut* `Enter` untuk mengirim dan `Shift+Enter` untuk baris baru.
  - Indikator status pengetikan ketika streaming aktif (*Agent sedang mengetik...*).

### 4.3 Modal Pembuatan Task (*Promote Modal*)
- Terbuka otomatis saat tombol "Jadikan Task" ditekan.
- Bidang isian:
  - **Judul Task**: Otomatis mengekstrak baris pertama / inti pesan.
  - **Deskripsi**: Merangkum konteks tanya jawab sebelumnya.
  - **Prioritas**: Low / Medium / High / Urgent.
- Tombol footer: "Batal" (kiri) dan "Buat Task" (kanan).
