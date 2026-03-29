const app = document.querySelector("#app");

const blockLibrary = [
  {
    type: "hero",
    label: "Hero",
    description: "Крупный первый экран с оффером и CTA.",
  },
  {
    type: "featureGrid",
    label: "Feature Grid",
    description: "Сетка карточек с преимуществами или шагами.",
  },
  {
    type: "stats",
    label: "Stats",
    description: "Метрики, цифры, доверительные показатели.",
  },
  {
    type: "split",
    label: "Split",
    description: "Текст + акцентный смысловой блок.",
  },
  {
    type: "quote",
    label: "Quote",
    description: "Отзывы, цитаты, proof point.",
  },
  {
    type: "cta",
    label: "CTA",
    description: "Финальный призыв и действия.",
  },
  {
    type: "footer",
    label: "Footer",
    description: "Ссылки, подпись, вторичная навигация.",
  },
];

const paletteStyles = {
  ember: {
    bg: "linear-gradient(180deg, #f4c77f 0%, #e07a3c 38%, #8a341f 100%)",
    surface: "rgba(255, 244, 230, 0.18)",
    ink: "#fff5ea",
    accent: "#fff2b6",
    line: "rgba(255, 243, 226, 0.22)",
  },
  lagoon: {
    bg: "linear-gradient(180deg, #caf8ec 0%, #26a69a 44%, #0f3b48 100%)",
    surface: "rgba(239, 255, 253, 0.15)",
    ink: "#effff9",
    accent: "#d4ff7d",
    line: "rgba(236, 255, 250, 0.2)",
  },
  graphite: {
    bg: "linear-gradient(180deg, #d7d5d2 0%, #8d857d 42%, #302d29 100%)",
    surface: "rgba(255, 255, 255, 0.11)",
    ink: "#fffaf3",
    accent: "#f0ba79",
    line: "rgba(255, 255, 255, 0.16)",
  },
  meadow: {
    bg: "linear-gradient(180deg, #f8f0be 0%, #6fa858 36%, #254c2d 100%)",
    surface: "rgba(255, 255, 255, 0.12)",
    ink: "#fffef5",
    accent: "#ffd774",
    line: "rgba(255, 255, 255, 0.18)",
  },
};

const state = {
  route: getRoute(),
  projects: [],
  project: null,
  selectedScreenId: null,
  selectedBlockId: null,
  authorName: localStorage.getItem("screen-studio-author") || `Guest ${Math.floor(Math.random() * 900 + 100)}`,
  screenSaveTimer: null,
  projectSaveTimer: null,
  saveState: "saved",
  eventSource: null,
  remotePending: false,
  lastSavedAt: null,
  currentError: "",
};

localStorage.setItem("screen-studio-author", state.authorName);

window.addEventListener("popstate", () => {
  state.route = getRoute();
  bootstrap();
});

bootstrap();

