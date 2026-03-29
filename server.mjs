import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "public");
const dataFile = join(__dirname, "data", "projects.json");
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3010);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const defaultProjectDescription =
  "Совместная доска для проектирования экранов, быстрых сценариев и UI-идей.";

const viewportPresets = {
  phone: 390,
  tablet: 768,
  desktop: 1180,
};

const sseClients = new Map();
let writeQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "project";
}

function createBlock(type, overrides = {}) {
  const id = randomUUID();

  const templates = {
    hero: {
      type,
      id,
      eyebrow: "Идея экрана",
      title: "Убедительный первый экран",
      body: "Собери главное сообщение, короткое пояснение и два ясных действия.",
      primaryAction: "Начать",
      secondaryAction: "Посмотреть демо",
      note: "Сильный верхний блок",
      items: ["Быстрый оффер", "Короткая подводка", "Контрастный CTA"],
      align: "left",
    },
    featureGrid: {
      type,
      id,
      eyebrow: "Преимущества",
      title: "Три причины выбрать этот продукт",
      body: "Сетка карточек хорошо работает для фич, тарифов и шагов сценария.",
      primaryAction: "",
      secondaryAction: "",
      note: "3 карточки",
      items: ["Совместная работа", "Быстрая правка блоков", "Понятная структура"],
      align: "left",
    },
    stats: {
      type,
      id,
      eyebrow: "Цифры",
      title: "Доверие через метрики",
      body: "Покажи сильные числа, чтобы зафиксировать ценность.",
      primaryAction: "",
      secondaryAction: "",
      note: "Ключевые показатели",
      items: ["24h запуск", "12 команд", "98% понятности макета"],
      align: "center",
    },
    split: {
      type,
      id,
      eyebrow: "Сценарий",
      title: "Текст слева, смысловой акцент справа",
      body: "Хорошо подходит для шагов процесса, onboarding и explainers.",
      primaryAction: "Открыть флоу",
      secondaryAction: "",
      note: "Сплит-блок",
      items: ["Краткий план", "Подсветка рисков", "Один главный CTA"],
      align: "left",
    },
    quote: {
      type,
      id,
      eyebrow: "Отзыв",
      title: "“Команда смогла согласовать экран за один созвон”",
      body: "Короткая цитата добавляет доверия и снимает сомнения.",
      primaryAction: "",
      secondaryAction: "",
      note: "Ирина, product lead",
      items: ["Совместное редактирование", "Быстрые комментарии"],
      align: "center",
    },
    cta: {
      type,
      id,
      eyebrow: "Следующий шаг",
      title: "Соберите экран и отправьте ссылку друзьям",
      body: "Один проект, несколько экранов, живая синхронизация без лишней настройки.",
      primaryAction: "Создать проект",
      secondaryAction: "Поделиться ссылкой",
      note: "Финальный CTA",
      items: ["Работает в браузере", "Обновляется вживую"],
      align: "center",
    },
    footer: {
      type,
      id,
      eyebrow: "Подвал",
      title: "Ссылки и финальные акценты",
      body: "Используй этот блок для навигации, вторичных ссылок и короткой подписи.",
      primaryAction: "",
      secondaryAction: "",
      note: "Контакты и ссылки",
      items: ["Документация", "Pricing", "Контакты"],
      align: "left",
    },
  };

  return { ...templates[type], ...overrides };
}

function createScreen(name = "Главный экран", viewport = "desktop") {
  const createdAt = nowIso();
  return {
    id: randomUUID(),
    name,
    viewport,
    width: viewportPresets[viewport] || viewportPresets.desktop,
    palette: "ember",
    updatedAt: createdAt,
    updatedBy: "System",
    blocks: [
      createBlock("hero"),
      createBlock("stats"),
      createBlock("featureGrid"),
      createBlock("cta"),
    ],
  };
}

function createProject(name, description = defaultProjectDescription) {
  const createdAt = nowIso();
  return {
    id: randomUUID(),
    slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    description,
    createdAt,
    updatedAt: createdAt,
    screens: [createScreen()],
    comments: [],
  };
}

async function ensureDataFile() {
  await mkdir(dirname(dataFile), { recursive: true });
  if (!existsSync(dataFile)) {
    await writeFile(dataFile, JSON.stringify({ projects: [] }, null, 2));
  }
}

async function readStore() {
  await ensureDataFile();
  const raw = await readFile(dataFile, "utf8");
  return JSON.parse(raw);
}

async function writeStore(store) {
  await ensureDataFile();
  await writeFile(dataFile, JSON.stringify(store, null, 2));
}

async function mutateStore(mutator) {
  const pending = writeQueue.catch(() => undefined).then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  });

  writeQueue = pending.then(
    () => undefined,
    () => undefined,
  );

  return pending;
}

