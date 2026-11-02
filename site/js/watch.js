const player = document.querySelector("#player");
const title = document.querySelector("#watch-title");
const channel = document.querySelector("#watch-channel");
const category = document.querySelector("#watch-category");
const metadata = document.querySelector("#watch-meta");
const relatedList = document.querySelector("#related-list");
const loadError = document.querySelector("#load-error");
const storage = window.UygurTubeStorage;
let currentVideoId = "";
const sidebar = document.querySelector(".watch-sidebar");

document.querySelector("#mobile-menu").addEventListener("click", (event) => {
  const open = sidebar.classList.toggle("is-open");
  event.currentTarget.setAttribute("aria-expanded", String(open));
});

function reportError(message) {
  loadError.hidden = false;
  loadError.textContent = message;
}

function makeRelatedCard(video) {
  const link = document.createElement("a");
  link.className = "related-card";
  link.href = `watch.html?v=${encodeURIComponent(video.id)}`;
  const image = document.createElement("img");
  image.src = video.thumbnail || "";
  image.alt = video.title;
  image.dir = "auto";
  image.loading = "lazy";
  const details = document.createElement("span");
  details.className = "related-details";
  const name = document.createElement("strong");
  name.dir = "auto";
  name.textContent = video.title;
  const source = document.createElement("span");
  source.dir = "auto";
  source.textContent = video.channel;
  details.append(name, source);
  link.append(image, details);
  return link;
}

function updateWatchActions() {
  const liked = storage.isSaved("liked", currentVideoId);
  const later = storage.isSaved("later", currentVideoId);
  const likeButton = document.querySelector("#like-video");
  const laterButton = document.querySelector("#save-video");
  likeButton.textContent = liked ? "♥ Beğenildi" : "♡ Beğen";
  laterButton.textContent = later ? "✓ Sonra izle listesinde" : "＋ Sonra izle";
  likeButton.setAttribute("aria-pressed", String(liked));
  laterButton.setAttribute("aria-pressed", String(later));
}

for (const [buttonId, listName] of [["like-video", "liked"], ["save-video", "later"]]) {
  document.querySelector(`#${buttonId}`).addEventListener("click", () => {
    try {
      storage.toggleId(listName, currentVideoId);
      updateWatchActions();
    } catch (error) {
      reportError(`Kişisel listeniz güncellenemedi: ${error.message}`);
    }
  });
}

async function loadWatchPage() {
  try {
    const response = await fetch("data/videos.json");
    if (!response.ok) throw new Error(`Katalog yüklenemedi (HTTP ${response.status}).`);
    const videos = await response.json();
    if (!Array.isArray(videos)) throw new Error("Video kataloğunun biçimi geçersiz.");

    const videoId = new URLSearchParams(location.search).get("v");
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      throw new Error("Video bağlantısı geçersiz.");
    }
    const video = videos.find((item) => item.id === videoId);
    if (!video) throw new Error("Bu video katalogda bulunamadı.");
    currentVideoId = videoId;

    const frame = document.createElement("iframe");
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}`;
    frame.title = video.title;
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    player.append(frame);
    title.textContent = video.title;
    channel.textContent = video.channel;
    category.textContent = video.category;
    metadata.textContent = `${Number(video.views).toLocaleString("tr-TR")} görüntülenme · ${new Date(video.publishedAt).toLocaleDateString("tr-TR")}`;
    document.title = `${video.title} — UygurTube`;
    updateWatchActions();
    try {
      storage.addToHistory(video.id);
    } catch (error) {
      reportError(`İzleme geçmişi kaydedilemedi: ${error.message}`);
    }

    const related = videos
      .filter((item) => item.id !== video.id)
      .map((item) => ({
        video: item,
        score: (item.channelId === video.channelId ? 2 : 0)
          + (item.category === video.category ? 1 : 0),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || Date.parse(b.video.publishedAt) - Date.parse(a.video.publishedAt))
      .slice(0, 10)
      .map((item) => item.video);
    relatedList.replaceChildren(...related.map(makeRelatedCard));
    if (related.length === 0) {
      const empty = document.createElement("p");
      empty.className = "related-empty";
      empty.textContent = "Henüz benzer video yok.";
      relatedList.append(empty);
    }
  } catch (error) {
    reportError(`${error.message} Ana sayfaya dönüp başka bir video seçebilirsiniz.`);
    title.textContent = "Video açılamadı";
  }
}

loadWatchPage();
