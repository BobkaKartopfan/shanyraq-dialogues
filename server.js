const http = require("http");
const { createReadStream } = require("fs");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DB_PATH = path.join(ROOT, "data", "db.json");
const sessions = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ico": "image/x-icon"
};

function uid(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(hashPassword(password, salt).split(":")[1], "hex"));
}

async function readDb() {
  try {
    return JSON.parse(await fs.readFile(DB_PATH, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const now = new Date().toISOString();
    const db = {
      users: [
        {
          id: "usr_demo",
          name: "Demo User",
          email: "demo@shanyraq.local",
          passwordHash: hashPassword("editor123"),
          createdAt: now
        }
      ],
      articles: []
    };
    await writeDb(db);
    return db;
  }
}

async function writeDb(db) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function currentUser(req, db) {
  const sessionId = parseCookies(req).sid;
  const userId = sessionId && sessions.get(sessionId);
  return userId ? db.users.find((user) => user.id === userId) : null;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email };
}

function publicArticle(article, db) {
  const author = db.users.find((user) => user.id === article.authorId);
  return { ...article, authorName: author ? author.name : "Unknown editor" };
}

function normalizeImages(body) {
  let images = [];
  if (Array.isArray(body.images)) {
    images = body.images;
  } else if (body.imagesJson) {
    try {
      const parsed = JSON.parse(body.imagesJson);
      if (Array.isArray(parsed)) images = parsed;
    } catch {
      images = [];
    }
  }

  if (!images.length && body.imageData) {
    images = [{ imageData: body.imageData, imageName: body.imageName || "" }];
  }

  return images
    .map((image) => ({
      imageData: String(image.imageData || ""),
      imageName: String(image.imageName || "").trim()
    }))
    .filter((image) => image.imageData);
}

async function handleApi(req, res) {
  const db = await readDb();

  if (req.method === "GET" && req.url === "/api/me") {
    return json(res, 200, { user: publicUser(currentUser(req, db)) });
  }

  if (req.method === "POST" && req.url === "/api/register") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    if (!name || !email || password.length < 6) {
      return json(res, 400, { error: "Name, email, and a 6+ character password are required." });
    }
    if (db.users.some((user) => user.email === email)) {
      return json(res, 409, { error: "That email is already registered." });
    }
    const user = { id: uid("usr"), name, email, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    db.users.push(user);
    await writeDb(db);
    const sessionId = uid("sid");
    sessions.set(sessionId, user.id);
    res.setHeader("Set-Cookie", `sid=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/`);
    return json(res, 201, { user: publicUser(user) });
  }

  if (req.method === "POST" && req.url === "/api/login") {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const user = db.users.find((entry) => entry.email === email);
    if (!user || !verifyPassword(String(body.password || ""), user.passwordHash)) {
      return json(res, 401, { error: "Email or password is incorrect." });
    }
    const sessionId = uid("sid");
    sessions.set(sessionId, user.id);
    res.setHeader("Set-Cookie", `sid=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/`);
    return json(res, 200, { user: publicUser(user) });
  }

  if (req.method === "POST" && req.url === "/api/logout") {
    const sessionId = parseCookies(req).sid;
    if (sessionId) sessions.delete(sessionId);
    res.setHeader("Set-Cookie", "sid=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/");
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && req.url === "/api/articles") {
    const articles = db.articles
      .slice()
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .map((article) => publicArticle(article, db));
    return json(res, 200, { articles });
  }

  if (req.method === "GET" && req.url === "/api/releases") {
    const articles = db.articles
      .filter((article) => article.status === "Published")
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .map((article) => publicArticle(article, db));
    return json(res, 200, { articles });
  }

  const user = currentUser(req, db);
  if (!user) return json(res, 401, { error: "Please log in to edit press releases." });

  if (req.method === "POST" && req.url === "/api/articles") {
    const body = await readBody(req);
    const now = new Date().toISOString();
    const article = normalizeArticle(body, {
      id: uid("art"),
      authorId: user.id,
      createdAt: now,
      updatedAt: now
    });
    db.articles.push(article);
    await writeDb(db);
    return json(res, 201, { article: publicArticle(article, db) });
  }

  const match = req.url.match(/^\/api\/articles\/([^/]+)$/);
  if (req.method === "PUT" && match) {
    const article = db.articles.find((entry) => entry.id === match[1]);
    if (!article) return json(res, 404, { error: "Press release not found." });
    Object.assign(article, normalizeArticle(await readBody(req), article), { updatedAt: new Date().toISOString() });
    await writeDb(db);
    return json(res, 200, { article: publicArticle(article, db) });
  }

  if (req.method === "DELETE" && match) {
    const articleIndex = db.articles.findIndex((entry) => entry.id === match[1]);
    if (articleIndex === -1) return json(res, 404, { error: "Press release not found." });
    const [deletedArticle] = db.articles.splice(articleIndex, 1);
    await writeDb(db);
    return json(res, 200, { article: publicArticle(deletedArticle, db), ok: true });
  }

  return json(res, 404, { error: "API route not found." });
}

function normalizeArticle(body, base) {
  const title = String(body.title || "").trim();
  const excerpt = String(body.excerpt || "").trim();
  const bodyText = String(body.body || "").trim();
  if (!title || !excerpt || !bodyText) throw Object.assign(new Error("Missing press release fields."), { statusCode: 400 });
  const images = normalizeImages(body);
  return {
    ...base,
    title,
    excerpt,
    body: bodyText,
    category: String(body.category || "News").trim() || "News",
    status: ["Draft", "Review", "Published"].includes(body.status) ? body.status : "Draft",
    images,
    imageData: images[0]?.imageData || "",
    imageName: images[0]?.imageName || ""
  };
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    const fileStat = await fs.stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not found");

    const size = fileStat.size;
    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range;

    if (range) {
      const match = range.match(/^bytes=(\d*)-(\d*)$/);
      if (!match || (!match[1] && !match[2])) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        return res.end();
      }

      let start;
      let end;
      if (!match[1]) {
        const suffixLength = Number(match[2]);
        start = Math.max(size - suffixLength, 0);
        end = size - 1;
      } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      }

      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        return res.end();
      }

      res.writeHead(206, {
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Type": contentType
      });
      if (req.method === "HEAD") return res.end();
      return createReadStream(filePath, { start, end }).pipe(res);
    }

    res.writeHead(200, {
      "Accept-Ranges": "bytes",
      "Content-Length": size,
      "Content-Type": contentType
    });
    if (req.method === "HEAD") return res.end();
    return createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) return await handleApi(req, res);
    return await serveStatic(req, res);
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : "Something went wrong." });
  }
});

server.listen(PORT, () => {
  console.log(`Shanyraq site running at http://localhost:${PORT}`);
});
