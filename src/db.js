import pg from "pg";

/* ---------- Ket noi co so du lieu ----------
   Dung Postgres neu co DATABASE_URL hop le.
   Neu khong co hoac khong ket noi duoc, tu dong dung bo nho trong (in-memory)
   de ung dung luon hoat dong tron tru tren moi moi truong. */

let pool = null;

if (process.env.DATABASE_URL) {
  try {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000,
    });
    await pool.query("SELECT 1");
    console.log("[CSDL] Đang dùng Postgres — dữ liệu được lưu lâu dài, đồng bộ.");
    await initPostgresSchema(pool);
  } catch (err) {
    console.warn(`[CSDL] Không kết nối được Postgres (${err.message}) — chuyển sang bộ nhớ tạm (in-memory).`);
    pool = null;
  }
} else {
  console.log("[CSDL] Chưa có DATABASE_URL — đang dùng bộ nhớ tạm (in-memory) với dữ liệu mẫu.");
}

async function initPostgresSchema(p) {
  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      phone      TEXT NOT NULL,
      email      TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS books (
      id         SERIAL PRIMARY KEY,
      book_code  TEXT NOT NULL UNIQUE,
      book_name  TEXT,
      author     TEXT,
      category   TEXT,
      status     TEXT NOT NULL DEFAULT 'available'
    );

    CREATE TABLE IF NOT EXISTS borrow_records (
      id                 SERIAL PRIMARY KEY,
      user_id            INTEGER NOT NULL REFERENCES users(id),
      book_id            INTEGER NOT NULL REFERENCES books(id),
      borrow_date        TEXT NOT NULL,
      due_date           TEXT NOT NULL,
      actual_return_date TEXT,
      status             TEXT NOT NULL DEFAULT 'borrowing',
      confirmed_by       TEXT,
      confirmed_at       TEXT,
      created_at         TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id                SERIAL PRIMARY KEY,
      borrow_record_id  INTEGER REFERENCES borrow_records(id) ON DELETE CASCADE,
      type              TEXT NOT NULL,
      rule_key          TEXT NOT NULL,
      run_date          TEXT NOT NULL,
      recipient         TEXT NOT NULL,
      subject           TEXT,
      body              TEXT NOT NULL,
      sent_at           TEXT,
      status            TEXT NOT NULL,
      error_message     TEXT,
      UNIQUE (borrow_record_id, type, rule_key, run_date)
    );

    CREATE INDEX IF NOT EXISTS idx_borrow_status ON borrow_records(status, due_date);
    CREATE INDEX IF NOT EXISTS idx_notif_status  ON notifications(status);

    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt TEXT;
  `);
}

/* ---------- In-Memory Database (Fallback) ---------- */
function getOffsetDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const mem = {
  nextUserId: 4,
  nextBookId: 7,
  nextBorrowId: 4,
  nextNotifId: 2,
  users: [
    { id: 1, name: "Nguyễn Văn An", phone: "0912345678", email: "an.nguyen@gmail.com", created_at: new Date(Date.now() - 10 * 86400000).toISOString(), password_hash: null, password_salt: null },
    { id: 2, name: "Trần Thị Bình", phone: "0987654321", email: "binh.tran@gmail.com", created_at: new Date(Date.now() - 8 * 86400000).toISOString(), password_hash: null, password_salt: null },
    { id: 3, name: "Lê Hoàng Cường", phone: "0901234567", email: "cuong.le@gmail.com", created_at: new Date(Date.now() - 15 * 86400000).toISOString(), password_hash: null, password_salt: null },
  ],
  books: [
    { id: 1, book_code: "TV001", book_name: "Dế Mèn phiêu lưu ký", author: "Tô Hoài", category: "Truyện thiếu nhi", status: "borrowed" },
    { id: 2, book_code: "TV002", book_name: "Cho tôi xin một vé đi tuổi thơ", author: "Nguyễn Nhật Ánh", category: "Văn học", status: "borrowed" },
    { id: 3, book_code: "TV003", book_name: "Tuổi thơ dữ dội", author: "Phùng Quán", category: "Tiểu thuyết lịch sử", status: "available" },
    { id: 4, book_code: "TV004", book_name: "Hoàng tử bé", author: "Antoine de Saint-Exupéry", category: "Văn học nước ngoài", status: "available" },
    { id: 5, book_code: "TV005", book_name: "Đất rừng phương Nam", author: "Đoàn Giỏi", category: "Truyện phiêu lưu", status: "available" },
    { id: 6, book_code: "TV006", book_name: "Kính vạn hoa (Tập 1)", author: "Nguyễn Nhật Ánh", category: "Học đường", status: "available" },
  ],
  borrow_records: [
    {
      id: 1, user_id: 1, book_id: 1,
      borrow_date: getOffsetDate(-5), due_date: getOffsetDate(2),
      actual_return_date: null, status: "borrowing", confirmed_by: null, confirmed_at: null,
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      id: 2, user_id: 2, book_id: 2,
      borrow_date: getOffsetDate(-7), due_date: getOffsetDate(0),
      actual_return_date: null, status: "borrowing", confirmed_by: null, confirmed_at: null,
      created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    },
    {
      id: 3, user_id: 3, book_id: 3,
      borrow_date: getOffsetDate(-14), due_date: getOffsetDate(-4),
      actual_return_date: getOffsetDate(-4), status: "returned", confirmed_by: "Quản trị viên",
      confirmed_at: new Date(Date.now() - 4 * 86400000).toISOString(),
      created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    },
  ],
  notifications: [
    {
      id: 1, borrow_record_id: 1, type: "email", rule_key: "truoc3",
      run_date: getOffsetDate(-1), recipient: "an.nguyen@gmail.com",
      subject: "🔔 Thông báo hạn trả sách – TV001",
      body: "Xin chào Nguyễn Văn An,\nBạn đang mượn sách có mã TV001 (Dế Mèn phiêu lưu ký).\nVui lòng trả sách đúng thời hạn.",
      sent_at: null, status: "unconfigured", error_message: "Chưa cấu hình Email",
    },
  ],
};

function executeInMemory(sql, args = []) {
  const norm = sql.trim().replace(/\s+/g, " ");

  if (norm.startsWith("SELECT book_code, book_name, author, category, status FROM books")) {
    const rows = mem.books.slice()
      .sort((a, b) => a.book_code.localeCompare(b.book_code))
      .map((b) => ({ book_code: b.book_code, book_name: b.book_name, author: b.author, category: b.category, status: b.status }));
    return { rows };
  }

  if (norm.startsWith("SELECT * FROM books WHERE id =")) {
    const id = Number(args[0]);
    const b = mem.books.find((item) => item.id === id);
    return { rows: b ? [{ ...b }] : [] };
  }

  if (norm.startsWith("SELECT * FROM books ORDER BY book_code")) {
    const rows = mem.books.slice().sort((a, b) => a.book_code.localeCompare(b.book_code));
    return { rows };
  }

  if (norm.includes("COUNT(*)") && norm.includes("FROM books")) {
    return { rows: [{ n: mem.books.length }] };
  }

  if (norm.startsWith("UPDATE users SET name=?, phone=?, email=? WHERE id=?")) {
    const [name, phone, email, id] = args;
    const u = mem.users.find((item) => item.id === Number(id));
    if (u) { u.name = name; u.phone = phone; u.email = email; }
    return { rows: [] };
  }

  if (norm.startsWith("UPDATE borrow_records SET borrow_date=?, due_date=? WHERE id=?")) {
    const [borrow_date, due_date, id] = args;
    const r = mem.borrow_records.find((item) => item.id === Number(id));
    if (r) { r.borrow_date = borrow_date; r.due_date = due_date; }
    return { rows: [] };
  }

  if (norm.startsWith("DELETE FROM notifications WHERE borrow_record_id = ?")) {
    const bid = Number(args[0]);
    mem.notifications = mem.notifications.filter((n) => n.borrow_record_id !== bid);
    return { rows: [] };
  }

  if (norm.startsWith("DELETE FROM borrow_records WHERE id = ?")) {
    const id = Number(args[0]);
    mem.borrow_records = mem.borrow_records.filter((r) => r.id !== id);
    return { rows: [] };
  }

  if (norm.startsWith("UPDATE books SET status='available' WHERE id=?")) {
    const id = Number(args[0]);
    const b = mem.books.find((item) => item.id === id);
    if (b) b.status = "available";
    return { rows: [] };
  }

  if (norm.startsWith("UPDATE books SET status = ? WHERE id = ?")) {
    const [status, id] = args;
    const b = mem.books.find((item) => item.id === Number(id));
    if (b) b.status = status;
    return { rows: [] };
  }

  return { rows: [] };
}

export const db = {
  async execute(input) {
    const { sql, args = [] } = typeof input === "string" ? { sql: input } : (input || {});
    if (pool) {
      let i = 0;
      const pgSql = sql.replace(/\?/g, () => `$${++i}`);
      const res = await pool.query(pgSql, args);
      return { rows: res.rows };
    }
    return executeInMemory(sql, args);
  },
};

async function all(sql, args = []) {
  return (await db.execute({ sql, args })).rows;
}
async function one(sql, args = []) {
  return (await all(sql, args))[0];
}
async function runReturningId(sql, args = []) {
  const row = await one(sql, args);
  return row ? Number(row.id) : null;
}

/* ---------- Tai khoan nguoi muon ---------- */
export async function findAccountByIdentifier(identifier) {
  const v = String(identifier || "").trim().toLowerCase();
  if (pool) {
    return one(
      "SELECT * FROM users WHERE (phone = ? OR email = ?) AND password_hash IS NOT NULL",
      [String(identifier || "").trim(), v]
    );
  }
  const u = mem.users.find(
    (item) =>
      (item.phone === String(identifier || "").trim() || item.email.toLowerCase() === v) &&
      item.password_hash != null
  );
  return u ? { ...u } : undefined;
}

export async function findUserByContact(phone, email) {
  if (pool) {
    return one("SELECT * FROM users WHERE phone = ? AND email = ?", [phone, email]);
  }
  const u = mem.users.find((item) => item.phone === phone && item.email.toLowerCase() === String(email).toLowerCase());
  return u ? { ...u } : undefined;
}

export async function createAccount({ name, phone, email, hash, salt }) {
  if (pool) {
    const existing = await findUserByContact(phone, email);
    if (existing) {
      if (existing.password_hash) {
        const err = new Error("Số điện thoại hoặc Gmail này đã có tài khoản. Hãy đăng nhập.");
        err.code = "ACCOUNT_EXISTS";
        throw err;
      }
      await db.execute({
        sql: "UPDATE users SET name=?, password_hash=?, password_salt=? WHERE id=?",
        args: [name, hash, salt, existing.id],
      });
      return Number(existing.id);
    }
    return runReturningId(
      "INSERT INTO users (name, phone, email, created_at, password_hash, password_salt) VALUES (?,?,?,?,?,?) RETURNING id",
      [name, phone, email, new Date().toISOString(), hash, salt]
    );
  }

  const existing = await findUserByContact(phone, email);
  if (existing) {
    if (existing.password_hash) {
      const err = new Error("Số điện thoại hoặc Gmail này đã có tài khoản. Hãy đăng nhập.");
      err.code = "ACCOUNT_EXISTS";
      throw err;
    }
    existing.name = name;
    existing.password_hash = hash;
    existing.password_salt = salt;
    return existing.id;
  }

  const id = mem.nextUserId++;
  mem.users.push({
    id,
    name,
    phone,
    email: email.toLowerCase(),
    created_at: new Date().toISOString(),
    password_hash: hash,
    password_salt: salt,
  });
  return id;
}

export async function getUserById(id) {
  if (pool) {
    return one("SELECT id, name, phone, email, created_at FROM users WHERE id = ?", [id]);
  }
  const u = mem.users.find((item) => item.id === Number(id));
  return u ? { id: u.id, name: u.name, phone: u.phone, email: u.email, created_at: u.created_at } : undefined;
}

/* ---------- Nguoi muon (admin ghi ho) ---------- */
export async function upsertUser({ name, phone, email }) {
  if (pool) {
    const found = await one("SELECT id FROM users WHERE phone = ? AND email = ?", [phone, email]);
    if (found) {
      await db.execute({ sql: "UPDATE users SET name = ? WHERE id = ?", args: [name, found.id] });
      return Number(found.id);
    }
    return runReturningId(
      "INSERT INTO users (name, phone, email, created_at) VALUES (?,?,?,?) RETURNING id",
      [name, phone, email, new Date().toISOString()]
    );
  }

  const found = mem.users.find(
    (item) => item.phone === phone && item.email.toLowerCase() === String(email).toLowerCase()
  );
  if (found) {
    found.name = name;
    return found.id;
  }
  const id = mem.nextUserId++;
  mem.users.push({
    id,
    name,
    phone,
    email: String(email).toLowerCase(),
    created_at: new Date().toISOString(),
    password_hash: null,
    password_salt: null,
  });
  return id;
}

/* ---------- Kho sach ---------- */
export async function upsertBook({ book_code, book_name, author, category }) {
  const code = String(book_code).trim().toUpperCase();
  if (pool) {
    const found = await one("SELECT id FROM books WHERE book_code = ?", [code]);
    if (found) {
      await db.execute({
        sql: "UPDATE books SET book_name = COALESCE(NULLIF(?,''), book_name), author = COALESCE(NULLIF(?,''), author), category = COALESCE(NULLIF(?,''), category) WHERE id = ?",
        args: [book_name || "", author || "", category || "", found.id],
      });
      return Number(found.id);
    }
    return runReturningId(
      "INSERT INTO books (book_code, book_name, author, category, status) VALUES (?,?,?,?, 'available') RETURNING id",
      [code, book_name || "", author || "", category || ""]
    );
  }

  const found = mem.books.find((item) => item.book_code === code);
  if (found) {
    if (book_name) found.book_name = book_name;
    if (author) found.author = author;
    if (category) found.category = category;
    return found.id;
  }
  const id = mem.nextBookId++;
  mem.books.push({
    id,
    book_code: code,
    book_name: book_name || "",
    author: author || "",
    category: category || "",
    status: "available",
  });
  return id;
}

export async function setBookStatus(bookId, status) {
  if (pool) {
    await db.execute({ sql: "UPDATE books SET status = ? WHERE id = ?", args: [status, bookId] });
    return;
  }
  const b = mem.books.find((item) => item.id === Number(bookId));
  if (b) b.status = status;
}

export async function isBookBorrowed(code) {
  if (pool) {
    const row = await one(`
      SELECT r.id FROM borrow_records r
      JOIN books b ON b.id = r.book_id
      WHERE UPPER(b.book_code) = UPPER(?) AND r.status = 'borrowing' LIMIT 1`, [code]);
    return !!row;
  }
  const b = mem.books.find((item) => item.book_code.toUpperCase() === String(code).trim().toUpperCase());
  if (!b) return false;
  return mem.borrow_records.some((r) => r.book_id === b.id && r.status === "borrowing");
}

/* ---------- Luot muon ---------- */
function enrichBorrow(r) {
  const u = mem.users.find((item) => item.id === r.user_id) || {};
  const b = mem.books.find((item) => item.id === r.book_id) || {};
  return {
    ...r,
    name: u.name || "",
    phone: u.phone || "",
    email: u.email || "",
    book_code: b.book_code || "",
    book_name: b.book_name || "",
  };
}

export async function listBorrows() {
  if (pool) {
    return all(`
      SELECT r.*, u.name, u.phone, u.email, b.book_code, b.book_name
      FROM borrow_records r
      JOIN users u ON u.id = r.user_id
      JOIN books b ON b.id = r.book_id
      ORDER BY r.created_at DESC`);
  }
  return mem.borrow_records
    .slice()
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .map(enrichBorrow);
}

export async function getBorrow(id) {
  if (pool) {
    return one(`
      SELECT r.*, u.name, u.phone, u.email, b.book_code, b.book_name
      FROM borrow_records r
      JOIN users u ON u.id = r.user_id
      JOIN books b ON b.id = r.book_id
      WHERE r.id = ?`, [id]);
  }
  const r = mem.borrow_records.find((item) => item.id === Number(id));
  return r ? enrichBorrow(r) : undefined;
}

export async function activeBorrows() {
  if (pool) {
    return all(`
      SELECT r.*, u.name, u.phone, u.email, b.book_code, b.book_name
      FROM borrow_records r
      JOIN users u ON u.id = r.user_id
      JOIN books b ON b.id = r.book_id
      WHERE r.status = 'borrowing'`);
  }
  return mem.borrow_records.filter((r) => r.status === "borrowing").map(enrichBorrow);
}

export async function createBorrow(input) {
  const { name, phone, email, book_code, book_name, borrow_date, due_date } = input;
  if (await isBookBorrowed(book_code)) {
    const err = new Error(`Mã sách ${book_code} đang được người khác mượn.`);
    err.code = "BOOK_BUSY";
    throw err;
  }
  const userId = await upsertUser({ name, phone, email });
  const bookId = await upsertBook({ book_code, book_name, author: "", category: "" });

  if (pool) {
    const id = await runReturningId(`INSERT INTO borrow_records
      (user_id, book_id, borrow_date, due_date, status, created_at)
      VALUES (?,?,?,?, 'borrowing', ?) RETURNING id`,
      [userId, bookId, borrow_date, due_date, new Date().toISOString()]);
    await setBookStatus(bookId, "borrowed");
    return id;
  }

  const id = mem.nextBorrowId++;
  mem.borrow_records.push({
    id,
    user_id: userId,
    book_id: bookId,
    borrow_date,
    due_date,
    actual_return_date: null,
    status: "borrowing",
    confirmed_by: null,
    confirmed_at: null,
    created_at: new Date().toISOString(),
  });
  await setBookStatus(bookId, "borrowed");
  return id;
}

export async function createBorrowForAccount(userId, { book_code, book_name, borrow_date, due_date }) {
  if (await isBookBorrowed(book_code)) {
    const err = new Error(`Mã sách ${book_code} đang được người khác mượn.`);
    err.code = "BOOK_BUSY";
    throw err;
  }
  const bookId = await upsertBook({ book_code, book_name, author: "", category: "" });

  if (pool) {
    const id = await runReturningId(`INSERT INTO borrow_records
      (user_id, book_id, borrow_date, due_date, status, created_at)
      VALUES (?,?,?,?, 'borrowing', ?) RETURNING id`,
      [userId, bookId, borrow_date, due_date, new Date().toISOString()]);
    await setBookStatus(bookId, "borrowed");
    return id;
  }

  const id = mem.nextBorrowId++;
  mem.borrow_records.push({
    id,
    user_id: Number(userId),
    book_id: bookId,
    borrow_date,
    due_date,
    actual_return_date: null,
    status: "borrowing",
    confirmed_by: null,
    confirmed_at: null,
    created_at: new Date().toISOString(),
  });
  await setBookStatus(bookId, "borrowed");
  return id;
}

export async function myBorrows(userId) {
  if (pool) {
    return all(`
      SELECT r.*, u.name, u.phone, u.email, b.book_code, b.book_name
      FROM borrow_records r
      JOIN users u ON u.id = r.user_id
      JOIN books b ON b.id = r.book_id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC`, [userId]);
  }
  return mem.borrow_records
    .filter((r) => r.user_id === Number(userId))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .map(enrichBorrow);
}

export async function markReturned(id, { actual_return_date, confirmed_by }) {
  const rec = await getBorrow(id);
  if (!rec) return null;

  if (pool) {
    await db.execute({
      sql: `UPDATE borrow_records
        SET status='returned', actual_return_date=?, confirmed_by=?, confirmed_at=?
        WHERE id = ?`,
      args: [actual_return_date, confirmed_by || "Quản trị viên", new Date().toISOString(), id],
    });
    await setBookStatus(rec.book_id, "available");
    return getBorrow(id);
  }

  const r = mem.borrow_records.find((item) => item.id === Number(id));
  if (r) {
    r.status = "returned";
    r.actual_return_date = actual_return_date;
    r.confirmed_by = confirmed_by || "Quản trị viên";
    r.confirmed_at = new Date().toISOString();
  }
  await setBookStatus(rec.book_id, "available");
  return getBorrow(id);
}

/* ---------- Thong bao ---------- */
export async function queueNotification(row) {
  if (pool) {
    try {
      return await runReturningId(`INSERT INTO notifications
        (borrow_record_id, type, rule_key, run_date, recipient, subject, body, status)
        VALUES (?,?,?,?,?,?,?, 'pending') RETURNING id`,
        [row.borrow_record_id, row.type, row.rule_key, row.run_date, row.recipient, row.subject ?? null, row.body]);
    } catch (e) {
      if (e.code === "23505") return null;
      throw e;
    }
  }

  const duplicate = mem.notifications.some(
    (n) =>
      n.borrow_record_id === row.borrow_record_id &&
      n.type === row.type &&
      n.rule_key === row.rule_key &&
      n.run_date === row.run_date
  );
  if (duplicate) return null;

  const id = mem.nextNotifId++;
  mem.notifications.push({
    id,
    borrow_record_id: row.borrow_record_id,
    type: row.type,
    rule_key: row.rule_key,
    run_date: row.run_date,
    recipient: row.recipient,
    subject: row.subject ?? null,
    body: row.body,
    sent_at: null,
    status: "pending",
    error_message: null,
  });
  return id;
}

export async function pendingNotifications() {
  if (pool) {
    return all("SELECT * FROM notifications WHERE status = 'pending' ORDER BY id");
  }
  return mem.notifications.filter((n) => n.status === "pending").sort((a, b) => a.id - b.id);
}

export async function markNotification(id, status, errorMessage) {
  if (pool) {
    await db.execute({
      sql: "UPDATE notifications SET status = ?, sent_at = ?, error_message = ? WHERE id = ?",
      args: [status, status === "sent" ? new Date().toISOString() : null, errorMessage || null, id],
    });
    return;
  }
  const n = mem.notifications.find((item) => item.id === Number(id));
  if (n) {
    n.status = status;
    n.sent_at = status === "sent" ? new Date().toISOString() : null;
    n.error_message = errorMessage || null;
  }
}

export async function listNotifications() {
  if (pool) {
    return all(`
      SELECT n.*, u.name AS to_name FROM notifications n
      LEFT JOIN borrow_records r ON r.id = n.borrow_record_id
      LEFT JOIN users u ON u.id = r.user_id
      ORDER BY n.id DESC LIMIT 300`);
  }
  return mem.notifications
    .slice()
    .sort((a, b) => b.id - a.id)
    .slice(0, 300)
    .map((n) => {
      const r = mem.borrow_records.find((item) => item.id === n.borrow_record_id);
      const u = r ? mem.users.find((item) => item.id === r.user_id) : null;
      return { ...n, to_name: u ? u.name : "" };
    });
}