async function bootstrap() {
  cleanupEventStream();
  state.currentError = "";
  if (state.route.view === "home") {
    await loadProjects();
    renderHome();
    return;
  }

  await loadProjects();
  const projectSummary = state.projects.find((project) => project.slug === state.route.slug);
  if (!projectSummary) {
    renderNotFound();
    return;
  }

  await loadProject(projectSummary.id);
  mountEditor();
  connectProjectStream();
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

function applyProject(project) {
  state.project = project;

  if (!state.selectedScreenId || !project.screens.some((screen) => screen.id === state.selectedScreenId)) {
    state.selectedScreenId = project.screens[0]?.id || null;
  }

  const currentScreen = getCurrentScreen();
  if (!currentScreen) {
    state.selectedBlockId = null;
    return;
  }

  if (!state.selectedBlockId || !currentScreen.blocks.some((block) => block.id === state.selectedBlockId)) {
    state.selectedBlockId = currentScreen.blocks[0]?.id || null;
  }
}

function renderHome() {
  app.innerHTML = `
    <main class="shell home-shell">
      <section class="hero">
        <div class="hero-main">
          <span class="eyebrow">Collaborative Screen Lab</span>
          <h1 class="hero-title">Проектируй экраны вместе с друзьями прямо в вебе</h1>
          <p class="hero-copy">
            Screen Studio это живая shared-комната: несколько экранов в одном проекте,
            готовые контент-блоки, комментарии и автообновление у всех участников по ссылке.
          </p>
          <div class="inline" style="margin-top: 22px">
            <button class="button button-primary" id="create-demo-project">Создать новый проект</button>
            <span class="pill">Без зависимостей, работает на одном Node-сервере</span>
          </div>
        </div>
        <div class="hero-side">
          <div>
            <span class="eyebrow">Что внутри</span>
            <h2 style="margin: 14px 0 8px">Быстрый MVP для совместного UI-проектирования</h2>
            <p class="muted">
              Добавляй hero, фичи, метрики, CTA и другие секции. Меняй структуру,
              правь тексты и обсуждай экран прямо в проекте.
            </p>
          </div>
          <div class="card" style="padding: 18px">
            <div class="project-meta">
              <span>Живой sync</span>
              <span>SSE</span>
            </div>
            <div class="project-meta">
              <span>Хранилище</span>
              <span>JSON</span>
            </div>
            <div class="project-meta">
              <span>Экранов в проекте</span>
              <span>сколько угодно</span>
            </div>
          </div>
          <label class="label">
            Твое имя в комнате
            <input class="input" id="home-author-name" maxlength="32" value="${escapeHtml(state.authorName)}" />
          </label>
        </div>
      </section>

      <section class="grid home-grid">
        <section class="panel stack">
          <div>
            <span class="eyebrow">New Project</span>
            <h2 style="margin-top: 12px">Собери новую комнату</h2>
            <p class="muted">Создается сразу со стартовым экраном и готовыми блоками.</p>
          </div>
          <label class="label">
            Название проекта
            <input class="input" id="project-name" maxlength="80" placeholder="Например, Лендинг нового сервиса" />
          </label>
          <label class="label">
            Короткое описание
            <textarea class="textarea" id="project-description" maxlength="220" placeholder="Что вы проектируете и что хотите согласовать с командой"></textarea>
          </label>
          <button class="button button-primary" id="create-project-button">Создать и открыть</button>
        </section>

        <section class="panel stack">
          <div class="inline" style="justify-content: space-between">
            <div>
              <span class="eyebrow">Projects</span>
              <h2 style="margin-top: 12px">Текущие комнаты</h2>
            </div>
            <span class="pill">${state.projects.length} project${state.projects.length === 1 ? "" : "s"}</span>
          </div>
          <div class="project-list">
            ${
              state.projects.length
                ? state.projects
                    .map(
                      (project) => `
                        <a class="project-card" href="/p/${project.slug}">
                          <div class="project-meta">
                            <strong>${escapeHtml(project.name)}</strong>
                            <span>${project.screenCount} экранов</span>
                          </div>
                          <p>${escapeHtml(project.description || "Без описания")}</p>
                          <div class="project-meta">
                            <span>${project.commentCount} комментариев</span>
                            <span>${formatDateTime(project.updatedAt)}</span>
                          </div>
                        </a>
                      `,
                    )
                    .join("")
                : `<div class="empty">Пока нет проектов. Создай первый и отправь ссылку команде.</div>`
            }
          </div>
        </section>
      </section>
    </main>
  `;

  document.querySelector("#home-author-name").addEventListener("input", (event) => {
    setAuthorName(event.target.value);
  });

  document.querySelector("#create-demo-project").addEventListener("click", async () => {
    await createProject({
      name: "Новый экран продукта",
      description: "Общий room для идеи, структуры и обсуждения лендинга.",
    });
  });

  document.querySelector("#create-project-button").addEventListener("click", async () => {
    const name = document.querySelector("#project-name").value.trim();
    const description = document.querySelector("#project-description").value.trim();
    await createProject({
      name: name || "Новый проект",
      description,
    });
  });
}

async function createProject(payload) {
  const button = document.querySelector("#create-project-button") || document.querySelector("#create-demo-project");
  if (button) {
    button.disabled = true;
  }

  try {
    const { project } = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    window.location.href = `/p/${project.slug}`;
  } catch (error) {
    alert(error.message);
    if (button) {
      button.disabled = false;
    }
  }
}

function mountEditor() {
  if (!state.project) {
    renderNotFound();
    return;
  }

  app.innerHTML = `
    <main class="shell">
      <div class="workspace">
        <aside class="workspace-panel" id="left-panel">
          <div class="inline" style="justify-content: space-between">
            <div>
              <span class="eyebrow">Screens</span>
              <h2 style="margin-top: 10px">Структура проекта</h2>
            </div>
            <button class="button button-secondary" id="add-screen-button">+ Экран</button>
          </div>
          <div class="screen-list" id="screen-list"></div>
          <div class="spacer"></div>
          <a href="/" class="button button-ghost" style="text-decoration: none; text-align: center">← Все проекты</a>
        </aside>

        <section class="workspace-center">
          <div class="topbar">
            <section class="workspace-panel compact">
              <div class="inline" style="justify-content: space-between">
                <div>
                  <span class="eyebrow">Project</span>
                  <h2 style="margin-top: 10px">Комната дизайна</h2>
                </div>
                <button class="button button-secondary" id="copy-link-button">Скопировать ссылку</button>
              </div>
              <label class="label">
                Название проекта
                <input class="input" id="project-name-input" maxlength="80" />
              </label>
              <label class="label">
                Описание
                <textarea class="textarea" id="project-description-input" maxlength="220"></textarea>
              </label>
            </section>

            <section class="workspace-panel compact">
              <div>
                <span class="eyebrow">Room</span>
                <h3 style="margin-top: 10px">Кто сейчас правит</h3>
              </div>
              <label class="label">
                Твое имя
                <input class="input" id="author-name-input" maxlength="32" />
              </label>
              <div class="status" id="save-status"></div>
            </section>

            <section class="workspace-panel compact">
              <div>
                <span class="eyebrow">Share</span>
                <h3 style="margin-top: 10px">Быстрый доступ</h3>
              </div>
              <div class="stack small muted">
                <div>Отправь текущую ссылку друзьям. Все увидят одни и те же экраны и комментарии.</div>
                <div>Последнее обновление: <strong id="last-updated-label"></strong></div>
              </div>
            </section>
          </div>

          <section class="workspace-panel stage">
            <div id="canvas"></div>
          </section>
        </section>

        <aside class="workspace-panel workspace-right" id="right-panel">
          <div>
            <span class="eyebrow">Blocks</span>
            <h2 style="margin-top: 10px">Библиотека и настройки</h2>
          </div>
          <div class="library-grid" id="block-library"></div>
          <div class="outline-list" id="block-outline"></div>
          <div id="inspector"></div>
          <div class="comment-list" id="comment-list"></div>
          <div id="comment-form"></div>
        </aside>
      </div>
    </main>
  `;

  document.querySelector("#project-name-input").value = state.project.name || "";
  document.querySelector("#project-description-input").value = state.project.description || "";
  document.querySelector("#author-name-input").value = state.authorName;

  document.querySelector("#project-name-input").addEventListener("input", (event) => {
    state.project.name = event.target.value;
    scheduleProjectSave();
    renderStatus();
  });

  document.querySelector("#project-description-input").addEventListener("input", (event) => {
    state.project.description = event.target.value;
    scheduleProjectSave();
    renderStatus();
  });

  document.querySelector("#author-name-input").addEventListener("input", (event) => {
    setAuthorName(event.target.value);
  });

  document.querySelector("#copy-link-button").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      flashStatus("Ссылка скопирована", "saved");
    } catch {
      flashStatus("Не удалось скопировать ссылку", "error");
    }
  });

  document.querySelector("#add-screen-button").addEventListener("click", addScreen);

  renderEditorPanels();
}

