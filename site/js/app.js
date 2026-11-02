const PAGE_SIZE = 24;
const LONG_VIDEO_SECONDS = 20 * 60;
const storage = window.UygurTubeStorage;
const grid = document.querySelector("#video-grid");
const searchInput = document.querySelector("#search");
const categoryFilter = document.querySelector("#category-filter");
const scriptFilter = document.querySelector("#script-filter");
const sortOrder = document.querySelector("#sort-order");
const resultCount = document.querySelector("#result-count");
const emptyState = document.querySelector("#empty-state");
const loadError = document.querySelector("#load-error");
const loadMoreButton = document.querySelector("#load-more");
const browseArea = document.querySelector("#browse-area");
const toolbar = document.querySelector("#toolbar");
const settingsPanel = document.querySelector("#settings-panel");
const viewTitle = document.querySelector("#view-title");
const viewDescription = document.querySelector("#view-description");
const sidebar = document.querySelector("#sidebar");
const drawerBackdrop = document.querySelector("#drawer-backdrop");
const mobileMenu = document.querySelector("#mobile-menu");
const categoryNavToggle = document.querySelector("#category-nav-toggle");
const sidebarCategories = document.querySelector("#sidebar-categories");
let videos = [];
let visibleCount = PAGE_SIZE;
let activeView = "home";

const viewLabels = {
  home: ["Keşfet", "Kanallardan seçilmiş yeni videolar."],
  longs: ["Uzun videolar", "20 dakika ve üzerindeki videolar."],
  liked: ["Beğenilenler", "Bu tarayıcıda beğendiğiniz videolar."],
  later: ["Sonra izle", "Daha sonra izlemek için kaydettikleriniz."],
  history: ["Geçmiş", "Son izlediğiniz videolar bu tarayıcıda tutulur."],
  settings: ["Ayarlar", "Görünüm ve bu tarayıcıda saklanan veriler."],
};
const libraryViews = { liked: "liked", later: "later", history: "history" };

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function timeAgo(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  if (days < 1) return "Bugün";
  if (days < 30) return `${days} gün önce`;
  if (days < 365) return `${Math.floor(days / 30)} ay önce`;
  return `${Math.floor(days / 365)} yıl önce`;
}

function makeActionButton(video, listName, label, icon) {
  const selected = storage.isSaved(listName, video.id);
  const button = document.createElement("button");
  button.className = `card-action${selected ? " is-selected" : ""}`;
  button.type = "button";
  button.dataset.list = listName;
  button.dataset.videoId = video.id;
  button.setAttribute("aria-label", `${selected ? "Listeden çıkar" : label}: ${video.title}`);
  button.setAttribute("aria-pressed", String(selected));
  button.title = `${selected ? "Listeden çıkar" : label}`;
  button.textContent = selected ? (listName === "liked" ? "♥" : "✓") : icon;
  return button;
}

function makeCard(video) {
  const card = document.createElement("article");
  card.className = "video-card";
  const link = document.createElement("a");
  link.className = "thumbnail-link";
  link.href = `watch.html?v=${encodeURIComponent(video.id)}`;
  link.setAttribute("aria-label", video.title);

  const image = document.createElement("img");
  image.className = "thumbnail";
  image.src = video.thumbnail || "";
  image.alt = video.title;
  image.dir = "auto";
  image.loading = "lazy";
  image.decoding = "async";
  link.append(image);

  const duration = document.createElement("span");
  duration.className = "duration-badge";
  duration.textContent = formatDuration(video.duration);
  link.append(duration);

  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.append(
    makeActionButton(video, "liked", "Beğen", "♡"),
    makeActionButton(video, "later", "Sonra izle listesine ekle", "＋"),
  );

  const details = document.createElement("div");
  details.className = "card-details";
  const title = document.createElement("h2");
  title.className = "card-title";
  title.dir = "auto";
  title.textContent = video.title;
  const channel = document.createElement("p");
  channel.className = "card-channel";
  channel.dir = "auto";
  channel.textContent = video.channel;
  const metadata = document.createElement("p");
  metadata.className = "card-meta";
  metadata.textContent = `${Number(video.views).toLocaleString("tr-TR")} görüntülenme · ${timeAgo(video.publishedAt)}`;
  details.append(title, channel, metadata);
  card.append(link, actions, details);
  return card;
}