function getProjectOrThrow(store, projectId) {
  const project = store.projects.find((item) => item.id === projectId);
  if (!project) {
    const error = new Error("Project not found");
    error.statusCode = 404;
    throw error;
  }
  return project;
}

function getProjectBySlug(store, slug) {
  return store.projects.find((item) => item.slug === slug) || null;
}

function getScreenOrThrow(project, screenId) {
  const screen = project.screens.find((item) => item.id === screenId);
  if (!screen) {
    const error = new Error("Screen not found");
    error.statusCode = 404;
    throw error;
  }
  return screen;
}

function broadcastProjectEvent(projectId, payload) {
  const clients = sseClients.get(projectId) || [];
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const response of clients) {
    response.write(message);
  }
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(data));
}

function sendError(response, error) {
  const statusCode = error.statusCode || 500;
  sendJson(response, statusCode, {
    error: error.message || "Unexpected server error",
  });
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        const error = new Error("Invalid JSON body");
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sanitizeString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function sanitizeItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeString(item))
    .filter(Boolean)
    .slice(0, 8);
}

function sanitizeBlock(block) {
  return {
    id: sanitizeString(block?.id) || randomUUID(),
    type: sanitizeString(block?.type) || "hero",
    eyebrow: sanitizeString(block?.eyebrow),
    title: sanitizeString(block?.title),
    body: sanitizeString(block?.body),
    primaryAction: sanitizeString(block?.primaryAction),
    secondaryAction: sanitizeString(block?.secondaryAction),
    note: sanitizeString(block?.note),
    align: sanitizeString(block?.align) === "center" ? "center" : "left",
    items: sanitizeItems(block?.items),
  };
}

function sanitizeScreenPatch(payload) {
  const patch = {};

  if (payload.name !== undefined) {
    patch.name = sanitizeString(payload.name).slice(0, 80) || "Новый экран";
  }

  if (payload.viewport !== undefined) {
    const viewport = sanitizeString(payload.viewport);
    patch.viewport = viewportPresets[viewport] ? viewport : "desktop";
    patch.width = viewportPresets[patch.viewport];
  }

  if (payload.palette !== undefined) {
    patch.palette = sanitizeString(payload.palette) || "ember";
  }

  if (payload.updatedBy !== undefined) {
    patch.updatedBy = sanitizeString(payload.updatedBy).slice(0, 32) || "Guest";
  }

  if (payload.blocks !== undefined) {
    patch.blocks = Array.isArray(payload.blocks)
      ? payload.blocks.map(sanitizeBlock).slice(0, 24)
      : [];
  }

  return patch;
}

async function serveStaticFile(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = join(publicDir, normalizedPath);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return false;
    }

    const ext = extname(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=300",
    });
    createReadStream(filePath).pipe(response);
    return true;
  } catch {
    return false;
  }
}