function renderEditorPanels() {
  const projectNameInput = document.querySelector("#project-name-input");
  const projectDescriptionInput = document.querySelector("#project-description-input");
  const authorNameInput = document.querySelector("#author-name-input");

  if (projectNameInput && document.activeElement !== projectNameInput) {
    projectNameInput.value = state.project?.name || "";
  }

  if (projectDescriptionInput && document.activeElement !== projectDescriptionInput) {
    projectDescriptionInput.value = state.project?.description || "";
  }

  if (authorNameInput && document.activeElement !== authorNameInput) {
    authorNameInput.value = state.authorName;
  }

  renderStatus();
  renderScreenList();
  renderCanvas();
  renderLibrary();
  renderOutline();
  renderInspector();
  renderComments();
}

function renderStatus() {
  const statusEl = document.querySelector("#save-status");
  const lastUpdatedEl = document.querySelector("#last-updated-label");

  if (!statusEl || !state.project) return;

  let message = "Все сохранено";
  let className = "status";

  if (state.currentError) {
    message = state.currentError;
    className = "status error";
  } else if (state.remotePending) {
    message = "Есть удаленные изменения, применю после твоего сохранения";
    className = "status warn";
  } else if (state.saveState === "saving") {
    message = "Сохраняю изменения...";
    className = "status warn";
  } else if (state.lastSavedAt) {
    message = `Сохранено в ${formatTime(state.lastSavedAt)}`;
  }

  statusEl.className = className;
  statusEl.textContent = message;

  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = formatDateTime(state.project.updatedAt);
  }
}

function renderScreenList() {
  const root = document.querySelector("#screen-list");
  if (!root || !state.project) return;

  root.innerHTML = state.project.screens
    .map((screen, index) => {
      const active = screen.id === state.selectedScreenId ? "active" : "";
      return `
        <div class="screen-tile ${active}" data-screen-id="${screen.id}">
          <div class="screen-head">
            <div>
              <strong>${escapeHtml(screen.name)}</strong>
              <div class="screen-mini">${screen.viewport} • ${screen.blocks.length} blocks</div>
            </div>
            <span class="pill">${index + 1}</span>
          </div>
          <div class="screen-mini">Updated by ${escapeHtml(screen.updatedBy || "Guest")} • ${formatTime(screen.updatedAt)}</div>
          <div class="inline">
            <button class="button button-ghost" data-action="select">Открыть</button>
            <button class="button button-secondary" data-action="up">↑</button>
            <button class="button button-secondary" data-action="down">↓</button>
            <button class="button button-danger" data-action="delete">Удалить</button>
          </div>
        </div>
      `;
    })
    .join("");

  root.querySelectorAll(".screen-tile").forEach((tile) => {
    const screenId = tile.dataset.screenId;
    tile.querySelector('[data-action="select"]').addEventListener("click", () => {
      state.selectedScreenId = screenId;
      const screen = getCurrentScreen();
      state.selectedBlockId = screen?.blocks[0]?.id || null;
      renderEditorPanels();
    });

    tile.querySelector('[data-action="up"]').addEventListener("click", () => moveScreen(screenId, -1));
    tile.querySelector('[data-action="down"]').addEventListener("click", () => moveScreen(screenId, 1));
    tile.querySelector('[data-action="delete"]').addEventListener("click", () => removeScreen(screenId));
  });
}