function updateLibraryCounts() {
  document.querySelector("#liked-count").textContent = storage.readIds("liked").length;
  document.querySelector("#later-count").textContent = storage.readIds("later").length;
  document.querySelector("#history-count").textContent = storage.readIds("history").length;
}

function setDrawerOpen(open) {
  if (open) {
    const headerBottom = Math.ceil(document.querySelector(".site-header").getBoundingClientRect().bottom);
    document.documentElement.style.setProperty("--app-header-height", `${headerBottom}px`);
  }
  sidebar.classList.toggle("is-open", open);
  sidebar.setAttribute("aria-hidden", String(!open));
  drawerBackdrop.hidden = !open;
  document.body.classList.toggle("drawer-open", open);
  mobileMenu.setAttribute("aria-expanded", String(open));
  mobileMenu.setAttribute("aria-label", open ? "Menüyü kapat" : "Menüyü aç");
}

function setActiveView(view) {
  activeView = view;
  visibleCount = PAGE_SIZE;
  document.querySelectorAll("[data-view]").forEach((item) => {
    const active = item.dataset.view === view;
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  const [heading, description] = viewLabels[view];
  viewTitle.textContent = view === "home" && categoryFilter.value
    ? categoryFilter.value
    : heading;
  viewDescription.textContent = description;
  browseArea.hidden = view === "settings";
  toolbar.hidden = view === "settings";
  settingsPanel.hidden = view !== "settings";
  setDrawerOpen(false);
  render();
}

function filteredVideos() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const category = categoryFilter.value;
  const script = scriptFilter.value;
  const savedIds = libraryViews[activeView] ? new Set(storage.readIds(libraryViews[activeView])) : null;
  const matches = videos.filter((video) => {
    const text = `${video.title} ${video.channel} ${video.category}`.toLocaleLowerCase();
    const isLong = Number(video.duration) >= LONG_VIDEO_SECONDS;
    return (!query || text.includes(query))
      && (!category || video.category === category)
      && (!script || video.script === script)
      && (activeView !== "longs" || isLong)
      && (!savedIds || savedIds.has(video.id));
  });
  if (activeView === "history") {
    const historyOrder = new Map(storage.readIds("history").map((id, index) => [id, index]));
    matches.sort((a, b) => historyOrder.get(a.id) - historyOrder.get(b.id));
  } else if (sortOrder.value === "views") {
    matches.sort((a, b) => Number(b.views) - Number(a.views));
  } else {
    const direction = sortOrder.value === "oldest" ? 1 : -1;
    matches.sort((a, b) => direction * ((Date.parse(a.publishedAt) || 0) - (Date.parse(b.publishedAt) || 0)));
  }
  return matches;
}

function render() {
  updateLibraryCounts();
  const matches = filteredVideos();
  const page = matches.slice(0, visibleCount);
  grid.replaceChildren(...page.map(makeCard));
  resultCount.textContent = `${matches.length.toLocaleString("tr-TR")} video`;
  emptyState.hidden = matches.length > 0;
  loadMoreButton.hidden = page.length >= matches.length;
}

function renderCategories() {
  const counts = new Map();
  for (const video of videos) {
    if (video.category) counts.set(video.category, (counts.get(video.category) || 0) + 1);
  }
  const categories = [...counts].sort(([a], [b]) => a.localeCompare(b, "tr"));
  const makeCategoryButton = ([name, count]) => {
    const button = document.createElement("button");
    button.className = "nav-item category-nav-item";
    button.type = "button";
    button.dataset.category = name;
    const icon = document.createElement("span");
    icon.className = "nav-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "·";
    const label = document.createElement("span");
    label.textContent = name;
    const total = document.createElement("span");
    total.className = "nav-count";
    total.textContent = count.toLocaleString("tr-TR");
    button.append(icon, label, total);
    return button;
  };
  sidebarCategories.replaceChildren(...categories.map((category) => makeCategoryButton(category)));
  categoryFilter.replaceChildren(new Option("Tüm kategoriler", ""));
  for (const [name] of categories) categoryFilter.add(new Option(name, name));
}

function chooseCategory(category) {
  categoryFilter.value = category;
  setActiveView("home");
}

for (const filter of [searchInput, categoryFilter, scriptFilter, sortOrder]) {
  filter.addEventListener(filter === searchInput ? "input" : "change", () => {
    visibleCount = PAGE_SIZE;
    if (activeView === "categories" || activeView === "settings") activeView = "home";
    setActiveView(activeView);
  });
}

document.querySelector("#primary-nav").addEventListener("click", (event) => {
  const categoryButton = event.target.closest("[data-category]");
  if (categoryButton) {
    chooseCategory(categoryButton.dataset.category);
    return;
  }
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) setActiveView(viewButton.dataset.view);
});