async function serveAppShell(response) {
  const html = await readFile(join(publicDir, "index.html"), "utf8");
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const { pathname } = url;

    if (request.method === "GET" && pathname === "/health") {
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === "GET" && pathname === "/api/projects") {
      const store = await readStore();
      const projects = store.projects
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((project) => ({
          id: project.id,
          slug: project.slug,
          name: project.name,
          description: project.description,
          updatedAt: project.updatedAt,
          screenCount: project.screens.length,
          commentCount: project.comments.length,
        }));
      return sendJson(response, 200, { projects });
    }

    if (request.method === "POST" && pathname === "/api/projects") {
      const body = await collectBody(request);
      const name = sanitizeString(body.name).slice(0, 80) || "Новый проект";
      const description =
        sanitizeString(body.description).slice(0, 220) || defaultProjectDescription;

      const project = await mutateStore(async (store) => {
        const nextProject = createProject(name, description);
        store.projects.unshift(nextProject);
        return nextProject;
      });

      return sendJson(response, 201, { project });
    }

    const projectEventsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/events$/);
    if (request.method === "GET" && projectEventsMatch) {
      const projectId = projectEventsMatch[1];
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      response.write("retry: 2500\n\n");

      const clients = sseClients.get(projectId) || [];
      clients.push(response);
      sseClients.set(projectId, clients);

      request.on("close", () => {
        const nextClients = (sseClients.get(projectId) || []).filter(
          (item) => item !== response,
        );
        sseClients.set(projectId, nextClients);
      });
      return;
    }

    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && request.method === "GET") {
      const projectId = projectMatch[1];
      const store = await readStore();
      const project = store.projects.find((item) => item.id === projectId);
      if (!project) {
        return sendJson(response, 404, { error: "Project not found" });
      }
      return sendJson(response, 200, { project });
    }

    if (projectMatch && request.method === "PATCH") {
      const projectId = projectMatch[1];
      const body = await collectBody(request);

      const project = await mutateStore(async (store) => {
        const existingProject = getProjectOrThrow(store, projectId);

        if (body.name !== undefined) {
          existingProject.name = sanitizeString(body.name).slice(0, 80) || existingProject.name;
        }

        if (body.description !== undefined) {
          existingProject.description =
            sanitizeString(body.description).slice(0, 220) || existingProject.description;
        }

        if (Array.isArray(body.screenOrder)) {
          const orderMap = new Map(body.screenOrder.map((screenId, index) => [screenId, index]));
          existingProject.screens.sort((a, b) => {
            const aOrder = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER;
            const bOrder = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER;
            return aOrder - bOrder;
          });
        }

        existingProject.updatedAt = nowIso();
        return existingProject;
      });

      broadcastProjectEvent(projectId, {
        type: "project:updated",
        projectId,
        updatedAt: project.updatedAt,
      });

      return sendJson(response, 200, { project });
    }

    const screensMatch = pathname.match(/^\/api\/projects\/([^/]+)\/screens$/);
    if (screensMatch && request.method === "POST") {
      const projectId = screensMatch[1];
      const body = await collectBody(request);

      const project = await mutateStore(async (store) => {
        const existingProject = getProjectOrThrow(store, projectId);
        const screen = createScreen(
          sanitizeString(body.name).slice(0, 80) || `Экран ${existingProject.screens.length + 1}`,
          sanitizeString(body.viewport) || "desktop",
        );
        screen.updatedBy = sanitizeString(body.updatedBy).slice(0, 32) || "Guest";
        existingProject.screens.push(screen);
        existingProject.updatedAt = nowIso();
        return existingProject;
      });

      broadcastProjectEvent(projectId, {
        type: "project:updated",
        projectId,
        updatedAt: project.updatedAt,
      });

      return sendJson(response, 201, { project });
    }

    const screenMatch = pathname.match(/^\/api\/projects\/([^/]+)\/screens\/([^/]+)$/);
    if (screenMatch && request.method === "PATCH") {
      const [, projectId, screenId] = screenMatch;
      const body = await collectBody(request);

      const project = await mutateStore(async (store) => {
        const existingProject = getProjectOrThrow(store, projectId);
        const screen = getScreenOrThrow(existingProject, screenId);
        const patch = sanitizeScreenPatch(body);

        Object.assign(screen, patch, {
          updatedAt: nowIso(),
        });

        existingProject.updatedAt = screen.updatedAt;
        return existingProject;
      });

      broadcastProjectEvent(projectId, {
        type: "project:updated",
        projectId,
        updatedAt: project.updatedAt,
      });

      return sendJson(response, 200, { project });
    }

    if (screenMatch && request.method === "DELETE") {
      const [, projectId, screenId] = screenMatch;

      const project = await mutateStore(async (store) => {
        const existingProject = getProjectOrThrow(store, projectId);

        if (existingProject.screens.length === 1) {
          const error = new Error("В проекте должен остаться хотя бы один экран");
          error.statusCode = 400;
          throw error;
        }

        existingProject.screens = existingProject.screens.filter((screen) => screen.id !== screenId);
        existingProject.comments = existingProject.comments.filter(
          (comment) => comment.screenId !== screenId,
        );
        existingProject.updatedAt = nowIso();
        return existingProject;
      });

      broadcastProjectEvent(projectId, {
        type: "project:updated",
        projectId,
        updatedAt: project.updatedAt,
      });

      return sendJson(response, 200, { project });
    }

    const commentsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/comments$/);
    if (commentsMatch && request.method === "POST") {
      const projectId = commentsMatch[1];
      const body = await collectBody(request);

      const commentText = sanitizeString(body.body).slice(0, 500);
      const authorName = sanitizeString(body.authorName).slice(0, 32) || "Guest";

      if (!commentText) {
        return sendJson(response, 400, { error: "Комментарий пустой" });
      }

      const project = await mutateStore(async (store) => {
        const existingProject = getProjectOrThrow(store, projectId);
        const screenId = sanitizeString(body.screenId) || existingProject.screens[0]?.id || null;

        existingProject.comments.unshift({
          id: randomUUID(),
          screenId,
          authorName,
          body: commentText,
          createdAt: nowIso(),
        });
        existingProject.updatedAt = nowIso();
        return existingProject;
      });

      broadcastProjectEvent(projectId, {
        type: "project:updated",
        projectId,
        updatedAt: project.updatedAt,
      });

      return sendJson(response, 201, { project });
    }

    const projectPageMatch = pathname.match(/^\/p\/([^/]+)$/);
    if (request.method === "GET" && projectPageMatch) {
      return serveAppShell(response);
    }

    if (request.method === "GET") {
      const served = await serveStaticFile(pathname, response);
      if (served) return;
      if (pathname === "/") return serveAppShell(response);
    }

    return sendJson(response, 404, { error: "Route not found" });
  } catch (error) {
    return sendError(response, error);
  }
});

server.listen(port, host, () => {
  console.log(`Screen Studio running on http://${host}:${port}`);
});