function renderCanvas() {
  const root = document.querySelector("#canvas");
  const screen = getCurrentScreen();
  if (!root) return;

  if (!screen) {
    root.innerHTML = `<div class="empty">Нет выбранного экрана.</div>`;
    return;
  }

  const palette = paletteStyles[screen.palette] || paletteStyles.ember;
  root.innerHTML = `
    <div class="artboard" style="width: min(100%, ${screen.width}px); background: ${palette.bg}; --studio-surface:${palette.surface}; --studio-ink:${palette.ink}; --studio-accent:${palette.accent}; --studio-line:${palette.line};">
      <div class="artboard-inner">
        ${screen.blocks.map((block) => renderBlock(block)).join("")}
      </div>
    </div>
  `;

  root.querySelectorAll(".block").forEach((element) => {
    element.addEventListener("click", () => {
      state.selectedBlockId = element.dataset.blockId;
      renderOutline();
      renderInspector();
      renderCanvas();
    });
  });
}

function renderBlock(block) {
  const selected = block.id === state.selectedBlockId ? "selected" : "";
  const itemList = block.items
    .map((item) => `<div class="${block.type === "stats" ? "metric" : "chip"}">${escapeHtml(item)}</div>`)
    .join("");

  const content = {
    hero: `
      <div class="block-top">
        <div>
          <div class="block-type">${escapeHtml(block.eyebrow || "Hero")}</div>
          <h4>${escapeHtml(block.title)}</h4>
          <p>${escapeHtml(block.body)}</p>
        </div>
        <span class="pill">${escapeHtml(block.note || "Entry")}</span>
      </div>
      <div class="block-actions">
        ${block.primaryAction ? `<button class="mini-button primary">${escapeHtml(block.primaryAction)}</button>` : ""}
        ${block.secondaryAction ? `<button class="mini-button">${escapeHtml(block.secondaryAction)}</button>` : ""}
      </div>
      ${block.items.length ? `<div class="chip-row">${itemList}</div>` : ""}
    `,
    featureGrid: `
      <div class="block-top">
        <div>
          <div class="block-type">${escapeHtml(block.eyebrow || "Features")}</div>
          <h4>${escapeHtml(block.title)}</h4>
          <p>${escapeHtml(block.body)}</p>
        </div>
      </div>
      <div class="feature-grid">
        ${block.items
          .map(
            (item, index) => `
              <div class="feature-card">
                <strong>${String(index + 1).padStart(2, "0")}</strong>
                <p style="margin-top: 8px">${escapeHtml(item)}</p>
              </div>
            `,
          )
          .join("")}
      </div>
    `,
    stats: `
      <div class="block-top">
        <div style="text-align:${block.align}">
          <div class="block-type">${escapeHtml(block.eyebrow || "Stats")}</div>
          <h4>${escapeHtml(block.title)}</h4>
          <p>${escapeHtml(block.body)}</p>
        </div>
      </div>
      <div class="metric-row">${itemList}</div>
    `,
    split: `
      <div class="split-grid">
        <div>
          <div class="block-type">${escapeHtml(block.eyebrow || "Split")}</div>
          <h4>${escapeHtml(block.title)}</h4>
          <p>${escapeHtml(block.body)}</p>
          <div class="block-actions">
            ${block.primaryAction ? `<button class="mini-button primary">${escapeHtml(block.primaryAction)}</button>` : ""}
            ${block.secondaryAction ? `<button class="mini-button">${escapeHtml(block.secondaryAction)}</button>` : ""}
          </div>
        </div>
        <div class="split-box">
          <strong>${escapeHtml(block.note || "Highlights")}</strong>
          <div class="stack" style="margin-top: 12px">
            ${block.items.map((item) => `<div class="chip">${escapeHtml(item)}</div>`).join("")}
          </div>
        </div>
      </div>
    `,
    quote: `
      <div class="quote-block">
        <div class="block-type">${escapeHtml(block.eyebrow || "Quote")}</div>
        <h4>${escapeHtml(block.title)}</h4>
        <p>${escapeHtml(block.body)}</p>
        <div class="pill" style="margin-top: 18px">${escapeHtml(block.note || "Author")}</div>
      </div>
    `,
    cta: `
      <div style="text-align:${block.align}">
        <div class="block-type">${escapeHtml(block.eyebrow || "CTA")}</div>
        <h4>${escapeHtml(block.title)}</h4>
        <p>${escapeHtml(block.body)}</p>
        <div class="block-actions" style="justify-content:${block.align === "center" ? "center" : "flex-start"}">
          ${block.primaryAction ? `<button class="mini-button primary">${escapeHtml(block.primaryAction)}</button>` : ""}
          ${block.secondaryAction ? `<button class="mini-button">${escapeHtml(block.secondaryAction)}</button>` : ""}
        </div>
      </div>
    `,
    footer: `
      <div class="block-top">
        <div>
          <div class="block-type">${escapeHtml(block.eyebrow || "Footer")}</div>
          <h4>${escapeHtml(block.title)}</h4>
          <p>${escapeHtml(block.body)}</p>
        </div>
      </div>
      <div class="footer-links">
        ${block.items.map((item) => `<div class="footer-link">${escapeHtml(item)}</div>`).join("")}
      </div>
    `,
  };

  return `
    <article class="block ${selected}" data-block-id="${block.id}">
      ${content[block.type] || content.hero}
    </article>
  `;
}