grid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-list][data-video-id]");
  if (!button) return;
  try {
    storage.toggleId(button.dataset.list, button.dataset.videoId);
  } catch (error) {
    loadError.hidden = false;
    loadError.textContent = `Liste güncellenemedi: ${error.message}`;
  }
});

categoryNavToggle.addEventListener("click", () => {
  const expanded = categoryNavToggle.getAttribute("aria-expanded") !== "true";
  categoryNavToggle.setAttribute("aria-expanded", String(expanded));
  sidebarCategories.hidden = !expanded;
});

mobileMenu.addEventListener("click", () => {
  setDrawerOpen(mobileMenu.getAttribute("aria-expanded") !== "true");
});
document.querySelector("#drawer-close").addEventListener("click", () => {
  setDrawerOpen(false);
  mobileMenu.focus();
});
drawerBackdrop.addEventListener("click", () => setDrawerOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mobileMenu.getAttribute("aria-expanded") === "true") {
    setDrawerOpen(false);
    mobileMenu.focus();
  }
});

document.querySelector("#clear-library").addEventListener("click", () => {
  if (!confirm("Bu tarayıcıdaki beğeniler, Sonra izle listeniz ve geçmişiniz silinsin mi?")) return;
  try {
    for (const key of Object.keys(libraryViews)) storage.writeIds(key, []);
    setActiveView(activeView);
  } catch (error) {
    loadError.hidden = false;
    loadError.textContent = `Kişisel veriler temizlenemedi: ${error.message}`;
  }
});

loadMoreButton.addEventListener("click", () => {
  visibleCount += PAGE_SIZE;
  render();
});
window.addEventListener("uygurtube:library-change", render);

async function loadVideos() {
  try {
    const response = await fetch("data/videos.json");
    if (!response.ok) throw new Error(`Katalog yüklenemedi (HTTP ${response.status}).`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Video kataloğunun biçimi geçersiz.");
    videos = data;
    renderCategories();
    const params = new URLSearchParams(location.search);
    searchInput.value = params.get("q") || "";
    const selectedCategory = params.get("category") || "";
    if ([...categoryFilter.options].some((option) => option.value === selectedCategory)) {
      categoryFilter.value = selectedCategory;
    }
    const requestedView = params.get("view");
    setActiveView(
      Object.hasOwn(viewLabels, requestedView) && requestedView !== "categories"
        ? requestedView
        : "home",
    );
    if (requestedView === "categories") {
      setDrawerOpen(true);
      categoryNavToggle.setAttribute("aria-expanded", "true");
      sidebarCategories.hidden = false;
    }
  } catch (error) {
    loadError.hidden = false;
    loadError.textContent = `${error.message} Sayfayı bir yerel web sunucusunda açtığınızdan emin olun.`;
  }
}

loadVideos();
