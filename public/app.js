const app = document.querySelector("#app");

const state = {
  route: getRoute(),
  projects: [],
  project: null,
  selectedScreenId: null,
  panelOpen: true,
  zoom: 0.62,
  minZoom: 0.35,
  maxZoom: 1.6,
  panX: 180,
  panY: 80,
  saveState: "saved",
  lastSavedAt: null,
  currentError: "",
  projectSaveTimer: null,
  screenSaveTimers: new Map(),
  authorName:
    localStorage.getItem("screen-studio-author") ||
    `Guest ${Math.floor(Math.random() * 900 + 100)}`,
  drag: null,
  panDrag: null,
  eventSource: null,
  remotePending: false,
};

const colorMap = {
  trainer: "trainer",
  client: "client",
  system: "system",
};

const groupMeta = {
  trainer: {
    label: "Trainer Flow",
    top: 120,
    left: 120,
    width: 2000,
    height: 560,
    tone: "violet",
  },
  shared: {
    label: "Shared State",
    top: 140,
    left: 1450,
    width: 520,
    height: 420,
    tone: "orange",
  },
  client: {
    label: "Client Flow",
    top: 760,
    left: 180,
    width: 1880,
    height: 860,
    tone: "mint",
  },
  core: {
    label: "Core",
    top: 200,
    left: 200,
    width: 1600,
    height: 900,
    tone: "gray",
  },
};

bootstrap();

window.addEventListener("popstate", () => {
  state.route = getRoute();
  bootstrap();
});

window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", stopPointerInteractions);
window.addEventListener("pointercancel", stopPointerInteractions);

async function bootstrap() {
  cleanupEventStream();
  state.currentError = "";

  try {
    await loadProjects();

    if (state.route.view === "home") {
      renderHome();
      return;
    }

    const summary = state.projects.find((project) => project.slug === state.route.slug);
    if (!summary) {
      renderNotFound();
      return;
    }

    await loadProject(summary.id);
    renderBoard();
    connectProjectStream();
  } catch (error) {
    renderFatal(error.message || "Не удалось загрузить приложение");
  }
}