function renderLibrary() {
  const root = document.querySelector("#block-library");
  if (!root) return;

  root.innerHTML = blockLibrary
    .map(
      (block) => `
        <div class="library-card">
          <h4>${block.label}</h4>
          <p>${block.description}</p>
          <button class="button button-secondary" data-type="${block.type}" style="margin-top: 12px">Добавить</button>
        </div>
      `,
    )
    .join("");

  root.querySelectorAll("button[data-type]").forEach((button) => {
    button.addEventListener("click", () => {
      addBlock(button.dataset.type);
    });
  });
}

function renderOutline() {
  const root = document.querySelector("#block-outline");
  const screen = getCurrentScreen();
  if (!root) return;

  if (!screen) {
    root.innerHTML = "";
    return;
  }

  root.innerHTML = `
    <div>
      <span class="eyebrow">Outline</span>
      <h3 style="margin-top: 10px">Порядок блоков</h3>
    </div>
    ${screen.blocks
      .map((block, index) => {
        const active = block.id === state.selectedBlockId ? "active" : "";
        return `
          <div class="outline-item ${active}" data-block-id="${block.id}">
            <div class="outline-head">
              <div>
                <h4>${escapeHtml(block.title || block.type)}</h4>
                <p>${escapeHtml(block.type)} • ${index + 1}</p>
              </div>
              <span class="pill">${index + 1}</span>
            </div>
            <div class="inline" style="margin-top: 12px">
              <button class="button button-ghost" data-action="select">Открыть</button>
              <button class="button button-secondary" data-action="up">↑</button>
              <button class="button button-secondary" data-action="down">↓</button>
              <button class="button button-secondary" data-action="duplicate">Дубль</button>
              <button class="button button-danger" data-action="delete">Удалить</button>
            </div>
          </div>
        `;
      })
      .join("")}
  `;

  root.querySelectorAll(".outline-item").forEach((item) => {
    const blockId = item.dataset.blockId;
    item.querySelector('[data-action="select"]').addEventListener("click", () => {
      state.selectedBlockId = blockId;
      renderInspector();
      renderOutline();
      renderCanvas();
    });
    item.querySelector('[data-action="up"]').addEventListener("click", () => moveBlock(blockId, -1));
    item.querySelector('[data-action="down"]').addEventListener("click", () => moveBlock(blockId, 1));
    item.querySelector('[data-action="duplicate"]').addEventListener("click", () => duplicateBlock(blockId));
    item.querySelector('[data-action="delete"]').addEventListener("click", () => removeBlock(blockId));
  });
}

