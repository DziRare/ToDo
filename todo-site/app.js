// Todo app — talks to the FastAPI Lambda via the Function URL.
// Routes: PUT /create-task, GET /list-tasks/{user_id}, PUT /update-task,
// DELETE /delete-task/{task_id}.

(() => {
  const API_URL = window.APP_CONFIG.API_URL;
  const STORAGE_KEY = "todo.user_id";

  // --- State ---
  let userId = loadUserId();
  let tasks = [];
  let filter = "all";

  // --- DOM refs ---
  const $ = (id) => document.getElementById(id);
  const tasksEl = $("tasks");
  const emptyEl = $("empty");
  const loadingEl = $("loading");
  const errorEl = $("error");
  const statusCountEl = $("status-count");
  const userButton = $("user-button");
  const userModal = $("user-modal");
  const userInput = $("user-input");

  // --- User id management ---
  function loadUserId() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    } catch (e) { /* localStorage may be unavailable */ }
    const fresh = "user_" + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(STORAGE_KEY, fresh); } catch (e) {}
    return fresh;
  }

  function setUserId(newId) {
    userId = newId;
    try { localStorage.setItem(STORAGE_KEY, newId); } catch (e) {}
    renderUserPill();
    loadTasks();
  }

  function renderUserPill() {
    const display = userId.length > 14 ? userId.slice(0, 14) + "…" : userId;
    userButton.textContent = display;
    userButton.title = userId;
  }

  // --- API calls ---
  async function api(path, options = {}) {
    const res = await fetch(API_URL + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        if (body.detail) detail = body.detail;
      } catch (e) {}
      throw new Error(`${res.status}: ${detail}`);
    }
    return res.json();
  }

  async function loadTasks() {
    showError(null);
    loadingEl.style.display = "block";
    tasksEl.style.display = "none";
    emptyEl.style.display = "none";
    try {
      const data = await api(`/list-tasks/${encodeURIComponent(userId)}`);
      tasks = data.tasks || [];
    } catch (err) {
      tasks = [];
      showError("Couldn't load tasks. " + err.message);
    } finally {
      loadingEl.style.display = "none";
      render();
    }
  }

  async function createTask(content) {
    const data = await api("/create-task", {
      method: "PUT",
      body: JSON.stringify({ user_id: userId, content }),
    });
    // Prepend so newest shows first (matches the API's ScanIndexForward=false).
    tasks.unshift(data.task);
    render();
  }

  async function toggleTask(task) {
    const next = !task.is_done;
    // Optimistic update
    task.is_done = next;
    render();
    try {
      await api("/update-task", {
        method: "PUT",
        body: JSON.stringify({
          task_id: task.task_id,
          content: task.content,
          is_done: next,
        }),
      });
    } catch (err) {
      task.is_done = !next; // revert
      render();
      showError("Couldn't update task. " + err.message);
    }
  }

  async function deleteTask(taskId) {
    const before = tasks;
    tasks = tasks.filter(t => t.task_id !== taskId);
    render();
    try {
      await api(`/delete-task/${encodeURIComponent(taskId)}`, { method: "DELETE" });
    } catch (err) {
      tasks = before; // revert
      render();
      showError("Couldn't delete task. " + err.message);
    }
  }

  // --- Rendering ---
  function render() {
    const visible = tasks.filter(t => {
      if (filter === "active") return !t.is_done;
      if (filter === "done") return !!t.is_done;
      return true;
    });

    const doneCount = tasks.filter(t => t.is_done).length;
    const total = tasks.length;
    statusCountEl.textContent = total === 0
      ? "0 tasks"
      : `${doneCount} of ${total} done`;

    if (visible.length === 0) {
      tasksEl.style.display = "none";
      emptyEl.style.display = "block";
      emptyEl.textContent = total === 0
        ? "No tasks yet. Add one above."
        : `No ${filter} tasks.`;
      return;
    }

    tasksEl.style.display = "flex";
    emptyEl.style.display = "none";
    tasksEl.innerHTML = "";
    for (const task of visible) {
      tasksEl.appendChild(renderTaskRow(task));
    }
  }

  function renderTaskRow(task) {
    const row = document.createElement("div");
    row.className = "task" + (task.is_done ? " done" : "");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!task.is_done;
    cb.addEventListener("change", () => toggleTask(task));

    const content = document.createElement("span");
    content.className = "content";
    content.textContent = task.content;

    const del = document.createElement("button");
    del.className = "delete";
    del.type = "button";
    del.setAttribute("aria-label", "Delete task");
    del.textContent = "×";
    del.addEventListener("click", () => deleteTask(task.task_id));

    row.append(cb, content, del);
    return row;
  }

  function showError(msg) {
    if (!msg) {
      errorEl.style.display = "none";
      errorEl.textContent = "";
    } else {
      errorEl.style.display = "block";
      errorEl.textContent = msg;
    }
  }

  // --- Wire up events ---
  $("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("new-task");
    const content = input.value.trim();
    if (!content) return;
    const btn = $("add-btn");
    btn.disabled = true;
    try {
      await createTask(content);
      input.value = "";
    } catch (err) {
      showError("Couldn't create task. " + err.message);
    } finally {
      btn.disabled = false;
      input.focus();
    }
  });

  document.querySelectorAll(".filters button").forEach(btn => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      document.querySelectorAll(".filters button").forEach(b => {
        b.classList.toggle("active", b === btn);
      });
      render();
    });
  });

  $("refresh").addEventListener("click", loadTasks);

  // User modal
  userButton.addEventListener("click", () => {
    userInput.value = userId;
    userModal.style.display = "flex";
    setTimeout(() => userInput.focus(), 0);
  });
  $("user-cancel").addEventListener("click", () => {
    userModal.style.display = "none";
  });
  $("user-save").addEventListener("click", () => {
    const val = userInput.value.trim();
    if (val && val !== userId) setUserId(val);
    userModal.style.display = "none";
  });
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("user-save").click();
    if (e.key === "Escape") $("user-cancel").click();
  });
  userModal.addEventListener("click", (e) => {
    if (e.target === userModal) userModal.style.display = "none";
  });

  // --- Boot ---
  renderUserPill();
  loadTasks();
})();
