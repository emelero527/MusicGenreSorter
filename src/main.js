// main.js
// Spotify Genre Organizer - Safe DOM-ready version with Add Genre button

// --------- Config / State ----------
const CLIENT_ID = "a9efb5fedc654d20b0ad8aefa93858bd"; // replace with your own if needed
const REDIRECT_URI = "https://emelero527.github.io/MusicGenreSorter/"; // must match Spotify dashboard
const SCOPE = "user-library-read playlist-modify-public playlist-modify-private";



let accessToken = null;
let allSongs = [];
let genreMap = {};
let genreChart = null;
let currentIndex = 0;
let historyStack = []; // for undo
const MAJOR_GENRES = ["Rap", "Rock", "Pop", "Jazz", "Electronic", "Indie", "Classical"];
// Define default colors for known genres
const GENRE_COLORS = {
  Rap: "#e74c3c",        // red
  Rock: "#3498db",       // blue
  Pop: "#f39c12",        // orange
  Jazz: "#9b59b6",       // purple
  Electronic: "#1abc9c", // teal
  Indie: "#2ecc71",      // green
  Classical: "#95a5a6",  // gray
  Unassigned: "#444"     // dark fallback
};

// Utility: random color for new genres
function getRandomColor() {
  return "#" + Math.floor(Math.random()*16777215).toString(16);
}

// --------- Helpers ----------
function logStatus(msg) {
  const s = document.getElementById("status");
  if (s) s.textContent = msg;
  console.log("[APP]", msg);
}

function safeGet(id) {
  return document.getElementById(id);
}

function getTokenFromUrl() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  return params.get("access_token");
}

// --------- Auth / Login ----------
function redirectToSpotifyLogin() {
  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.append("client_id", CLIENT_ID);
  authUrl.searchParams.append("response_type", "token");
  authUrl.searchParams.append("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.append("scope", SCOPE);
  authUrl.searchParams.append("show_dialog", "true"); // always show consent

  console.log("Redirecting to:", authUrl.toString());
  window.location.href = authUrl.toString();
}

// --------- Fetch saved songs ----------
async function fetchSavedSongs() {
  if (!accessToken) {
    throw new Error("No access token available for fetchSavedSongs()");
  }

  safeGet("loading")?.style && (safeGet("loading").style.display = "block");
  const loadingTextEl = safeGet("loading-text");

  let url = "https://api.spotify.com/v1/me/tracks?limit=50";
  let fetched = 0;

  try {
    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: "Bearer " + accessToken },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => res.statusText);
        console.error("Spotify tracks fetch failed:", res.status, txt);
        logStatus("Failed fetching tracks: " + res.status);
        break;
      }

      const data = await res.json();
      data.items.forEach((item) => {
        const track = item.track;
        if (!track) return;
        const song = {
          id: track.id,
          name: track.name,
          artist: track.artists.map((a) => a.name).join(", "),
          album: track.album?.name || "",
          cover: track.album?.images?.[0]?.url || "",
          genres: ["Unassigned"], // default
        };

        // restore saved assignment (if any)
        const saved = localStorage.getItem(`song-${song.id}`);
        if (saved) song.genres = [saved];

        allSongs.push(song);
      });

      fetched += data.items.length;
      if (loadingTextEl) loadingTextEl.textContent = `Loading your songs... ${fetched} fetched`;

      url = data.next;
    }

    buildGenreMap();
    renderChart();
    // Restore last progress if available
    const savedIndex = parseInt(localStorage.getItem("currentIndex"), 10);
    if (!isNaN(savedIndex) && savedIndex < allSongs.length) {
    currentIndex = savedIndex;
   logStatus(`Resuming from song ${currentIndex + 1} of ${allSongs.length}`);
   }
    showSong(currentIndex);

    logStatus(`Fetched ${allSongs.length} songs`);
  } catch (err) {
    console.error("Error while fetching songs:", err);
    logStatus("Error fetching songs (see console).");
  } finally {
    safeGet("loading")?.style && (safeGet("loading").style.display = "none");
  }
}

// --------- Build genre map ----------
function buildGenreMap() {
  genreMap = {};
  allSongs.forEach((song) => {
    const g = song.genres?.[0] || "Unassigned";
    if (!genreMap[g]) genreMap[g] = [];
    genreMap[g].push(song);
  });
}