function renderInspector() {
  const root = document.querySelector("#inspector");
  const screen = getCurrentScreen();
  const block = getSelectedBlock();
  if (!root) return;

  if (!screen) {
    root.innerHTML = "";
    return;
  }

  root.innerHTML = `
    <div class="stack">
      <div>
        <span class="eyebrow">Screen Settings</span>
        <h3 style="margin-top: 10px">Параметры экрана</h3>
      </div>
      <label class="label">
        Имя экрана
        <input class="input" id="screen-name-input" maxlength="80" value="${escapeHtml(screen.name)}" />
      </label>
      <label class="label">
        Viewport
        <select class="select" id="screen-viewport-select">
          ${["phone", "tablet", "desktop"]
            .map(
              (viewport) =>
                `<option value="${viewport}" ${screen.viewport === viewport ? "selected" : ""}>${viewport}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label class="label">
        Palette
        <select class="select" id="screen-palette-select">
          ${Object.keys(paletteStyles)
            .map(
              (palette) =>
                `<option value="${palette}" ${screen.palette === palette ? "selected" : ""}>${palette}</option>`,
            )
            .join("")}
        </select>
      </label>
    </div>
    ${
      block
        ? `
          <div class="stack" style="margin-top: 18px">
            <div>
              <span class="eyebrow">Selected Block</span>
              <h3 style="margin-top: 10px">${escapeHtml(block.type)}</h3>
            </div>
            <label class="label">
              Eyebrow
              <input class="input" id="block-eyebrow" maxlength="40" value="${escapeHtml(block.eyebrow)}" />
            </label>
            <label class="label">
              Title
              <input class="input" id="block-title" maxlength="120" value="${escapeHtml(block.title)}" />
            </label>
            <label class="label">
              Body
              <textarea class="textarea" id="block-body" maxlength="280">${escapeHtml(block.body)}</textarea>
            </label>
            <label class="label">
              Primary Action
              <input class="input" id="block-primary-action" maxlength="40" value="${escapeHtml(block.primaryAction)}" />
            </label>
            <label class="label">
              Secondary Action
              <input class="input" id="block-secondary-action" maxlength="40" value="${escapeHtml(block.secondaryAction)}" />
            </label>
            <label class="label">
              Note / Author
              <input class="input" id="block-note" maxlength="60" value="${escapeHtml(block.note)}" />
            </label>
            <label class="label">
              Alignment
              <select class="select" id="block-align">
                <option value="left" ${block.align === "left" ? "selected" : ""}>left</option>
                <option value="center" ${block.align === "center" ? "selected" : ""}>center</option>
              </select>
            </label>
            <label class="label">
              Items
              <textarea class="textarea" id="block-items">${escapeHtml(block.items.join("\n"))}</textarea>
            </label>
          </div>
        `
        : `<div class="empty" style="margin-top: 18px">Выбери блок на canvas или в outline.</div>`
    }
  `;

  document.querySelector("#screen-name-input").addEventListener("input", (event) => {
    updateCurrentScreen({ name: event.target.value });
  });

  document.querySelector("#screen-viewport-select").addEventListener("change", (event) => {
    updateCurrentScreen({ viewport: event.target.value });
  });

  document.querySelector("#screen-palette-select").addEventListener("change", (event) => {
    updateCurrentScreen({ palette: event.target.value });
  });

  if (!block) return;

  document.querySelector("#block-eyebrow").addEventListener("input", (event) => {
    updateSelectedBlock({ eyebrow: event.target.value });
  });

  document.querySelector("#block-title").addEventListener("input", (event) => {
    updateSelectedBlock({ title: event.target.value });
  });

  document.querySelector("#block-body").addEventListener("input", (event) => {
    updateSelectedBlock({ body: event.target.value });
  });

  document.querySelector("#block-primary-action").addEventListener("input", (event) => {
    updateSelectedBlock({ primaryAction: event.target.value });
  });

  document.querySelector("#block-secondary-action").addEventListener("input", (event) => {
    updateSelectedBlock({ secondaryAction: event.target.value });
  });

  document.querySelector("#block-note").addEventListener("input", (event) => {
    updateSelectedBlock({ note: event.target.value });
  });

  document.querySelector("#block-align").addEventListener("change", (event) => {
    updateSelectedBlock({ align: event.target.value });
  });

  document.querySelector("#block-items").addEventListener("input", (event) => {
    updateSelectedBlock({
      items: event.target.value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8),
    });
  });
}

function renderComments() {
  const listRoot = document.querySelector("#comment-list");
  const formRoot = document.querySelector("#comment-form");
  const screen = getCurrentScreen();
  if (!listRoot || !formRoot || !state.project) return;

  const comments = state.project.comments.filter((comment) => comment.screenId === screen?.id);

  listRoot.innerHTML = `
    <div>
      <span class="eyebrow">Comments</span>
      <h3 style="margin-top: 10px">Обсуждение экрана</h3>
    </div>
    ${
      comments.length
        ? comments
            .map(
              (comment) => `
                <div class="comment-item">
                  <div class="comment-head">
                    <strong>${escapeHtml(comment.authorName)}</strong>
                    <span class="small muted">${formatDateTime(comment.createdAt)}</span>
                  </div>
                  <p>${escapeHtml(comment.body)}</p>
                </div>
              `,
            )
            .join("")
        : `<div class="empty">Пока без комментариев. Оставь первый и команда увидит его без перезагрузки.</div>`
    }
  `;

  formRoot.innerHTML = `
    <div class="stack">
      <label class="label">
        Новый комментарий
        <textarea class="textarea" id="comment-input" maxlength="500" placeholder="Например: CTA слишком общий, давай сузим оффер"></textarea>
      </label>
      <button class="button button-primary" id="send-comment-button">Отправить комментарий</button>
    </div>
  `;

  document.querySelector("#send-comment-button").addEventListener("click", addComment);
}

function getCurrentScreen() {
  return state.project?.screens.find((screen) => screen.id === state.selectedScreenId) || null;
}

function getSelectedBlock() {
  return getCurrentScreen()?.blocks.find((block) => block.id === state.selectedBlockId) || null;
}

function updateCurrentScreen(patch) {
  const screen = getCurrentScreen();
  if (!screen) return;

  Object.assign(screen, patch);

  if (patch.viewport) {
    screen.width = {
      phone: 390,
      tablet: 768,
      desktop: 1180,
    }[patch.viewport] || 1180;
  }

  screen.updatedBy = state.authorName;
  renderCanvas();
  renderScreenList();
  renderInspector();
  scheduleScreenSave(screen.id);
}

function updateSelectedBlock(patch) {
  const block = getSelectedBlock();
  const screen = getCurrentScreen();
  if (!block || !screen) return;

  Object.assign(block, patch);
  screen.updatedBy = state.authorName;
  renderCanvas();
  renderOutline();
  scheduleScreenSave(screen.id);
}

function createBlock(type) {
  const id = crypto.randomUUID();
  const templates = {
    hero: {
      id,
      type,
      eyebrow: "Hero",
      title: "Новый hero-блок",
      body: "Собери основное сообщение экрана и два понятных действия.",
      primaryAction: "Начать",
      secondaryAction: "Узнать больше",
      note: "Первый экран",
      items: ["Короткий оффер", "Пояснение", "CTA"],
      align: "left",
    },
    featureGrid: {
      id,
      type,
      eyebrow: "Features",
      title: "Набор преимуществ",
      body: "Используй карточки для преимуществ, шагов или модулей.",
      primaryAction: "",
      secondaryAction: "",
      note: "3 карточки",
      items: ["Первый тезис", "Второй тезис", "Третий тезис"],
      align: "left",
    },
    stats: {
      id,
      type,
      eyebrow: "Stats",
      title: "Цифры и доказательства",
      body: "Числа помогают быстро зафиксировать пользу.",
      primaryAction: "",
      secondaryAction: "",
      note: "Метрики",
      items: ["1200 команд", "9 минут на прототип", "85% принятия"],
      align: "center",
    },
    split: {
      id,
      type,
      eyebrow: "Split",
      title: "Текст + смысловой бокс",
      body: "Хорошо работает для explainers и key flows.",
      primaryAction: "Открыть flow",
      secondaryAction: "",
      note: "Что важно",
      items: ["Контекст", "Риск", "Результат"],
      align: "left",
    },
    quote: {
      id,
      type,
      eyebrow: "Quote",
      title: "“Согласовали экран быстрее обычного”",
      body: "Добавь короткую цитату пользователя или команды.",
      primaryAction: "",
      secondaryAction: "",
      note: "Алина, founder",
      items: [],
      align: "center",
    },
    cta: {
      id,
      type,
      eyebrow: "CTA",
      title: "Пора перейти к следующему шагу",
      body: "Зафиксируй главное действие и не распыляй фокус.",
      primaryAction: "Продолжить",
      secondaryAction: "Поделиться",
      note: "Конец экрана",
      items: [],
      align: "center",
    },
    footer: {
      id,
      type,
      eyebrow: "Footer",
      title: "Ссылки и служебные блоки",
      body: "Вторичная навигация и финальный слой информации.",
      primaryAction: "",
      secondaryAction: "",
      note: "Footer",
      items: ["Pricing", "Docs", "Telegram"],
      align: "left",
    },
  };

  return templates[type] || templates.hero;
}

function addBlock(type) {
  const screen = getCurrentScreen();
  if (!screen) return;

  const block = createBlock(type);
  screen.blocks.push(block);
  screen.updatedBy = state.authorName;
  state.selectedBlockId = block.id;
  renderCanvas();
  renderOutline();
  renderInspector();
  renderScreenList();
  scheduleScreenSave(screen.id);
}

function moveBlock(blockId, direction) {
  const screen = getCurrentScreen();
  if (!screen) return;
  const index = screen.blocks.findIndex((block) => block.id === blockId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= screen.blocks.length) return;

  const [block] = screen.blocks.splice(index, 1);
  screen.blocks.splice(nextIndex, 0, block);
  screen.updatedBy = state.authorName;
  renderCanvas();
  renderOutline();
  scheduleScreenSave(screen.id);
}

function duplicateBlock(blockId) {
  const screen = getCurrentScreen();
  const block = screen?.blocks.find((item) => item.id === blockId);
  if (!screen || !block) return;

  const duplicate = {
    ...structuredClone(block),
    id: crypto.randomUUID(),
    title: `${block.title} copy`,
  };

  const index = screen.blocks.findIndex((item) => item.id === blockId);
  screen.blocks.splice(index + 1, 0, duplicate);
  screen.updatedBy = state.authorName;
  state.selectedBlockId = duplicate.id;
  renderCanvas();
  renderOutline();
  renderInspector();
  scheduleScreenSave(screen.id);
}

function removeBlock(blockId) {
  const screen = getCurrentScreen();
  if (!screen) return;

  screen.blocks = screen.blocks.filter((block) => block.id !== blockId);
  state.selectedBlockId = screen.blocks[0]?.id || null;
  screen.updatedBy = state.authorName;
  renderCanvas();
  renderOutline();
  renderInspector();
  scheduleScreenSave(screen.id);
}

async function addScreen() {
  if (!state.project) return;

  try {
    const { project } = await api(`/api/projects/${state.project.id}/screens`, {
      method: "POST",
      body: JSON.stringify({
        name: `Экран ${state.project.screens.length + 1}`,
        updatedBy: state.authorName,
      }),
    });
    applyProject(project);
    state.selectedScreenId = project.screens.at(-1)?.id || state.selectedScreenId;
    state.selectedBlockId = getCurrentScreen()?.blocks[0]?.id || null;
    state.lastSavedAt = project.updatedAt;
    renderEditorPanels();
  } catch (error) {
    flashStatus(error.message, "error");
  }
}

async function moveScreen(screenId, direction) {
  if (!state.project) return;
  const screens = [...state.project.screens];
  const index = screens.findIndex((screen) => screen.id === screenId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= screens.length) return;

  const [screen] = screens.splice(index, 1);
  screens.splice(nextIndex, 0, screen);
  state.project.screens = screens;
  renderScreenList();

  try {
    const { project } = await api(`/api/projects/${state.project.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        screenOrder: screens.map((item) => item.id),
      }),
    });
    applyProject(project);
    state.lastSavedAt = project.updatedAt;
    renderEditorPanels();
  } catch (error) {
    flashStatus(error.message, "error");
  }
}