function getRoute() {
  const path = window.location.pathname;
  if (path.startsWith("/p/")) {
    return {
      view: "project",
      slug: decodeURIComponent(path.split("/").pop()),
    };
  }

  return { view: "home" };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

async function loadProjects() {
  const { projects } = await api("/api/projects");
  state.projects = projects;
}

async function loadProject(projectId) {
  const { project } = await api(`/api/projects/${projectId}`);
  applyProject(project);
}

function normalizeScreen(screen, index = 0) {
  const fallbackBlocks = Array.isArray(screen.blocks) ? screen.blocks : [];
  const heroBlock = fallbackBlocks[0] || {};
  const details =
    Array.isArray(screen.details) && screen.details.length
      ? screen.details
      : Array.isArray(heroBlock.items) && heroBlock.items.length
        ? heroBlock.items
        : ["Новый экран", "Добавь контекст в панели справа"];

  return {
    id: screen.id,
    name: screen.name || `Экран ${index + 1}`,
    route: screen.route || `/${slugify(screen.name || `screen-${index + 1}`)}`,
    role: screen.role || (index < 4 ? "trainer" : "client"),
    state: screen.state || "live",
    group: screen.group || (index < 4 ? "trainer" : "client"),
    x: Number.isFinite(screen.x) ? screen.x : 220 + index * 260,
    y: Number.isFinite(screen.y) ? screen.y : 240 + (index % 3) * 280,
    width: Math.max(280, Number(screen.width) || 300),
    height: Math.max(220, Number(screen.height) || 240),
    previewTitle: screen.previewTitle || screen.name || "Screen",
    previewMeta: screen.previewMeta || "SCREEN PREVIEW",
    note: screen.note || screen.viewport || "Live",
    why: screen.why || heroBlock.body || "Этот экран нужен как смысловой узел потока.",
    details,
    updatedAt: screen.updatedAt,
    updatedBy: screen.updatedBy || "System",
  };
}

function normalizeProject(project) {
  const screens = Array.isArray(project.screens)
    ? project.screens.map((screen, index) => normalizeScreen(screen, index))
    : [];

  const validIds = new Set(screens.map((screen) => screen.id));
  let connections = Array.isArray(project.connections)
    ? project.connections
        .map((connection) => ({
          id: connection.id || crypto.randomUUID(),
          fromScreenId: connection.fromScreenId,
          toScreenId: connection.toScreenId,
          label: connection.label || "",
          color: connection.color || "violet",
        }))
        .filter(
          (connection) =>
            validIds.has(connection.fromScreenId) && validIds.has(connection.toScreenId),
        )
    : [];

  if (connections.length === 0 && screens.length > 1) {
    connections = screens.slice(0, -1).map((screen, index) => ({
      id: crypto.randomUUID(),
      fromScreenId: screen.id,
      toScreenId: screens[index + 1].id,
      label: "next",
      color: "gray",
    }));
  }

  return {
    ...project,
    screens,
    connections,
  };
}

function applyProject(project) {
  state.project = normalizeProject(project);

  if (
    !state.selectedScreenId ||
    !state.project.screens.some((screen) => screen.id === state.selectedScreenId)
  ) {
    state.selectedScreenId = state.project.screens[0]?.id || null;
  }
}

function getSelectedScreen() {
  return state.project?.screens.find((screen) => screen.id === state.selectedScreenId) || null;
}

function renderHome() {
  app.innerHTML = `
    <main class="home-shell">
      <section class="home-hero card">
        <div class="eyebrow">Desktop Mindmap</div>
        <h1>Карта экранов, связей и переходов между ролями.</h1>
        <p>
          Screen Studio теперь ориентирован на board-режим: большие canvas-карты, связи между узлами,
          zoom/pan и редактирование карточек экранов в панели.
        </p>
        <div class="home-actions">
          <button class="ui-button primary" data-action="create-project-demo">Создать board</button>
          <label class="field compact">
            <span>Твое имя</span>
            <input id="author-input" maxlength="32" value="${escapeHtml(state.authorName)}" />
          </label>
        </div>
      </section>

      <section class="home-grid">
        <section class="card">
          <div class="section-head">
            <div>
              <div class="eyebrow">New Project</div>
              <h2>Новый mindmap-проект</h2>
            </div>
          </div>
          <div class="stack">
            <label class="field">
              <span>Название</span>
              <input id="project-name" maxlength="80" placeholder="Например, AI Forge Screen Map" />
            </label>
            <label class="field">
              <span>Описание</span>
              <textarea id="project-description" maxlength="220" placeholder="Что вы картируете и для кого"></textarea>
            </label>
            <button class="ui-button primary" data-action="create-project">Создать и открыть</button>
          </div>
        </section>

        <section class="card">
          <div class="section-head">
            <div>
              <div class="eyebrow">Projects</div>
              <h2>Текущие board-комнаты</h2>
            </div>
            <span class="counter">${state.projects.length}</span>
          </div>
          <div class="project-list">
            ${
              state.projects.length
                ? state.projects
                    .map(
                      (project) => `
                        <a class="project-card" href="/p/${encodeURIComponent(project.slug)}">
                          <strong>${escapeHtml(project.name)}</strong>
                          <p>${escapeHtml(project.description || "Без описания")}</p>
                          <div class="project-meta">
                            <span>${project.screenCount} экранов</span>
                            <span>${formatDateTime(project.updatedAt)}</span>
                          </div>
                        </a>
                      `,
                    )
                    .join("")
                : `<div class="empty-card">Пока нет проектов. Создай первый board и открой его по ссылке.</div>`
            }
          </div>
        </section>
      </section>
    </main>
  `;

  document.querySelector("#author-input")?.addEventListener("input", (event) => {
    setAuthorName(event.target.value);
  });

  app.querySelector('[data-action="create-project"]')?.addEventListener("click", async () => {
    await createProject({
      name: document.querySelector("#project-name").value.trim() || "Новый board",
      description:
        document.querySelector("#project-description").value.trim() ||
        "Полная карта экранов, переходов и handoff между ролями.",
    });
  });

  app
    .querySelector('[data-action="create-project-demo"]')
    ?.addEventListener("click", async () => {
      await createProject({
        name: "Новый экран продукта",
        description: "Полная карта экранов: куда ведет, зачем нужен экран и как данные переходят между ролями.",
      });
    });
}

async function createProject(payload) {
  try {
    const { project } = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    window.location.href = `/p/${encodeURIComponent(project.slug)}`;
  } catch (error) {
    alert(error.message || "Не удалось создать проект");
  }
}

function renderBoard() {
  if (!state.project) {
    renderNotFound();
    return;
  }

  const selected = getSelectedScreen();

  app.innerHTML = `
    <main class="board-shell">
      <div class="board-top-left card glass">
        <div class="card-topline">
          <span class="eyebrow">Desktop Mindmap</span>
          <button class="panel-pill" data-action="toggle-panel">${state.panelOpen ? "Скрыть панель" : "Панель"}</button>
        </div>
        <h1>${escapeHtml(state.project.name)}</h1>
        <p>${escapeHtml(
          state.project.description ||
            "Карта экранов, переходов и логики передачи данных между ролями.",
        )}</p>
      </div>

      <div class="board-top-right card glass controls">
        <button class="icon-button" data-action="zoom-out">-</button>
        <span class="zoom-value">${Math.round(state.zoom * 100)}%</span>
        <button class="icon-button" data-action="zoom-in">+</button>
        <button class="text-button" data-action="fit-board">Fit</button>
        <button class="text-button" data-action="zoom-100">100%</button>
        <button class="text-button" data-action="fullscreen">Fullscreen</button>
      </div>

      <div class="board-canvas-wrap" id="board-wrap">
        <div class="board-viewport" id="board-viewport">
          <div class="board-surface" id="board-surface" style="transform: translate(${state.panX}px, ${state.panY}px) scale(${state.zoom});">
            ${renderZones()}
            ${renderConnections()}
            ${state.project.screens.map((screen) => renderNode(screen)).join("")}
          </div>
        </div>
      </div>

      ${
        state.panelOpen
          ? `
            <aside class="board-panel card glass" id="board-panel">
              <div class="panel-section">
                <div class="section-head">
                  <div>
                    <div class="eyebrow">Board</div>
                    <h2>Панель управления</h2>
                  </div>
                  <button class="icon-button" data-action="toggle-panel">×</button>
                </div>
                <div class="status-pill ${state.currentError ? "error" : state.saveState === "saving" ? "saving" : ""}">
                  ${
                    state.currentError
                      ? escapeHtml(state.currentError)
                      : state.saveState === "saving"
                        ? "Сохраняю..."
                        : state.lastSavedAt
                          ? `Сохранено в ${formatTime(state.lastSavedAt)}`
                          : "Все сохранено"
                  }
                </div>
              </div>

              <div class="panel-section">
                <label class="field">
                  <span>Название board</span>
                  <input id="board-name" maxlength="80" value="${escapeHtml(state.project.name)}" />
                </label>
                <label class="field">
                  <span>Описание</span>
                  <textarea id="board-description" maxlength="220">${escapeHtml(state.project.description || "")}</textarea>
                </label>
                <label class="field compact">
                  <span>Автор правок</span>
                  <input id="board-author" maxlength="32" value="${escapeHtml(state.authorName)}" />
                </label>
              </div>

              <div class="panel-section">
                <div class="section-head">
                  <div>
                    <div class="eyebrow">Nodes</div>
                    <h3>Экраны</h3>
                  </div>
                  <button class="ui-button secondary" data-action="add-node">+ Экран</button>
                </div>
                <div class="node-list">
                  ${state.project.screens
                    .map(
                      (screen) => `
                        <button class="node-list-item ${screen.id === state.selectedScreenId ? "active" : ""}" data-action="select-node" data-screen-id="${screen.id}">
                          <span>${escapeHtml(screen.name)}</span>
                          <small>${escapeHtml(screen.route)}</small>
                        </button>
                      `,
                    )
                    .join("")}
                </div>
              </div>

              <div class="panel-section">
                <div class="section-head">
                  <div>
                    <div class="eyebrow">Connections</div>
                    <h3>Связи</h3>
                  </div>
                </div>
                <div class="connection-form">
                  <label class="field compact">
                    <span>Откуда</span>
                    <select id="connection-from">
                      ${renderNodeOptions(selected?.id)}
                    </select>
                  </label>
                  <label class="field compact">
                    <span>Куда</span>
                    <select id="connection-to">
                      ${renderNodeOptions()}
                    </select>
                  </label>
                  <label class="field compact">
                    <span>Подпись</span>
                    <input id="connection-label" maxlength="80" placeholder="start, save, handoff..." />
                  </label>
                  <label class="field compact">
                    <span>Цвет</span>
                    <select id="connection-color">
                      <option value="violet">violet</option>
                      <option value="mint">mint</option>
                      <option value="orange">orange</option>
                      <option value="gray">gray</option>
                    </select>
                  </label>
                  <button class="ui-button secondary" data-action="add-connection">Добавить связь</button>
                </div>
                <div class="connection-list">
                  ${state.project.connections
                    .map((connection) => {
                      const from = state.project.screens.find((screen) => screen.id === connection.fromScreenId);
                      const to = state.project.screens.find((screen) => screen.id === connection.toScreenId);
                      return `
                        <div class="connection-item">
                          <div>
                            <strong>${escapeHtml(from?.name || "?" )}</strong>
                            <small>${escapeHtml(connection.label || "link")} → ${escapeHtml(to?.name || "?")}</small>
                          </div>
                          <button class="icon-button small" data-action="delete-connection" data-connection-id="${connection.id}">×</button>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              </div>

              <div class="panel-section">
                <div class="section-head">
                  <div>
                    <div class="eyebrow">Selected Node</div>
                    <h3>${escapeHtml(selected?.name || "Узел не выбран")}</h3>
                  </div>
                  ${
                    selected
                      ? `<button class="icon-button small" data-action="delete-node" data-screen-id="${selected.id}">Удалить</button>`
                      : ""
                  }
                </div>
                ${
                  selected
                    ? renderSelectedNodeEditor(selected)
                    : `<div class="empty-card compact">Выбери карточку на canvas или в списке экранов.</div>`
                }
              </div>
            </aside>
          `
          : ""
      }
    </main>
  `;

  bindBoardEvents();
}

function renderZones() {
  const groups = new Set(state.project.screens.map((screen) => screen.group));
  return [...groups]
    .filter((group) => groupMeta[group])
    .map((group) => {
      const meta = groupMeta[group];
      return `
        <section class="board-zone ${meta.tone}" style="left:${meta.left}px; top:${meta.top}px; width:${meta.width}px; height:${meta.height}px;">
          <span>${escapeHtml(meta.label)}</span>
        </section>
      `;
    })
    .join("");
}

function renderConnections() {
  const width = 2400;
  const height = 1800;

  return `
    <svg class="connections-layer" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      ${state.project.connections
        .map((connection) => {
          const from = state.project.screens.find((screen) => screen.id === connection.fromScreenId);
          const to = state.project.screens.find((screen) => screen.id === connection.toScreenId);
          if (!from || !to) return "";

          const startX = from.x + from.width;
          const startY = from.y + from.height / 2;
          const endX = to.x;
          const endY = to.y + to.height / 2;
          const delta = Math.max(90, Math.abs(endX - startX) * 0.35);
          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2 - 14;

          return `
            <g class="connection ${escapeHtml(connection.color || "violet")}">
              <path d="M ${startX} ${startY} C ${startX + delta} ${startY}, ${endX - delta} ${endY}, ${endX} ${endY}" />
              <text x="${midX}" y="${midY}">${escapeHtml(connection.label || "")}</text>
            </g>
          `;
        })
        .join("")}
    </svg>
  `;
}

function renderNode(screen) {
  const selected = screen.id === state.selectedScreenId ? "selected" : "";
  const tone = colorMap[screen.role] || "trainer";

  return `
    <article
      class="mind-node ${tone} ${selected}"
      data-screen-id="${screen.id}"
      style="left:${screen.x}px; top:${screen.y}px; width:${screen.width}px; min-height:${screen.height}px;"
    >
      <div class="node-badges">
        <span class="badge role">${escapeHtml(capitalize(screen.role))}</span>
        <span class="badge state">${escapeHtml(screen.state)}</span>
      </div>
      <div class="node-route">${escapeHtml(screen.route)}</div>
      <h3>${escapeHtml(screen.name)}</h3>
      <div class="node-subtitle">${escapeHtml(screen.previewMeta || "SCREEN PREVIEW")}</div>
      <div class="node-why">
        <div class="node-label">Зачем нужен экран</div>
        <p>${escapeHtml(screen.why)}</p>
      </div>
      <div class="preview-card">
        <span class="preview-chip">${escapeHtml(screen.note || screen.state)}</span>
        <strong>${escapeHtml(screen.previewTitle || screen.name)}</strong>
        <div class="preview-lines">
          ${screen.details
            .slice(0, 3)
            .map((item) => `<span>${escapeHtml(item)}</span>`)
            .join("")}
        </div>
      </div>
    </article>
  `;
}

function renderNodeOptions(selectedId = "") {
  return state.project.screens
    .map(
      (screen) =>
        `<option value="${screen.id}" ${screen.id === selectedId ? "selected" : ""}>${escapeHtml(screen.name)}</option>`,
    )
    .join("");
}

function renderSelectedNodeEditor(screen) {
  return `
    <div class="stack">
      <label class="field compact">
        <span>Название</span>
        <input data-field="name" value="${escapeHtml(screen.name)}" maxlength="80" />
      </label>
      <label class="field compact">
        <span>Route</span>
        <input data-field="route" value="${escapeHtml(screen.route)}" maxlength="120" />
      </label>
      <div class="field-grid">
        <label class="field compact">
          <span>Role</span>
          <select data-field="role">
            ${["trainer", "client", "system"]
              .map(
                (role) =>
                  `<option value="${role}" ${screen.role === role ? "selected" : ""}>${role}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label class="field compact">
          <span>State</span>
          <select data-field="state">
            ${["live", "production", "draft", "shared", "mock"]
              .map(
                (item) =>
                  `<option value="${item}" ${screen.state === item ? "selected" : ""}>${item}</option>`,
              )
              .join("")}
          </select>
        </label>
      </div>
      <div class="field-grid">
        <label class="field compact">
          <span>Group</span>
          <select data-field="group">
            ${["trainer", "shared", "client", "core"]
              .map(
                (item) =>
                  `<option value="${item}" ${screen.group === item ? "selected" : ""}>${item}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label class="field compact">
          <span>Note</span>
          <input data-field="note" value="${escapeHtml(screen.note)}" maxlength="80" />
        </label>
      </div>
      <label class="field compact">
        <span>Preview title</span>
        <input data-field="previewTitle" value="${escapeHtml(screen.previewTitle)}" maxlength="80" />
      </label>
      <label class="field compact">
        <span>Preview meta</span>
        <input data-field="previewMeta" value="${escapeHtml(screen.previewMeta)}" maxlength="60" />
      </label>
      <label class="field compact">
        <span>Зачем нужен экран</span>
        <textarea data-field="why" maxlength="320">${escapeHtml(screen.why)}</textarea>
      </label>
      <label class="field compact">
        <span>Bullets</span>
        <textarea data-field="details">${escapeHtml(screen.details.join("\n"))}</textarea>
      </label>
    </div>
  `;
}

function bindBoardEvents() {
  app.querySelectorAll('[data-action="toggle-panel"]').forEach((button) => {
    button.addEventListener("click", () => {
      state.panelOpen = !state.panelOpen;
      renderBoard();
    });
  });

  app.querySelector('[data-action="zoom-out"]')?.addEventListener("click", () => setZoom(state.zoom - 0.1));
  app.querySelector('[data-action="zoom-in"]')?.addEventListener("click", () => setZoom(state.zoom + 0.1));
  app.querySelector('[data-action="zoom-100"]')?.addEventListener("click", () => {
    state.zoom = 1;
    renderBoard();
  });
  app.querySelector('[data-action="fit-board"]')?.addEventListener("click", fitBoard);
  app.querySelector('[data-action="fullscreen"]')?.addEventListener("click", async () => {
    const root = document.querySelector(".board-shell");
    if (!document.fullscreenElement) {
      await root?.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  });

  document.querySelector("#board-name")?.addEventListener("input", (event) => {
    state.project.name = event.target.value;
    scheduleProjectSave();
  });

  document.querySelector("#board-description")?.addEventListener("input", (event) => {
    state.project.description = event.target.value;
    scheduleProjectSave();
  });

  document.querySelector("#board-author")?.addEventListener("input", (event) => {
    setAuthorName(event.target.value);
  });

  app.querySelector('[data-action="add-node"]')?.addEventListener("click", addNode);
  app.querySelectorAll('[data-action="select-node"]').forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedScreenId = button.dataset.screenId;
      renderBoard();
    });
  });

  app.querySelector('[data-action="add-connection"]')?.addEventListener("click", addConnection);
  app.querySelectorAll('[data-action="delete-connection"]').forEach((button) => {
    button.addEventListener("click", () => deleteConnection(button.dataset.connectionId));
  });

  app.querySelectorAll('[data-action="delete-node"]').forEach((button) => {
    button.addEventListener("click", () => deleteNode(button.dataset.screenId));
  });

  document.querySelectorAll(".mind-node").forEach((node) => {
    node.addEventListener("click", (event) => {
      if (event.target.closest("button, input, textarea, select")) return;
      state.selectedScreenId = node.dataset.screenId;
      renderBoard();
    });

    node.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, input, textarea, select")) return;
      startNodeDrag(event, node.dataset.screenId);
    });
  });

  const selected = getSelectedScreen();
  if (selected) {
    document.querySelectorAll("[data-field]").forEach((field) => {
      field.addEventListener("change", (event) => {
        const key = event.target.dataset.field;
        const value =
          key === "details"
            ? event.target.value
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, 6)
            : event.target.value;
        updateSelectedScreen({ [key]: value });
      });
    });
  }

  const viewport = document.querySelector("#board-viewport");
  viewport?.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const nextZoom = state.zoom + (event.deltaY < 0 ? 0.08 : -0.08);
      setZoom(nextZoom);
    },
    { passive: false },
  );

  viewport?.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".mind-node, .board-panel, .board-top-left, .board-top-right")) return;
    state.panDrag = {
      startX: event.clientX,
      startY: event.clientY,
      originPanX: state.panX,
      originPanY: state.panY,
    };
  });
}

function startNodeDrag(event, screenId) {
  const screen = state.project.screens.find((item) => item.id === screenId);
  if (!screen) return;

  const viewportPoint = toViewportPoint(event.clientX, event.clientY);
  state.drag = {
    screenId,
    offsetX: viewportPoint.x - screen.x,
    offsetY: viewportPoint.y - screen.y,
  };
}

function onPointerMove(event) {
  if (state.drag) {
    const screen = state.project.screens.find((item) => item.id === state.drag.screenId);
    if (!screen) return;
    const viewportPoint = toViewportPoint(event.clientX, event.clientY);
    screen.x = Math.round(viewportPoint.x - state.drag.offsetX);
    screen.y = Math.round(viewportPoint.y - state.drag.offsetY);
    state.lastSavedAt = null;
    state.saveState = "saving";
    renderBoard();
    scheduleScreenSave(screen.id);
    return;
  }

  if (state.panDrag) {
    state.panX = state.panDrag.originPanX + (event.clientX - state.panDrag.startX);
    state.panY = state.panDrag.originPanY + (event.clientY - state.panDrag.startY);
    renderBoard();
  }
}

function stopPointerInteractions() {
  state.drag = null;
  state.panDrag = null;
}

function toViewportPoint(clientX, clientY) {
  const viewport = document.querySelector("#board-viewport");
  const rect = viewport.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.panX) / state.zoom,
    y: (clientY - rect.top - state.panY) / state.zoom,
  };
}

function setZoom(nextZoom) {
  state.zoom = Math.min(state.maxZoom, Math.max(state.minZoom, nextZoom));
  renderBoard();
}

function fitBoard() {
  if (!state.project?.screens.length) return;
  const viewport = document.querySelector("#board-viewport");
  if (!viewport) return;

  const minX = Math.min(...state.project.screens.map((screen) => screen.x)) - 120;
  const minY = Math.min(...state.project.screens.map((screen) => screen.y)) - 120;
  const maxX = Math.max(...state.project.screens.map((screen) => screen.x + screen.width)) + 120;
  const maxY = Math.max(...state.project.screens.map((screen) => screen.y + screen.height)) + 120;
  const boardWidth = maxX - minX;
  const boardHeight = maxY - minY;
  const nextZoom = Math.min(
    1,
    Math.max(
      state.minZoom,
      Math.min(viewport.clientWidth / boardWidth, viewport.clientHeight / boardHeight),
    ),
  );

  state.zoom = nextZoom;
  state.panX = (viewport.clientWidth - boardWidth * nextZoom) / 2 - minX * nextZoom;
  state.panY = (viewport.clientHeight - boardHeight * nextZoom) / 2 - minY * nextZoom;
  renderBoard();
}

function updateSelectedScreen(patch) {
  const selected = getSelectedScreen();
  if (!selected) return;

  Object.assign(selected, patch);
  scheduleScreenSave(selected.id);
  renderBoard();
}

async function addNode() {
  try {
    const { project } = await api(`/api/projects/${state.project.id}/screens`, {
      method: "POST",
      body: JSON.stringify({
        name: `Новый экран ${state.project.screens.length + 1}`,
        updatedBy: state.authorName,
        x: 980 + state.project.screens.length * 40,
        y: 420 + state.project.screens.length * 40,
        role: "client",
        state: "draft",
        group: "core",
        previewTitle: "New Screen",
        previewMeta: "SCREEN PREVIEW",
        why: "Новый узел на карте экранов.",
        details: ["Заполни описание", "Добавь связи"],
      }),
    });
    applyProject(project);
    state.selectedScreenId = state.project.screens.at(-1)?.id || state.selectedScreenId;
    state.lastSavedAt = state.project.updatedAt;
    renderBoard();
  } catch (error) {
    state.currentError = error.message || "Не удалось добавить экран";
    renderBoard();
  }
}

async function deleteNode(screenId) {
  if (!screenId) return;
  try {
    const { project } = await api(`/api/projects/${state.project.id}/screens/${screenId}`, {
      method: "DELETE",
    });
    applyProject(project);
    state.lastSavedAt = state.project.updatedAt;
    renderBoard();
  } catch (error) {
    state.currentError = error.message || "Не удалось удалить экран";
    renderBoard();
  }
}

async function addConnection() {
  const from = document.querySelector("#connection-from")?.value;
  const to = document.querySelector("#connection-to")?.value;
  const label = document.querySelector("#connection-label")?.value.trim();
  const color = document.querySelector("#connection-color")?.value || "violet";

  if (!from || !to || from === to) return;

  state.project.connections.push({
    id: crypto.randomUUID(),
    fromScreenId: from,
    toScreenId: to,
    label,
    color,
  });

  await saveConnections();
  renderBoard();
}

async function deleteConnection(connectionId) {
  state.project.connections = state.project.connections.filter(
    (connection) => connection.id !== connectionId,
  );
  await saveConnections();
  renderBoard();
}

async function saveConnections() {
  try {
    state.saveState = "saving";
    const { project } = await api(`/api/projects/${state.project.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: state.project.name,
        description: state.project.description,
        connections: state.project.connections,
      }),
    });
    applyProject(project);
    state.lastSavedAt = state.project.updatedAt;
    state.currentError = "";
    state.saveState = "saved";
  } catch (error) {
    state.currentError = error.message || "Не удалось сохранить связи";
    state.saveState = "error";
  }
}

function scheduleProjectSave() {
  clearTimeout(state.projectSaveTimer);
  state.saveState = "saving";
  state.currentError = "";

  state.projectSaveTimer = setTimeout(async () => {
    try {
      const { project } = await api(`/api/projects/${state.project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: state.project.name,
          description: state.project.description,
          connections: state.project.connections,
        }),
      });
      applyProject(project);
      state.lastSavedAt = state.project.updatedAt;
      state.saveState = "saved";
      state.currentError = "";
      renderBoard();
    } catch (error) {
      state.currentError = error.message || "Не удалось сохранить проект";
      state.saveState = "error";
      renderBoard();
    }
  }, 450);
}

function scheduleScreenSave(screenId) {
  const timer = state.screenSaveTimers.get(screenId);
  if (timer) clearTimeout(timer);

  const nextTimer = setTimeout(async () => {
    const screen = state.project.screens.find((item) => item.id === screenId);
    if (!screen) return;

    try {
      const { project } = await api(`/api/projects/${state.project.id}/screens/${screenId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: screen.name,
          route: screen.route,
          role: screen.role,
          state: screen.state,
          group: screen.group,
          x: screen.x,
          y: screen.y,
          width: screen.width,
          height: screen.height,
          previewTitle: screen.previewTitle,
          previewMeta: screen.previewMeta,
          note: screen.note,
          why: screen.why,
          details: screen.details,
          updatedBy: state.authorName,
        }),
      });
      applyProject(project);
      state.lastSavedAt = state.project.updatedAt;
      state.currentError = "";
      state.saveState = "saved";
      renderBoard();
    } catch (error) {
      state.currentError = error.message || "Не удалось сохранить экран";
      state.saveState = "error";
      renderBoard();
    }
  }, 300);

  state.screenSaveTimers.set(screenId, nextTimer);
}