// --------- Show card ----------
function showSong(index) {
  const card = safeGet("song-card");
  if (!card) return;

  if (index >= allSongs.length) {
    card.classList.add("hidden");
    alert("✅ All songs sorted!");
    logStatus("All songs processed");
    return;
  }

  const song = allSongs[index];

  safeGet("song-cover").src = song.cover || "";
  safeGet("song-title").textContent = song.name || "";
  safeGet("song-artist").textContent = song.artist || "";
  safeGet("song-album").textContent = song.album || "";

  const buttonsEl = safeGet("genre-buttons");
  if (buttonsEl) {
    buttonsEl.innerHTML = "";
    MAJOR_GENRES.forEach((g) => {
      const btn = document.createElement("button");
      btn.className = "genre-assign-btn";
      btn.type = "button";
      btn.textContent = g;
      btn.style.backgroundColor = GENRE_COLORS[g] || "#444";
      btn.addEventListener("click", () => assignGenre(song, g));
      buttonsEl.appendChild(btn);
    });

    const addBtn = document.createElement("button");
    addBtn.className = "add-genre-btn";
    addBtn.type = "button";
    addBtn.textContent = "+ Add Genre";
    addBtn.style.backgroundColor = "#444";
    addBtn.addEventListener("click", () => {
      const newGenre = prompt("Enter a new genre name:");
      if (newGenre && !MAJOR_GENRES.includes(newGenre)) {
        MAJOR_GENRES.push(newGenre);
        GENRE_COLORS[newGenre] = getRandomColor();
        alert(`✅ Genre "${newGenre}" added!`);
        showSong(index);
      }
    });
    buttonsEl.appendChild(addBtn);
  }

  card.classList.remove("hidden");
  logStatus(`Showing ${index + 1} / ${allSongs.length}`);
}


// --------- Assign genre ----------
function assignGenre(song, genre) {
  historyStack.push({ id: song.id, prev: song.genres[0] || "Unassigned" });
  song.genres = [genre];
  localStorage.setItem(`song-${song.id}`, genre);

  buildGenreMap();
  renderChart();

  // ✅ show toast when assigned
  showToast(`🎵 "${song.name}" → ${genre}`);

  currentIndex++;
  localStorage.setItem("currentIndex", currentIndex);
  showSong(currentIndex);
}


// --------- Undo ----------
function undoLast() {
  if (historyStack.length === 0) {
    logStatus("Nothing to undo");
    return;
  }
  const last = historyStack.pop();
  const song = allSongs.find((s) => s.id === last.id);
  if (!song) {
    console.warn("undo: song not found", last);
    return;
  }
  song.genres = [last.prev || "Unassigned"];
  if (song.genres[0] === "Unassigned") localStorage.removeItem(`song-${song.id}`);
  else localStorage.setItem(`song-${song.id}`, song.genres[0]);

  currentIndex = Math.max(0, currentIndex - 1);
  localStorage.setItem("currentIndex", currentIndex);
  buildGenreMap();
  renderChart();
  showSong(currentIndex);
  logStatus(`Undid last assignment: ${song.name}`);
}

// --------- Chart ----------
function renderChart() {
  const ctxEl = safeGet("genreChart");
  if (!ctxEl) {
    console.warn("genreChart canvas missing");
    return;
  }
  const ctx = ctxEl.getContext("2d");

  buildGenreMap();
  const labels = Object.keys(genreMap);
  const data = labels.map((k) => genreMap[k].length);

  if (genreChart && typeof genreChart.destroy === "function") {
    genreChart.destroy();
  }

  genreChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Songs per Genre", data, backgroundColor: "#1DB954" }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
  buildPlaylistButtons();
}