async function removeScreen(screenId) {
  if (!state.project) return;

  try {
    const { project } = await api(`/api/projects/${state.project.id}/screens/${screenId}`, {
      method: "DELETE",
    });
    applyProject(project);
    state.lastSavedAt = project.updatedAt;
    renderEditorPanels();
  } catch (error) {
    flashStatus(error.message, "error");
  }
}

async function addComment() {
  const input = document.querySelector("#comment-input");
  const body = input.value.trim();
  if (!body || !state.project) return;

  try {
    const { project } = await api(`/api/projects/${state.project.id}/comments`, {
      method: "POST",
      body: JSON.stringify({
        screenId: state.selectedScreenId,
        authorName: state.authorName,
        body,
      }),
    });
    applyProject(project);
    input.value = "";
    state.lastSavedAt = project.updatedAt;
    renderComments();
    renderStatus();
  } catch (error) {
    flashStatus(error.message, "error");
  }
}

function scheduleProjectSave() {
  clearTimeout(state.projectSaveTimer);
  state.saveState = "saving";
  state.currentError = "";
  state.remotePending = false;

  state.projectSaveTimer = setTimeout(async () => {
    try {
      const { project } = await api(`/api/projects/${state.project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: state.project.name,
          description: state.project.description,
        }),
      });
      applyProject(project);
      state.lastSavedAt = project.updatedAt;
      state.saveState = "saved";
      renderStatus();
      if (state.remotePending) {
        state.remotePending = false;
        await refreshProject();
      }
    } catch (error) {
      state.currentError = error.message;
      state.saveState = "error";
      renderStatus();
    }
  }, 450);
}

function scheduleScreenSave(screenId) {
  clearTimeout(state.screenSaveTimer);
  state.saveState = "saving";
  state.currentError = "";
  const snapshot = structuredClone(getCurrentScreen());

  state.screenSaveTimer = setTimeout(async () => {
    if (!snapshot || !state.project) return;

    try {
      const { project } = await api(`/api/projects/${state.project.id}/screens/${screenId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: snapshot.name,
          viewport: snapshot.viewport,
          palette: snapshot.palette,
          blocks: snapshot.blocks,
          updatedBy: state.authorName,
        }),
      });
      applyProject(project);
      state.lastSavedAt = project.updatedAt;
      state.saveState = "saved";
      renderStatus();
      renderScreenList();
      if (state.remotePending) {
        state.remotePending = false;
        await refreshProject();
      }
    } catch (error) {
      state.currentError = error.message;
      state.saveState = "error";
      renderStatus();
    }
  }, 650);
}