function connectProjectStream() {
  cleanupEventStream();
  if (!state.project) return;

  const source = new EventSource(`/api/projects/${state.project.id}/events`);
  state.eventSource = source;

  source.onmessage = async (event) => {
    const payload = JSON.parse(event.data);
    if (!payload || payload.updatedAt === state.project.updatedAt) return;

    if (state.saveState === "saving") {
      state.remotePending = true;
      return;
    }

    const { project } = await api(`/api/projects/${state.project.id}`);
    applyProject(project);
    state.lastSavedAt = state.project.updatedAt;
    renderBoard();
  };

  source.onerror = () => {
    state.currentError = "Потеряна live-sync связь, пробую переподключиться";
    renderBoard();
  };
}

function cleanupEventStream() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
}

function setAuthorName(value) {
  state.authorName = value.trim() || "Guest";
  localStorage.setItem("screen-studio-author", state.authorName);
}

function renderNotFound() {
  app.innerHTML = `
    <main class="home-shell">
      <section class="card fatal">
        <div class="eyebrow">Project not found</div>
        <h1>Комната не найдена</h1>
        <p>Проверь ссылку или вернись к списку board-проектов.</p>
        <a href="/" class="ui-button primary link-button">К проектам</a>
      </section>
    </main>
  `;
}

function renderFatal(message) {
  app.innerHTML = `
    <main class="home-shell">
      <section class="card fatal">
        <div class="eyebrow">Application error</div>
        <h1>Приложение не загрузилось</h1>
        <p>${escapeHtml(message)}</p>
        <a href="/" class="ui-button primary link-button">На главную</a>
      </section>
    </main>
  `;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : "";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
