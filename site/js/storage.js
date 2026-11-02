(() => {
  const keys = {
    liked: "uygurtube-liked",
    later: "uygurtube-watch-later",
    history: "uygurtube-history",
    theme: "uygurtube-theme",
  };
  const validVideoId = /^[A-Za-z0-9_-]{11}$/;

  function readIds(listName) {
    let value;
    try {
      value = JSON.parse(localStorage.getItem(keys[listName]) || "[]");
    } catch (error) {
      console.error(`UygurTube ${listName} verisi okunamadı.`, error);
      return [];
    }
    if (!Array.isArray(value)) {
      console.error(`UygurTube ${listName} verisi bir liste değil.`);
      return [];
    }
    return [...new Set(value.filter((id) => typeof id === "string" && validVideoId.test(id)))];
  }

  function writeIds(listName, ids) {
    const uniqueIds = [...new Set(ids.filter((id) => typeof id === "string" && validVideoId.test(id)))];
    localStorage.setItem(keys[listName], JSON.stringify(uniqueIds));
    window.dispatchEvent(new CustomEvent("uygurtube:library-change"));
    return uniqueIds;
  }

  function toggleId(listName, id) {
    if (!validVideoId.test(id)) throw new TypeError("Video kimliği geçersiz.");
    const ids = readIds(listName);
    const saved = ids.includes(id);
    writeIds(listName, saved ? ids.filter((item) => item !== id) : [id, ...ids]);
    return !saved;
  }

  function addToHistory(id) {
    if (!validVideoId.test(id)) return;
    writeIds("history", [id, ...readIds("history").filter((item) => item !== id)].slice(0, 100));
  }

  function syncThemeControls(theme) {
    document.documentElement.dataset.theme = theme;
    const button = document.querySelector("#theme-toggle");
    if (button) {
      button.textContent = theme === "dark" ? "☾" : "☼";
      button.setAttribute("aria-label", theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç");
    }
    const settingsButton = document.querySelector("#settings-theme");
    if (settingsButton) {
      settingsButton.textContent = theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç";
    }
  }

  function setTheme(theme) {
    syncThemeControls(theme);
    localStorage.setItem(keys.theme, theme);
  }

  const savedTheme = localStorage.getItem(keys.theme);
  syncThemeControls(savedTheme || "dark");

  for (const button of document.querySelectorAll("#theme-toggle, #settings-theme")) {
    button.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      setTheme(next);
    });
  }

  window.UygurTubeStorage = Object.freeze({
    readIds,
    toggleId,
    addToHistory,
    writeIds,
    isSaved(listName, id) {
      return readIds(listName).includes(id);
    },
  });
})();