async function refreshProject() {
  if (!state.project) return;
  const { project } = await api(`/api/projects/${state.project.id}`);
  applyProject(project);
  state.lastSavedAt = project.updatedAt;
  renderEditorPanels();
}

function connectProjectStream() {
  if (!state.project) return;

  cleanupEventStream();
  const source = new EventSource(`/api/projects/${state.project.id}/events`);
  state.eventSource = source;

  source.onmessage = async (event) => {
    const payload = JSON.parse(event.data);
    if (!payload || payload.updatedAt === state.project.updatedAt) return;

    if (state.saveState === "saving") {
      state.remotePending = true;
      renderStatus();
      return;
    }

    await refreshProject();
  };

  source.onerror = () => {
    state.currentError = "Связь с live-sync прерывается, пробую переподключиться";
    renderStatus();
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

function flashStatus(message, variant) {
  state.currentError = variant === "error" ? message : "";
  state.saveState = variant === "error" ? "error" : "saved";
  if (variant !== "error") {
    state.lastSavedAt = new Date().toISOString();
  }
  const statusEl = document.querySelector("#save-status");
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = `status ${variant === "error" ? "error" : "warn"}`;
    setTimeout(() => {
      state.currentError = "";
      renderStatus();
    }, 1800);
  }
}

function renderNotFound() {
  app.innerHTML = `
    <main class="shell">
      <section class="panel not-found stack">
        <span class="eyebrow">Project not found</span>
        <h1>Комната не найдена</h1>
        <p class="muted">Проверь ссылку или вернись к списку проектов, чтобы открыть существующую room.</p>
        <a class="button button-primary" href="/" style="width: fit-content; text-decoration: none">Перейти к проектам</a>
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