function showToast(message) {
  const toast = safeGet("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500); // 2.5 seconds
}


function buildPlaylistButtons() {
  const container = safeGet("playlist-buttons");
  if (!container) return;

  container.innerHTML = "";

  Object.keys(genreMap).forEach((genre) => {
    if (genre === "Unassigned") return;

    const wrapper = document.createElement("div");
    wrapper.className = "genre-section";

    const playlistBtn = document.createElement("button");
    playlistBtn.textContent = `Create ${genre} Playlist`;
    playlistBtn.className = "playlist-btn";
    playlistBtn.addEventListener("click", () => createPlaylistForGenre(genre));
    wrapper.appendChild(playlistBtn);

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = `Show ${genre} Songs`;
    toggleBtn.className = "show-songs-btn";
    wrapper.appendChild(toggleBtn);

    const list = document.createElement("ul");
    list.className = "genre-song-list";
    list.style.display = "none";

    genreMap[genre].forEach((song) => {
      const li = document.createElement("li");
      li.className = "genre-list-item";

      const info = document.createElement("span");
      info.textContent = `${song.name} — ${song.artist}`;
      li.appendChild(info);

      const btns = document.createElement("div");
      btns.className = "inline-buttons";

      MAJOR_GENRES.forEach((g) => {
        if (g !== song.genres[0]) {
          const btn = document.createElement("button");
          btn.className = "inline-btn";
          btn.textContent = g;
          btn.style.backgroundColor = GENRE_COLORS[g] || "#444";
          btn.addEventListener("click", () => {
            assignGenre(song, g);
            buildPlaylistButtons();
            showToast(`🎵 "${song.name}" → ${g}`);
          });
          btns.appendChild(btn);
        }
      });

      const addBtn = document.createElement("button");
      addBtn.className = "inline-btn";
      addBtn.textContent = "+ Add";
      addBtn.style.backgroundColor = "#444";
      addBtn.addEventListener("click", () => {
        const newGenre = prompt("Enter a new genre name:");
        if (newGenre && !MAJOR_GENRES.includes(newGenre)) {
          MAJOR_GENRES.push(newGenre);
          GENRE_COLORS[newGenre] = getRandomColor();
        }
        assignGenre(song, newGenre);
        buildPlaylistButtons();
        showToast(`🎵 "${song.name}" → ${newGenre}`);
      });
      btns.appendChild(addBtn);

      li.appendChild(btns);
      list.appendChild(li);
    });

    toggleBtn.addEventListener("click", () => {
      const isHidden = list.style.display === "none";
      list.style.display = isHidden ? "block" : "none";
      toggleBtn.textContent = isHidden
        ? `Hide ${genre} Songs`
        : `Show ${genre} Songs`;
    });

    wrapper.appendChild(list);
    container.appendChild(wrapper);
  });
}




// --------- Create Playlists ----------
// --------- Create Playlist for One Genre ----------
async function createPlaylistForGenre(genre) {
  if (!accessToken) {
    logStatus("❌ No access token, please log in first.");
    return;
  }

  const songs = genreMap[genre] || [];
  if (!songs.length) {
    logStatus(`⚠️ No songs found for ${genre}`);
    return;
  }

  const confirmCreate = confirm(`Are you sure you want to create a playlist for ${genre}?`);
  if (!confirmCreate) {
    logStatus(`Cancelled playlist creation for ${genre}`);
    return;
  }

  logStatus(`Creating playlist for ${genre}...`);

  // Get current user ID
  const userRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: "Bearer " + accessToken },
  });
  const userData = await userRes.json();
  const userId = userData.id;

  // 1. Create playlist
  const createRes = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `${genre} Playlist`,
      description: `Songs auto-organized into ${genre}`,
      public: false,
    }),
  });

  if (!createRes.ok) {
    logStatus(`❌ Failed to create playlist for ${genre}`);
    return;
  }

  const playlist = await createRes.json();
  const playlistId = playlist.id;

  // 2. Add tracks (Spotify expects track URIs, not IDs)
  const uris = songs.map((s) => `spotify:track:${s.id}`);
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: chunk }),
    });
  }

  logStatus(`✅ Playlist created for ${genre}! Check your Spotify.`);
}


// --------- DOM ready ----------
window.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM ready - attaching listeners");

  const loginBtn = safeGet("login-btn");
  if (loginBtn) loginBtn.addEventListener("click", redirectToSpotifyLogin);

  const undoBtn = safeGet("undo-btn");
  if (undoBtn) undoBtn.addEventListener("click", undoLast);

  

  logStatus("Ready");

  accessToken = getTokenFromUrl();
if (accessToken) {
  try { window.history.pushState("", document.title, window.location.pathname); } catch (e) {}
  logStatus("Logged in — fetching songs...");

  // hide login button after login
  const loginBtn = safeGet("login-btn");
  if (loginBtn) loginBtn.style.display = "none";

  await fetchSavedSongs().catch((err) => {
    console.error("fetchSavedSongs error:", err);
    logStatus("Error fetching songs — see console");
  });
} else {
  logStatus("Not logged in. Click 'Login with Spotify' to start.");
}

});
