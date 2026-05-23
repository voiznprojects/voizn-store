const THEME_STORAGE_KEY = "voizn-theme";
const CATALOG_CACHE_KEY = "voizn-catalog-cache-v1";
const CATALOG_CACHE_TTL = 1000 * 60 * 5;
const DEFAULT_REQUEST_TIMEOUT_MS = 12000;
const API_CONFIG = window.VOIZN_CONFIG || {};
const API_BASE_URL =
  API_CONFIG.apiBaseUrl ||
  document.body.dataset.apiBaseUrl ||
  (["127.0.0.1", "localhost"].includes(window.location.hostname)
    ? "http://127.0.0.1:4000"
    : "https://api.voizn.store");

const pageType = document.body.dataset.page || "";
const isAuthPage = document.body.dataset.authPage === "true";
const isProtectedPage = document.body.dataset.protected === "true";
const themeToggleButtons = document.querySelectorAll(".theme-toggle");
const revealItems = document.querySelectorAll(".reveal");
const state = {
  currentUser: null,
  favorites: [],
  favoritesMap: new Map(),
  catalogProducts: [],
  catalogMap: new Map(),
  drops: [],
  toastTimeouts: new Set(),
  analyticsSessionId:
    sessionStorage.getItem("voizn-analytics-session") ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
};
sessionStorage.setItem("voizn-analytics-session", state.analyticsSessionId);

function ensureFavicon() {
  const head = document.head;
  if (!head) {
    return;
  }

  const iconHref = `${window.location.origin}/favicon.png`;
  const appleHref = `${window.location.origin}/apple-touch-icon.png`;

  let iconLink = head.querySelector('link[rel="icon"]');
  if (!iconLink) {
    iconLink = document.createElement("link");
    iconLink.rel = "icon";
    head.appendChild(iconLink);
  }
  iconLink.type = "image/png";
  iconLink.href = iconHref;

  let shortcutLink = head.querySelector('link[rel="shortcut icon"]');
  if (!shortcutLink) {
    shortcutLink = document.createElement("link");
    shortcutLink.rel = "shortcut icon";
    head.appendChild(shortcutLink);
  }
  shortcutLink.type = "image/png";
  shortcutLink.href = iconHref;

  let appleLink = head.querySelector('link[rel="apple-touch-icon"]');
  if (!appleLink) {
    appleLink = document.createElement("link");
    appleLink.rel = "apple-touch-icon";
    head.appendChild(appleLink);
  }
  appleLink.href = appleHref;
}

function updateLightThemeDepth() {
  if (document.body.dataset.theme !== "light") {
    document.documentElement.style.removeProperty("--light-scroll-depth");
    return;
  }

  const maxScrollable =
    document.documentElement.scrollHeight - window.innerHeight;
  const progress =
    maxScrollable > 0 ? Math.min(window.scrollY / maxScrollable, 1) : 0;
  document.documentElement.style.setProperty(
    "--light-scroll-depth",
    progress.toFixed(3),
  );
}

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getSavedTheme = () => localStorage.getItem(THEME_STORAGE_KEY) || "dark";

const formatCurrency = (value, currency = "GBP") => {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) {
    return value || "";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (value) => {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
};

const toTitleCase = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const applyTheme = (theme) => {
  document.body.dataset.theme = theme;
  themeToggleButtons.forEach((button) => {
    const isLight = theme === "light";
    button.textContent = isLight ? "Dark Mode" : "Light Mode";
    button.setAttribute(
      "aria-label",
      isLight ? "Switch to dark mode" : "Switch to light mode",
    );
    button.setAttribute(
      "title",
      isLight ? "Switch to dark mode" : "Switch to light mode",
    );
    button.setAttribute("aria-pressed", String(isLight));
  });
  updateLightThemeDepth();
};

ensureFavicon();
applyTheme(getSavedTheme());

async function apiFetch(path, options = {}) {
  const controller = options.signal ? null : new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  let timeoutId = null;

  if (controller && timeoutMs > 0) {
    timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
      signal: options.signal || controller?.signal,
    });
  } catch (error) {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }

    const networkError = new Error(
      error?.name === "AbortError"
        ? "VOIZN is taking too long to respond right now. Please try again."
        : ["127.0.0.1", "localhost"].includes(window.location.hostname)
          ? "VOIZN backend is offline. Start the backend server and try again."
          : "VOIZN is unable to reach the live account server right now. Please try again shortly.",
    );
    networkError.status = 0;
    networkError.code =
      error?.name === "AbortError"
        ? "request_timeout"
        : "network_unavailable";
    networkError.cause = error;
    throw networkError;
  }

  if (timeoutId) {
    window.clearTimeout(timeoutId);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || data?.ok === false) {
    const error = new Error(
      data?.message || "Something went wrong while talking to VOIZN.",
    );
    error.status = response.status;
    error.code = data?.code || "request_failed";
    error.data = data;
    throw error;
  }

  return data;
}

function pageNeedsCatalogData() {
  if (isAuthPage || pageType === "access-status") {
    return false;
  }

  return true;
}

function showFieldMessage(element, message = "", type = "") {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.dataset.state = type;
}

function setButtonLoading(button, isLoading, loadingText = "Please wait") {
  if (!button) {
    return;
  }

  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.defaultText;
}

function ensureToastRegion() {
  let region = document.querySelector(".toast-region");
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    document.body.appendChild(region);
  }

  return region;
}

function showToast(message, type = "info") {
  if (!message) {
    return;
  }

  const region = ensureToastRegion();
  const toast = document.createElement("div");
  toast.className = "site-toast";
  toast.dataset.state = type;
  toast.textContent = message;
  region.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });

  const timeoutId = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 260);
    state.toastTimeouts.delete(timeoutId);
  }, 2800);

  state.toastTimeouts.add(timeoutId);
}

function getCachedCatalogState() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CATALOG_CACHE_KEY) || "null");
    if (!cached?.timestamp || Date.now() - cached.timestamp > CATALOG_CACHE_TTL) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function setCachedCatalogState(products, drops) {
  try {
    sessionStorage.setItem(
      CATALOG_CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        products,
        drops,
      }),
    );
  } catch {
    // Ignore storage issues and keep runtime state only.
  }
}

function setupPageTransitions() {
  let overlay = document.querySelector(".page-transition");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "page-transition";
    document.body.appendChild(overlay);
  }

  requestAnimationFrame(() => {
    document.body.classList.add("page-ready");
  });
}

function showLoadingState(selector, count = 3) {
  const mount = document.querySelector(selector);
  if (!mount) {
    return;
  }

  mount.innerHTML = Array.from(
    { length: count },
    () => `
      <article class="skeleton-card">
        <div class="skeleton-block skeleton-media"></div>
        <div class="skeleton-copy">
          <div class="skeleton-block skeleton-line short"></div>
          <div class="skeleton-block skeleton-line"></div>
          <div class="skeleton-block skeleton-line tiny"></div>
        </div>
      </article>
    `,
  ).join("");
}

function requireSelector(selector) {
  return document.querySelector(selector);
}

function createFavoriteMap(items) {
  return new Map(
    (items || []).map((item) => [
      item.productId,
      {
        id: item.productId,
        productId: item.productId,
        name: item.name,
        tag: item.tag || "",
        description: item.description || "",
        price: item.price || "",
        artClass: item.artClass || "",
      },
    ]),
  );
}

async function loadCatalogState() {
  const cached = getCachedCatalogState();
  if (cached) {
    state.catalogProducts = cached.products || [];
    state.catalogMap = new Map(
      state.catalogProducts.map((product) => [slugify(product.name), product]),
    );
    state.drops = cached.drops || [];
  }

  try {
    const [productsPayload, dropsPayload] = await Promise.all([
      apiFetch("/api/catalog/products", { method: "GET" }),
      apiFetch("/api/catalog/drops", { method: "GET" }),
    ]);
    state.catalogProducts = productsPayload.products || [];
    state.catalogMap = new Map(
      state.catalogProducts.map((product) => [slugify(product.name), product]),
    );
    state.drops = dropsPayload.drops || [];
    setCachedCatalogState(state.catalogProducts, state.drops);
  } catch (error) {
    console.warn("VOIZN catalog bootstrap failed:", error.message);
    if (!cached) {
      state.catalogProducts = [];
      state.catalogMap = new Map();
      state.drops = [];
    }
  }
}

function getCatalogProductByName(name) {
  return state.catalogMap.get(slugify(name)) || null;
}

function detectBrowser() {
  const userAgent = navigator.userAgent || "";
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return "Safari";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/OPR\//i.test(userAgent) || /Opera/i.test(userAgent)) return "Opera";
  return "Browser";
}

function detectDevice() {
  const source = `${navigator.userAgent || ""} ${navigator.platform || ""}`.toLowerCase();
  if (/iphone|android|mobile/.test(source)) return "Mobile";
  if (/ipad|tablet/.test(source)) return "Tablet";
  return "Desktop";
}

function deriveCurrentProductSlug() {
  const currentFile = window.location.pathname.split("/").pop() || "";
  const bare = currentFile.replace(/\.html$/i, "");
  if (state.catalogProducts.some((product) => product.slug === bare)) {
    return bare;
  }
  return null;
}

async function trackAnalyticsEvent(eventType, productSlug = null, metadata = null) {
  try {
    await apiFetch("/api/analytics/event", {
      method: "POST",
      body: JSON.stringify({
        eventType,
        sessionId: state.analyticsSessionId,
        productSlug: productSlug || deriveCurrentProductSlug(),
        path: `${window.location.pathname}${window.location.search}`,
        metadata: {
          browser: detectBrowser(),
          device: detectDevice(),
          platform: navigator.platform || null,
          userAgent: navigator.userAgent || null,
          language: navigator.language || null,
          timezone:
            Intl.DateTimeFormat?.().resolvedOptions?.().timeZone || null,
          ...(metadata || {}),
        },
      }),
    });
  } catch (error) {
    console.warn("VOIZN analytics skipped:", error.message);
  }
}

function buildAccessCopy(accessStatus) {
  const status = String(accessStatus || "").toUpperCase();
  if (status === "PENDING_VERIFICATION") {
    return {
      title: "Pending verification",
      description:
        "Check your inbox and complete email verification to continue into the private VOIZN experience.",
    };
  }
  if (status === "PENDING_APPROVAL") {
    return {
      title: "We’re reviewing your access request",
      description:
        "Your account is verified and waiting for manual VOIZN approval. You’ll receive an email once approved.",
    };
  }
  if (status === "REJECTED") {
    return {
      title: "Access rejected",
      description:
        "This request does not currently have private website access. Contact VOIZN support if you believe this is a mistake.",
    };
  }
  return {
    title: "Access granted",
    description: "Your account is approved and ready to move through the full private VOIZN site.",
  };
}

async function bootstrapAuth() {
  try {
    const payload = await apiFetch("/api/auth/me", {
      method: "GET",
    });

    state.currentUser = payload.user;
    return payload.user;
  } catch (error) {
    state.currentUser = null;

    if (isProtectedPage) {
      const redirect = encodeURIComponent(
        window.location.pathname.split("/").pop() || "index.html",
      );
      window.location.replace(`login.html?error=signin-required&redirect=${redirect}`);
      return null;
    }

    return null;
  }
}

function setupThemeToggle() {
  themeToggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextTheme =
        document.body.dataset.theme === "light" ? "dark" : "light";
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      applyTheme(nextTheme);
    });
  });

  window.addEventListener("scroll", updateLightThemeDepth, { passive: true });
}

function setupRevealObserver() {
  const items = document.querySelectorAll(".reveal, [data-text-reveal]");
  if (!items.length) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 },
  );

  items.forEach((item, index) => {
    item.style.setProperty("--reveal-delay", `${index * 55}ms`);
    observer.observe(item);
  });
}

function setupScrollCinema() {
  if (window.matchMedia("(hover: none)").matches) {
    document.documentElement.classList.add("touch");
  }

  const textRevealItems = document.querySelectorAll("[data-text-reveal]");
  const parallaxItems = document.querySelectorAll("[data-parallax]");
  const hero = document.querySelector(".cinematic-hero");
  const heroContent = hero?.querySelector(".cinematic-hero-content");

  textRevealItems.forEach((element) => {
    if (element.dataset.revealReady === "true") {
      return;
    }

    element.dataset.revealReady = "true";
    const text = (element.textContent || "").trim();
    element.textContent = "";
    text.split(/\s+/).forEach((word, index, words) => {
      const span = document.createElement("span");
      span.textContent = word;
      span.style.transitionDelay = `${index * 42}ms`;
      element.appendChild(span);
      if (index < words.length - 1) {
        element.appendChild(document.createTextNode(" "));
      }
    });
  });

  const update = () => {
    const scrollY = window.scrollY;

    if (hero && heroContent) {
      const heroHeight = hero.offsetHeight || window.innerHeight;
      const progress = Math.min(scrollY / heroHeight, 1);
      hero.style.setProperty("--hero-progress", progress.toFixed(3));
      heroContent.style.opacity = String(Math.max(0, 1 - progress * 1.35));
      heroContent.style.transform = `translate3d(0, ${progress * 48}px, 0)`;
    }

    parallaxItems.forEach((item) => {
      const speed = Number(item.dataset.parallax || 0.12);
      const rect = item.getBoundingClientRect();
      item.style.transform = `translate3d(0, ${rect.top * speed}px, 0) scale(1.02)`;
    });
  };

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
}

function setupDropExperience() {
  const countdown = document.querySelector("#drop-countdown");
  const notifyButton = document.querySelector("[data-drop-notify]");
  const targetDrop = notifyButton?.dataset.dropNotify || "summer-static";
  const activeDrop = state.drops.find((drop) => drop.slug === targetDrop);

  if (countdown && activeDrop?.releaseDate) {
    const tick = () => {
      const distance = new Date(activeDrop.releaseDate).getTime() - Date.now();
      if (distance <= 0) {
        countdown.textContent = "Now live";
        return;
      }

      const days = Math.floor(distance / 86400000);
      const hours = Math.floor((distance % 86400000) / 3600000);
      const minutes = Math.floor((distance % 3600000) / 60000);
      const seconds = Math.floor((distance % 60000) / 1000);
      countdown.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    };

    tick();
    window.setInterval(tick, 1000);
  }

  notifyButton?.addEventListener("click", async () => {
    const email =
      state.currentUser?.email ||
      window.prompt("Enter your email for drop notifications:", "") ||
      "";
    if (!email.trim()) {
      return;
    }

    try {
      await apiFetch("/api/catalog/drop-notifications", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          dropSlug: targetDrop,
        }),
      });
      showToast("Drop notification saved", "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

function setupMenu() {
  const header = document.querySelector(".site-header");
  const menuToggle = document.querySelector(".menu-toggle");
  const navLinks = document.querySelectorAll(".site-nav a");

  if (!header || !menuToggle) {
    return;
  }

  menuToggle.addEventListener("click", () => {
    const isOpen = header.classList.toggle("menu-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    document.body.classList.toggle("nav-open", isOpen);
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      header.classList.remove("menu-open");
      menuToggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("nav-open");
    });
  });
}

function setupDropdowns() {
  const dropdownParents = document.querySelectorAll(".has-dropdown");
  const dropdownTriggers = document.querySelectorAll(".dropdown-trigger");

  const closeDropdowns = () => {
    dropdownParents.forEach((item) => item.classList.remove("open"));
    dropdownTriggers.forEach((trigger) =>
      trigger.setAttribute("aria-expanded", "false"),
    );
  };

  dropdownParents.forEach((item) => {
    const trigger = item.querySelector(".dropdown-trigger");
    if (!trigger) {
      return;
    }

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      const isOpen = item.classList.contains("open");
      closeDropdowns();
      item.classList.toggle("open", !isOpen);
      trigger.setAttribute("aria-expanded", String(!isOpen));
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".has-dropdown")) {
      closeDropdowns();
    }
  });
}

async function logoutUser() {
  try {
    await apiFetch("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch {
    // We still send the user back to login even if the session is already gone.
  }

  state.currentUser = null;
  window.location.replace("login.html");
}

function setupHeader() {
  const header = document.querySelector(".site-header");
  if (!header) {
    return;
  }

  const headerLeft = header.querySelector(".header-left");
  const siteNav = header.querySelector(".site-nav");

  if (!headerLeft || !siteNav) {
    return;
  }

  const bagLink = headerLeft.querySelector('.icon-link[aria-label="Basket"]');
  let favoritesLink = headerLeft.querySelector(".favorites-link");
  let profileMenu = siteNav.querySelector(".profile-menu");

  if (!favoritesLink) {
    favoritesLink = document.createElement("a");
    favoritesLink.className = "favorites-link";
    favoritesLink.href = "favorites.html";
    favoritesLink.setAttribute("aria-label", "Favourites");
    favoritesLink.innerHTML =
      '<span class="icon-heart" aria-hidden="true"></span>';
  }
  favoritesLink.innerHTML =
    '<span class="icon-heart" aria-hidden="true"></span>';
  if (bagLink) {
    bagLink.href = "basket.html";
  }
  if (!favoritesLink.parentElement && bagLink?.parentElement === headerLeft) {
    headerLeft.appendChild(favoritesLink);
  }

  if (!profileMenu) {
    profileMenu = document.createElement("div");
    profileMenu.className = "profile-menu";
    profileMenu.innerHTML = `
      <button class="icon-link profile-trigger" type="button" aria-expanded="false" aria-label="Open account menu">
        <span class="icon-user" aria-hidden="true"></span>
      </button>
      <div class="profile-dropdown"></div>
    `;
    siteNav.appendChild(profileMenu);
  }

  const trigger = profileMenu.querySelector(".profile-trigger, .icon-link[aria-label='Profile']");
  if (!trigger) {
    return;
  }

  trigger.classList.add("profile-trigger");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "Open account menu");

  let panel = profileMenu.querySelector(".profile-dropdown");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "profile-dropdown";
    profileMenu.appendChild(panel);
  }

  if (state.currentUser) {
    panel.innerHTML = `
      <p class="profile-dropdown-label">Logged into</p>
      <p class="profile-dropdown-user">${state.currentUser.name || state.currentUser.email}</p>
      <a href="profile.html">Profile</a>
      <a href="orders.html">Your Orders</a>
      <a href="favorites.html">Favourites</a>
      ${
        state.currentUser.role === "ADMIN"
          ? '<a href="admin-approvals.html">Access Approvals</a><a href="admin-analytics.html">Analytics</a>'
          : ""
      }
      <button class="logout-button" type="button">Logout</button>
    `;
  } else {
    panel.innerHTML = `
      <p class="profile-dropdown-label">Account</p>
      <p class="profile-dropdown-user">Guest</p>
      <a href="login.html">Log In</a>
      <a href="login.html#signup">Create Account</a>
    `;
  }

  if (!profileMenu.dataset.bound) {
    trigger.addEventListener("click", () => {
      const isOpen = profileMenu.classList.toggle("open");
      trigger.setAttribute("aria-expanded", String(isOpen));
    });
    profileMenu.dataset.bound = "true";
  }

  if (!header.dataset.profileMenusBound) {
    document.addEventListener("click", (event) => {
      const targetMenu = event.target.closest(".profile-menu");
      document.querySelectorAll(".profile-menu").forEach((menu) => {
        const menuTrigger = menu.querySelector(".profile-trigger");
        if (!menuTrigger) {
          return;
        }

        if (!targetMenu || targetMenu !== menu) {
          menu.classList.remove("open");
          menuTrigger.setAttribute("aria-expanded", "false");
        }
      });
    });
    header.dataset.profileMenusBound = "true";
  }

  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "Open account menu");

  panel.querySelectorAll(".logout-button").forEach((button) => {
    button.addEventListener("click", logoutUser);
  });
}

async function loadFavorites() {
  if (!state.currentUser) {
    state.favorites = [];
    state.favoritesMap = new Map();
    return;
  }

  const payload = await apiFetch("/api/favorites", {
    method: "GET",
  });
  state.favorites = payload.favorites || [];
  state.favoritesMap = createFavoriteMap(state.favorites);
}

function buildProductMeta(card, productArt, fallbackIndex) {
  const productName = card.querySelector("h3")?.textContent?.trim() || `product-${fallbackIndex + 1}`;
  const productId =
    card.dataset.productId ||
    card.dataset.shopifyHandle ||
    slugify(productName);

  card.dataset.productId = productId;

  return {
    productId,
    name: productName,
    tag: card.querySelector(".product-tag")?.textContent?.trim() || "",
    description: card.querySelector(".product-meta p")?.textContent?.trim() || "",
    price: card.querySelector(".product-meta span")?.textContent?.trim() || "",
    artClass:
      Array.from(productArt.classList).find((className) =>
        className.startsWith("art-"),
      ) || "",
  };
}

async function toggleFavorite(productMeta, button, card) {
  if (!state.currentUser) {
    const redirect = encodeURIComponent(
      window.location.pathname.split("/").pop() || "index.html",
    );
    window.location.replace(`login.html?redirect=${redirect}`);
    return;
  }

  const existing = state.favoritesMap.get(productMeta.productId);
  button.disabled = true;

  try {
    if (existing) {
      await apiFetch(`/api/favorites/${productMeta.productId}`, {
        method: "DELETE",
      });
      trackAnalyticsEvent("FAVORITE", productMeta.productId, { action: "remove" });
      showToast("Removed from favourites", "info");
      state.favoritesMap.delete(productMeta.productId);
      state.favorites = state.favorites.filter(
        (favorite) => favorite.productId !== productMeta.productId,
      );

      if (card && card.parentElement?.id === "favorites-grid") {
        card.remove();
      }
    } else {
      const payload = await apiFetch("/api/favorites", {
        method: "PUT",
        body: JSON.stringify(productMeta),
      });
      trackAnalyticsEvent("FAVORITE", productMeta.productId, { action: "add" });
      showToast("Saved to favourites", "success");
      const normalized = {
        ...payload.favorite,
        productId: payload.favorite.productId,
      };
      state.favoritesMap.set(productMeta.productId, normalized);
      state.favorites = [normalized, ...state.favorites.filter((favorite) => favorite.productId !== normalized.productId)];
    }
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
    updateFavoriteButtons();
    if (pageType === "profile") {
      renderProfileFavoritesPreview();
    }
    if (pageType === "favorites") {
      renderFavoritesPage();
    }
  }
}

function updateFavoriteButtons() {
  document.querySelectorAll(".favorite-button").forEach((button) => {
    const productId = button.dataset.productId;
    const isFavorited = state.favoritesMap.has(productId);
    button.classList.toggle("is-favorited", isFavorited);
    button.setAttribute("aria-pressed", String(isFavorited));
    button.setAttribute(
      "title",
      isFavorited ? "Remove from favourites" : "Save to favourites",
    );
  });
}

function setupFavorites() {
  const productCards = document.querySelectorAll(".product-card");

  productCards.forEach((card, index) => {
    const productArt = card.querySelector(".product-art");
    if (!productArt) {
      return;
    }

    const productMeta = buildProductMeta(card, productArt, index);
    let favoriteButton = productArt.querySelector(".favorite-button");

    if (!favoriteButton) {
      favoriteButton = document.createElement("button");
      favoriteButton.type = "button";
      favoriteButton.className = "favorite-button";
      favoriteButton.dataset.productId = productMeta.productId;
      favoriteButton.setAttribute(
        "aria-label",
        `Toggle favourite for ${productMeta.name}`,
      );
      productArt.appendChild(favoriteButton);
    }

    favoriteButton.dataset.productId = productMeta.productId;
    favoriteButton.onclick = (event) => {
      event.stopPropagation();
      event.preventDefault();
      toggleFavorite(productMeta, favoriteButton, card);
    };
  });

  updateFavoriteButtons();
}

function enhanceCatalogCards() {
  document.querySelectorAll(".product-card").forEach((card) => {
    const title = card.querySelector("h3")?.textContent?.trim();
    const product = getCatalogProductByName(title);
    if (!product) {
      return;
    }

    card.dataset.productId = product.slug;
    card.dataset.price = String(product.price);
    const meta = card.querySelector(".product-meta");
    const metaLead = meta?.querySelector("div");
    const metaPrice = meta?.querySelector("span");
    const metaDescription = metaLead?.querySelector("p:last-of-type");
    const existingStatus = card.querySelector(".product-stock-status");
    if (existingStatus) {
      existingStatus.remove();
    }
    card.classList.remove(
      "product-card-unavailable",
      "product-card-low-stock",
      "product-card-locked",
    );

    if (metaPrice) {
      meta.appendChild(metaPrice);
    }

    const status = document.createElement("div");
    status.className = "product-stock-status";
    if (product.locked) {
      status.textContent = `Locked until ${formatDate(product.releaseDate)}`;
      status.dataset.state = "locked";
      card.classList.add("product-card-locked");
    } else if (!product.available) {
      status.textContent = "Out of stock";
      status.dataset.state = "out";
      card.classList.add("product-card-unavailable");
    } else if (product.urgencyText) {
      status.textContent = product.lowStock ? `${product.urgencyText} · Low stock` : product.urgencyText;
      status.dataset.state = product.lowStock ? "low" : "available";
      if (product.lowStock) {
        card.classList.add("product-card-low-stock");
      }
    } else if (product.privateAccessOnly) {
      status.textContent = "Private access only";
      status.dataset.state = "private";
    } else {
      status.textContent = "Available now";
      status.dataset.state = "available";
    }
    if (metaDescription) {
      metaDescription.insertAdjacentElement("afterend", status);
    } else if (metaLead) {
      metaLead.appendChild(status);
    } else {
      meta?.appendChild(status);
    }

    if (status.dataset.state === "private") {
      status.remove();
    }

    card.addEventListener("mouseenter", () =>
      trackAnalyticsEvent("PRODUCT_CLICK", product.slug, { source: "hover-card" }),
    );
  });
}

function renderFavoritesPage() {
  const favoritesGrid = requireSelector("#favorites-grid");
  const favoritesEmpty = requireSelector("#favorites-empty");

  if (!favoritesGrid) {
    return;
  }

  favoritesGrid.innerHTML = "";

  if (!state.favorites.length) {
    if (favoritesEmpty) {
      favoritesEmpty.hidden = false;
    }
    return;
  }

  if (favoritesEmpty) {
    favoritesEmpty.hidden = true;
  }

  state.favorites.forEach((item) => {
    const article = document.createElement("article");
    article.className = "product-card reveal is-visible";
    article.dataset.productId = item.productId;
    const product =
      state.catalogMap.get(item.productId) ||
      getCatalogProductByName(item.name) ||
      null;
    article.innerHTML = `
      <div class="product-art ${item.artClass || ""}"></div>
      <div class="product-meta">
        <div>
          ${item.tag ? `<p class="product-tag">${item.tag}</p>` : ""}
          <h3>${item.name}</h3>
          <p>${item.description || "Saved to your private access profile."}</p>
        </div>
        <span>${item.price || ""}</span>
      </div>
      <div class="favorite-card-actions">
        <button class="tile-link move-to-basket-button" type="button">Move to basket</button>
      </div>
    `;
    favoritesGrid.appendChild(article);
    article
      .querySelector(".move-to-basket-button")
      ?.addEventListener("click", () => moveFavoriteToBasket(item, product));
  });

  setupFavorites();
}

function moveFavoriteToBasket(item, product) {
  const resolvedProduct =
    product ||
    state.catalogMap.get(item.productId) ||
    getCatalogProductByName(item.name) ||
    null;
  const variant =
    resolvedProduct?.variants?.find((entry) => entry.available) ||
    resolvedProduct?.variants?.[0] ||
    null;
  if (!variant) {
    showToast("This product is currently unavailable.", "error");
    return;
  }

  if (!window.ShopifyStorefront?.addItemToLocalBasket) {
    showToast("Basket is not available right now.", "error");
    return;
  }

  window.ShopifyStorefront.addItemToLocalBasket({
    id: `${item.productId}-${variant.id}`,
    title: item.name,
    handle: resolvedProduct.slug,
    variantId: variant.id,
    quantity: 1,
    price: Number(variant.price),
    currencyCode: resolvedProduct.currency || "GBP",
    selectedOptions: [
      ...(variant.color ? [{ name: "Color", value: variant.color }] : []),
      ...(variant.size ? [{ name: "Size", value: variant.size }] : []),
    ],
    image: resolvedProduct.imageUrl || "",
    imageAlt: item.name,
    artClass: item.artClass,
    tag: item.tag,
    availableOptions: [
      {
        name: "Color",
        values: resolvedProduct.options?.colors || [],
      },
      {
        name: "Size",
        values: resolvedProduct.options?.sizes || [],
      },
    ].filter((option) => option.values.length > 0),
    variants: (resolvedProduct.variants || []).map((entry) => ({
      id: entry.id,
      price: Number(entry.price),
      currencyCode: resolvedProduct.currency || "GBP",
      selectedOptions: [
        ...(entry.color ? [{ name: "Color", value: entry.color }] : []),
        ...(entry.size ? [{ name: "Size", value: entry.size }] : []),
      ],
    })),
  });

  trackAnalyticsEvent("ADD_TO_BASKET", item.productId, {
    source: "favorites",
    variantId: variant.id,
  });
}

function renderProfileFavoritesPreview() {
  const favoritesPreview = requireSelector("#profile-favorites-preview");
  const favoritesSummary = requireSelector("#profile-favorites-summary");

  if (favoritesSummary) {
    favoritesSummary.textContent = state.favorites.length
      ? `${state.favorites.length} pieces saved to your account.`
      : "No favourites saved yet.";
  }

  if (!favoritesPreview) {
    return;
  }

  favoritesPreview.innerHTML = "";

  if (!state.favorites.length) {
    favoritesPreview.innerHTML =
      '<p class="empty-state-copy">You have not favourited any VOIZN pieces yet.</p>';
    return;
  }

  state.favorites.slice(0, 4).forEach((item) => {
    const article = document.createElement("article");
    article.className = "mini-favorite-card";
    article.innerHTML = `
      <div class="mini-favorite-art ${item.artClass || ""}"></div>
      <div>
        <p class="product-tag">${item.tag || "Saved piece"}</p>
        <h3>${item.name}</h3>
        <p>${item.price || ""}</p>
      </div>
    `;
    favoritesPreview.appendChild(article);
  });
}

function renderProfilePage(profile) {
  const loggedOut = requireSelector("#profile-logged-out");
  const loggedIn = requireSelector("#profile-logged-in");

  if (!profile) {
    if (loggedOut) {
      loggedOut.hidden = false;
    }
    if (loggedIn) {
      loggedIn.hidden = true;
    }
    return;
  }

  if (loggedOut) {
    loggedOut.hidden = true;
  }
  if (loggedIn) {
    loggedIn.hidden = false;
  }

  const favoritesCount = profile.favorites?.length || 0;
  const ordersCount = profile.orders?.length || 0;
  const latestOrder = profile.orders?.[0] || null;

  document.querySelectorAll("[data-profile-name]").forEach((element) => {
    element.textContent = profile.name || "Private Access Member";
  });
  document.querySelectorAll("[data-profile-email]").forEach((element) => {
    element.textContent = profile.email || "Not available";
  });

  const fieldMap = {
    "#profile-created": formatDate(profile.createdAt),
    "#profile-country": profile.country || "Not set yet",
    "#profile-access": profile.accessStatus.replaceAll("_", " "),
    "#profile-method": profile.loginMethod,
    "#profile-orders-count": String(ordersCount),
    "#profile-favorites-count": String(favoritesCount),
    "#profile-last-order": latestOrder
      ? `#${latestOrder.orderNumber} on ${formatDate(latestOrder.purchaseDate)}`
      : "No purchases yet",
  };

  Object.entries(fieldMap).forEach(([selector, value]) => {
    const element = requireSelector(selector);
    if (element) {
      element.textContent = value;
    }
  });

  const accountBadge = requireSelector("#profile-account-badge");
  if (accountBadge) {
    accountBadge.textContent =
      profile.accessStatus === "APPROVED"
        ? "Private Access Approved"
        : "Approval Pending";
  }

  const ordersSummary = requireSelector("#profile-order-summary");
  if (ordersSummary) {
    ordersSummary.innerHTML = "";
    if (!ordersCount) {
      ordersSummary.innerHTML =
        '<p class="empty-state-copy">No order history yet. Purchases will appear here once checkouts are completed.</p>';
    } else {
      profile.orders.slice(0, 3).forEach((order) => {
        const item = document.createElement("article");
        item.className = "order-summary-card";
        item.innerHTML = `
          <div>
            <p class="product-tag">Order #${order.orderNumber}</p>
            <h3>${formatCurrency(order.totalAmount, order.currency)}</h3>
          </div>
          <div class="order-summary-meta">
            <span>${formatDate(order.purchaseDate)}</span>
            <span class="order-status-chip" data-status="${order.status}">${toTitleCase(order.status)}</span>
          </div>
        `;
        ordersSummary.appendChild(item);
      });
    }
  }

  renderProfileFavoritesPreview();
}

function renderOrderDetails(order) {
  const detailPanel = requireSelector("#order-detail-panel");
  const detailEmpty = requireSelector("#orders-detail-empty");
  const detailContent = requireSelector("#orders-detail-content");

  if (!detailPanel || !detailContent) {
    return;
  }

  if (detailEmpty) {
    detailEmpty.hidden = true;
  }
  detailContent.hidden = false;
  detailPanel.dataset.open = "true";

  detailContent.innerHTML = `
    <div class="order-detail-heading">
      <div class="order-detail-heading-copy">
        <p class="product-tag">Order #${order.orderNumber}</p>
        <h2>${formatCurrency(order.totalAmount, order.currency)}</h2>
        <p class="order-detail-subcopy">Placed ${formatDate(order.purchaseDate)} · ${order.items.length} item${order.items.length === 1 ? "" : "s"}</p>
      </div>
      <span class="order-status-chip" data-status="${order.status}">${toTitleCase(order.status)}</span>
    </div>
    <dl class="order-detail-grid">
      <div><dt>Purchase Date</dt><dd>${formatDate(order.purchaseDate)}</dd></div>
      <div><dt>Delivery Date</dt><dd>${formatDate(order.deliveryDate)}</dd></div>
      <div><dt>Shipped At</dt><dd>${formatDate(order.shippedAt)}</dd></div>
      <div><dt>Tracking Number</dt><dd>${order.trackingNumber || "Not assigned yet"}</dd></div>
      <div><dt>Discount Code</dt><dd>${order.discountCode || "None used"}</dd></div>
      <div><dt>Customer</dt><dd>${order.user?.name || "Private Access Member"}${order.user?.email ? `<br>${order.user.email}` : ""}</dd></div>
    </dl>
    <div class="order-detail-items">
      <h3>Products Purchased</h3>
      ${order.items
        .map(
          (item) => `
            <article class="order-line-item">
              <div>
                <p class="product-tag">${item.variant || "Standard variant"}</p>
                <h4>${item.productName}</h4>
                <p class="order-line-description">
                  ${[item.color, item.size].filter(Boolean).join(" / ") || "Private access selection"}
                </p>
              </div>
              <div class="order-line-meta">
                <span>Qty ${item.quantity}</span>
                <span>${formatCurrency(item.unitPrice, order.currency)}</span>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function buildApprovalCard(user) {
  const card = document.createElement("article");
  card.className = "approval-card";
  card.innerHTML = `
    <div>
      <p class="product-tag">Pending access</p>
      <h3>${user.name || "VOIZN member"}</h3>
      <p>${user.email}</p>
      <p class="approval-meta">Requested ${formatDate(user.createdAt)}${user.country ? ` • ${user.country}` : ""}</p>
    </div>
    <div class="approval-actions">
      <button class="auth-button approve-user-button" type="button" data-user-id="${user.id}">Grant Access</button>
      <button class="entry-secondary-button reject-user-button" type="button" data-user-id="${user.id}">Reject</button>
    </div>
  `;
  return card;
}

async function fetchPendingApprovals() {
  const payload = await apiFetch("/api/admin/pending-access", {
    method: "GET",
  });
  return payload.pendingUsers || [];
}

async function handleApprovalAction(button, action, refreshCallback) {
  setButtonLoading(
    button,
    true,
    action === "approve" ? "Granting" : "Rejecting",
  );

  try {
    await apiFetch(
      action === "approve"
        ? "/api/admin/approve-user"
        : "/api/admin/reject-user",
      {
        method: "POST",
        body: JSON.stringify({ userId: button.dataset.userId }),
      },
    );
    await refreshCallback();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function bindApprovalButtons(container, refreshCallback) {
  container.querySelectorAll(".approve-user-button").forEach((button) => {
    button.addEventListener("click", () =>
      handleApprovalAction(button, "approve", refreshCallback),
    );
  });

  container.querySelectorAll(".reject-user-button").forEach((button) => {
    button.addEventListener("click", () =>
      handleApprovalAction(button, "reject", refreshCallback),
    );
  });
}

function renderPendingApprovals(users) {
  const section = requireSelector("#admin-approval-section");
  const list = requireSelector("#admin-pending-list");
  if (!section || !list) {
    return;
  }

  if (!state.currentUser || state.currentUser.role !== "ADMIN") {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  list.innerHTML = "";

  if (!users.length) {
    list.innerHTML =
      '<p class="empty-state-copy">No access approvals are waiting right now.</p>';
    return;
  }

  users.forEach((user) => {
    const card = buildApprovalCard(user);
    list.appendChild(card);
  });

  bindApprovalButtons(list, async () => {
    const refreshedUsers = await fetchPendingApprovals();
    renderPendingApprovals(refreshedUsers);
  });
}

async function initializeAdminApprovalsPage() {
  if (pageType !== "admin-approvals") {
    return;
  }

  if (!state.currentUser) {
    return;
  }

  if (state.currentUser.role !== "ADMIN") {
    window.location.replace("profile.html");
    return;
  }

  const list = requireSelector("#admin-approvals-list");
  const empty = requireSelector("#admin-approvals-empty");
  if (!list) {
    return;
  }

  const users = await fetchPendingApprovals();
  list.innerHTML = "";

  if (!users.length) {
    if (empty) {
      empty.hidden = false;
    }
    return;
  }

  if (empty) {
    empty.hidden = true;
  }

  users.forEach((user) => {
    list.appendChild(buildApprovalCard(user));
  });

  bindApprovalButtons(list, initializeAdminApprovalsPage);
}

async function renderOrdersPage() {
  const list = requireSelector("#orders-list");
  const empty = requireSelector("#orders-empty");

  if (!list) {
    return;
  }

  const payload = await apiFetch("/api/orders", {
    method: "GET",
  });
  const orders = payload.orders || [];
  list.innerHTML = "";

  if (!orders.length) {
    if (empty) {
      empty.hidden = false;
    }
  } else if (empty) {
    empty.hidden = true;
  }

  orders.forEach((order) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "order-card";
    card.dataset.orderNumber = String(order.orderNumber);
    const lineCount = order.items?.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );
    const leadItem = order.items?.[0];
    card.innerHTML = `
      <div class="order-card-copy">
        <p class="product-tag">Order #${order.orderNumber}</p>
        <h3>${leadItem?.productName || "VOIZN order"}</h3>
        <p class="order-card-summary">
          ${lineCount || order.items?.length || 0} piece${lineCount === 1 ? "" : "s"} · ${formatCurrency(order.totalAmount, order.currency)}
        </p>
      </div>
      <div class="order-card-meta">
        <span>${formatDate(order.purchaseDate)}</span>
        <span class="order-status-chip" data-status="${order.status}">${toTitleCase(order.status)}</span>
      </div>
    `;
    card.addEventListener("click", async () => {
      const detail = await apiFetch(`/api/orders/${order.orderNumber}`, {
        method: "GET",
      });
      renderOrderDetails(detail.order);
    });
    list.appendChild(card);

    if (state.currentUser?.role === "ADMIN") {
      const controls = document.createElement("div");
      controls.className = "admin-order-controls";
      controls.innerHTML = `
        <select class="admin-order-status">
          ${["PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]
            .map(
              (status) =>
                `<option value="${status}" ${status === order.status ? "selected" : ""}>${toTitleCase(status)}</option>`,
            )
            .join("")}
        </select>
        <input class="admin-order-tracking" type="text" placeholder="Tracking number" value="${order.trackingNumber || ""}" />
        <button class="tile-link admin-order-save" type="button">Save</button>
      `;
      controls.querySelector(".admin-order-save")?.addEventListener("click", async () => {
        const status = controls.querySelector(".admin-order-status")?.value;
        const trackingNumber = controls.querySelector(".admin-order-tracking")?.value.trim();
        await apiFetch(`/api/admin/orders/${order.orderNumber}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status, trackingNumber: trackingNumber || null }),
        });
        await renderOrdersPage();
      });
      list.appendChild(controls);
    }
  });

  if (state.currentUser?.role === "ADMIN") {
    const pendingUsers = await fetchPendingApprovals();
    renderPendingApprovals(pendingUsers);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function debounce(callback, delay = 250) {
  let timeoutId = null;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
}

async function initializeAnalyticsPage() {
  if (pageType !== "admin-analytics") {
    return;
  }

  if (state.currentUser?.role !== "ADMIN") {
    window.location.replace("profile.html");
    return;
  }

  const summaryGrid = requireSelector("#analytics-summary-grid");
  const activityFeed = requireSelector("#analytics-activity-feed");
  const productsBody = requireSelector("#analytics-products-body");
  const filtersForm = requireSelector("#analytics-filters");
  const rangeButtons = Array.from(document.querySelectorAll("[data-analytics-range]"));
  const rangeInput = requireSelector("#analytics-range");
  const searchInput = requireSelector("#analytics-search");
  const eventTypeSelect = requireSelector("#analytics-event-type");
  const fromInput = requireSelector("#analytics-from");
  const toInput = requireSelector("#analytics-to");

  if (!summaryGrid || !activityFeed || !productsBody || !filtersForm) {
    return;
  }

  const analyticsState = {
    range: "7d",
    eventType: "all",
    search: "",
    from: "",
    to: "",
    page: 1,
  };

  const buildParams = () => {
    const params = new URLSearchParams();
    params.set("range", analyticsState.range);
    params.set("eventType", analyticsState.eventType);
    params.set("page", String(analyticsState.page));
    params.set("limit", "24");
    if (analyticsState.search) params.set("search", analyticsState.search);
    if (analyticsState.from) params.set("from", analyticsState.from);
    if (analyticsState.to) params.set("to", analyticsState.to);
    return params;
  };

  const renderSummaryCards = (summary) => {
    const cards = [
      ["Today’s Page Views", summary.totals.todaysPageViews, "Live site traffic today"],
      [
        "Top Clicked Product",
        summary.productLeaders.topClickedProduct
          ? `${summary.productLeaders.topClickedProduct.name} (${summary.productLeaders.topClickedProduct.count})`
          : "No signal yet",
        summary.range,
      ],
      [
        "Most Added To Basket",
        summary.productLeaders.mostAddedToBasketProduct
          ? `${summary.productLeaders.mostAddedToBasketProduct.name} (${summary.productLeaders.mostAddedToBasketProduct.count})`
          : "No signal yet",
        summary.range,
      ],
      [
        "Most Favourited",
        summary.productLeaders.mostFavoritedProduct
          ? `${summary.productLeaders.mostFavoritedProduct.name} (${summary.productLeaders.mostFavoritedProduct.count})`
          : "No signal yet",
        summary.range,
      ],
      ["Checkout Starts", summary.totals.checkoutStarts, summary.range],
      ["New Signups", summary.totals.newSignups, summary.range],
      ["Approval Requests", summary.totals.approvalRequests, summary.range],
      ["Orders Placed", summary.totals.ordersPlaced, summary.range],
      ["Back In Stock Signups", summary.totals.backInStockSignups, summary.range],
      ["Drop Notification Signups", summary.totals.dropNotificationSignups, summary.range],
    ];

    summaryGrid.innerHTML = cards
      .map(
        ([label, value, subcopy]) => `
          <article class="analytics-card analytics-card-extended">
            <p class="product-tag">${escapeHtml(label)}</p>
            <h3>${escapeHtml(value)}</h3>
            <p class="analytics-card-subcopy">${escapeHtml(subcopy)}</p>
          </article>
        `,
      )
      .join("");
  };

  const renderProductPerformance = (payload) => {
    if (!payload.products.length) {
      productsBody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="analytics-empty-state">
              <h3>No product analytics yet</h3>
              <p>Once shoppers start clicking, saving, and adding pieces to basket, product performance will appear here.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    productsBody.innerHTML = payload.products
      .map(
        (product) => `
          <tr>
            <td>
              <div class="analytics-product-cell">
                <strong>${escapeHtml(product.name)}</strong>
                <span>${escapeHtml(product.slug || "No product page linked")}</span>
              </div>
            </td>
            <td>${product.views}</td>
            <td>${product.clicks}</td>
            <td>${product.addToBasket}</td>
            <td>${product.favorites}</td>
            <td>${product.checkoutStarts}</td>
            <td>${product.orders}</td>
            <td>${product.conversionRate}%</td>
          </tr>
        `,
      )
      .join("");
  };

  const renderActivityFeed = (payload) => {
    if (!payload.items.length) {
      activityFeed.innerHTML = `
        <div class="analytics-empty-state">
          <h3>${analyticsState.search || analyticsState.eventType !== "all" ? "No matching events" : "No activity yet"}</h3>
          <p>${analyticsState.search || analyticsState.eventType !== "all"
            ? "Try widening the date range or clearing a filter."
            : "High-intent customer actions will appear here once visitors start engaging with products."}</p>
        </div>
      `;
      return;
    }

    activityFeed.innerHTML = payload.items
      .map((event) => {
        const actions = [
          event.actions?.productHref
            ? `<a class="analytics-action-button" href="${escapeHtml(event.actions.productHref)}">View Product</a>`
            : "",
          event.actions?.orderHref
            ? `<a class="analytics-action-button" href="${escapeHtml(event.actions.orderHref)}">View Order</a>`
            : "",
          event.actions?.userEmail
            ? `<a class="analytics-action-button" href="mailto:${escapeHtml(event.actions.userEmail)}">View User</a>`
            : "",
        ]
          .filter(Boolean)
          .join("");

        const countMarkup =
          event.count > 1
            ? `<span class="analytics-count-chip">${event.count} today</span>`
            : "";

        return `
          <article class="analytics-event-row analytics-event-row-rich" data-event-type="${escapeHtml(event.eventType)}">
            <div class="analytics-event-main">
              <div class="analytics-event-heading">
                <p class="product-tag">${escapeHtml(event.label)}</p>
                ${countMarkup}
              </div>
              <h3>${escapeHtml(event.summaryText)}</h3>
              <p class="analytics-event-context">
                <span>${escapeHtml(event.userEmail || "Guest")}</span>
                <span>${escapeHtml(event.browser || "Browser")}</span>
                <span>${escapeHtml(event.device || "Device")}</span>
                <span>${escapeHtml(event.country || "Country unavailable")}</span>
              </p>
              <p class="analytics-event-subcopy">${escapeHtml(event.path || event.product?.name || "VOIZN store activity")}</p>
              ${
                actions
                  ? `<div class="analytics-event-actions">${actions}</div>`
                  : ""
              }
            </div>
            <div class="analytics-event-time">
              <strong>${escapeHtml(formatDate(event.latestAt))}</strong>
              <span>${escapeHtml(formatDateTime(event.latestAt))}</span>
            </div>
          </article>
        `;
      })
      .join("");
  };

  const loadAnalytics = async () => {
    const params = buildParams().toString();
    try {
      const [summaryPayload, activityPayload, productsPayload] = await Promise.all([
        apiFetch(`/api/admin/analytics/summary?${params}`, { method: "GET" }),
        apiFetch(`/api/admin/analytics/activity?${params}`, { method: "GET" }),
        apiFetch(`/api/admin/analytics/products?${params}`, { method: "GET" }),
      ]);

      renderSummaryCards(summaryPayload.summary);
      renderActivityFeed(activityPayload.activity);
      renderProductPerformance(productsPayload.products);
    } catch (error) {
      const message = escapeHtml(error.message || "Analytics are temporarily unavailable.");
      summaryGrid.innerHTML = `<article class="analytics-card analytics-card-extended"><p class="product-tag">Analytics unavailable</p><h3>VOIZN signal paused</h3><p class="analytics-card-subcopy">${message}</p></article>`;
      activityFeed.innerHTML = `<div class="analytics-empty-state"><h3>Unable to load activity</h3><p>${message}</p></div>`;
      productsBody.innerHTML = `<tr><td colspan="8"><div class="analytics-empty-state"><h3>Unable to load product analytics</h3><p>${message}</p></div></td></tr>`;
    }
  };

  const reloadAnalytics = debounce(() => {
    analyticsState.page = 1;
    loadAnalytics();
  }, 200);

  rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      analyticsState.range = button.dataset.analyticsRange || "7d";
      analyticsState.from = "";
      analyticsState.to = "";
      if (rangeInput) rangeInput.value = analyticsState.range;
      if (fromInput) fromInput.value = "";
      if (toInput) toInput.value = "";
      rangeButtons.forEach((entry) =>
        entry.classList.toggle(
          "is-active",
          entry.dataset.analyticsRange === analyticsState.range,
        ),
      );
      reloadAnalytics();
    });
  });

  if (rangeInput) {
    rangeInput.addEventListener("change", () => {
      analyticsState.range = rangeInput.value || "7d";
      reloadAnalytics();
    });
  }

  if (eventTypeSelect) {
    eventTypeSelect.addEventListener("change", () => {
      analyticsState.eventType = eventTypeSelect.value || "all";
      reloadAnalytics();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      analyticsState.search = searchInput.value.trim();
      reloadAnalytics();
    });
  }

  [fromInput, toInput].forEach((input) => {
    if (!input) return;
    input.addEventListener("change", () => {
      analyticsState.from = fromInput?.value || "";
      analyticsState.to = toInput?.value || "";
      if (analyticsState.from || analyticsState.to) {
        analyticsState.range = "custom";
        rangeButtons.forEach((entry) => entry.classList.remove("is-active"));
      }
      reloadAnalytics();
    });
  });

  filtersForm.addEventListener("submit", (event) => {
    event.preventDefault();
    reloadAnalytics();
  });

  rangeButtons.forEach((entry) =>
    entry.classList.toggle("is-active", entry.dataset.analyticsRange === analyticsState.range),
  );

  await loadAnalytics();
}

function setupSortProducts() {
  const sortProducts = requireSelector("#sort-products");
  const catalogGrid = requireSelector(".catalog-grid");
  if (!sortProducts || !catalogGrid) {
    return;
  }

  const productCards = Array.from(
    catalogGrid.querySelectorAll(".product-card"),
  );

  sortProducts.addEventListener("change", () => {
    const sortValue = sortProducts.value;
    const sortedCards = [...productCards];

    if (sortValue === "price-low-high") {
      sortedCards.sort(
        (first, second) =>
          Number(first.dataset.price) - Number(second.dataset.price),
      );
    } else if (sortValue === "price-high-low") {
      sortedCards.sort(
        (first, second) =>
          Number(second.dataset.price) - Number(first.dataset.price),
      );
    } else {
      sortedCards.sort(
        (first, second) =>
          Number(first.dataset.order) - Number(second.dataset.order),
      );
    }

    sortedCards.forEach((card) => catalogGrid.appendChild(card));
  });
}

function setupSearchForms() {
  document.querySelectorAll(".search-box").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
    });
  });
}

function markPageReady() {
  document.body.classList.add("page-ready");
}

function setupAuthPage() {
  if (!isAuthPage) {
    return;
  }

  const redirectTarget =
    new URLSearchParams(window.location.search).get("redirect") || "index.html";
  const signInMessage = requireSelector("#signin-message");
  const signUpMessage = requireSelector("#signup-message");
  const verifyMessage = requireSelector("#verify-message");
  const passwordMessage = requireSelector("#password-message");
  const signupStartForm = requireSelector("#signup-start-form");
  const verifyCodeForm = requireSelector("#verify-code-form");
  const setPasswordForm = requireSelector("#set-password-form");
  const signInForm = requireSelector("#signin-form");
  const resetStartForm = requireSelector("#reset-start-form");
  const resetPasswordForm = requireSelector("#reset-password-form");
  const signupEmailField = requireSelector("#signup-email");
  const verifyEmailField = requireSelector("#verify-email");
  const setupTokenField = requireSelector("#setup-token");
  const resendButton = requireSelector("#resend-code-button");
  const resetEmailField = requireSelector("#reset-email");
  const resetTokenField = requireSelector("#reset-token");
  const resetStartMessage = requireSelector("#reset-start-message");
  const resetSentMessage = requireSelector("#reset-sent-message");
  const resetPasswordMessage = requireSelector("#reset-password-message");
  const resetBackButton = requireSelector("#reset-back-button");

  const authFlowState = {
    email: "",
    setupToken: "",
  };

  const signupFrames = document.querySelectorAll("[data-signup-frame]");
  const setSignupFrame = (frameName) => {
    signupFrames.forEach((frame) => {
      frame.hidden = frame.dataset.signupFrame !== frameName;
    });
  };

  if (signupFrames.length) {
    setSignupFrame("details");
  }

  const resetFrames = document.querySelectorAll("[data-reset-frame]");
  const setResetFrame = (frameName) => {
    resetFrames.forEach((frame) => {
      frame.hidden = frame.dataset.resetFrame !== frameName;
    });
  };

  if (resetFrames.length) {
    setResetFrame("request");
  }

  const resetTokenFromUrl =
    new URLSearchParams(window.location.search).get("token") || "";
  if (pageType === "reset-password" && resetTokenFromUrl) {
    if (resetTokenField) {
      resetTokenField.value = resetTokenFromUrl;
    }
    setResetFrame("password");
  }

  const errorCode = new URLSearchParams(window.location.search).get("error");
  if (errorCode === "signin-required") {
    showFieldMessage(
      signInMessage,
      "Sign in to continue into VOIZN.",
      "error",
    );
  }

  signInForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = signInForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, "Signing In");
    showFieldMessage(signInMessage, "");

    try {
      const payload = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: requireSelector("#signin-email")?.value.trim(),
          password: requireSelector("#signin-password")?.value || "",
        }),
      });

      state.currentUser = payload.user;
      window.location.replace(redirectTarget);
    } catch (error) {
      if (error.code === "access_not_approved") {
        const status = error.message.includes("waiting")
          ? "PENDING_APPROVAL"
          : "REJECTED";
        window.location.href = `access-status.html?status=${status.toLowerCase()}`;
      } else {
        showFieldMessage(signInMessage, error.message, "error");
      }
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  signupStartForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = signupStartForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, "Sending Code");
    showFieldMessage(signUpMessage, "");

    const email = signupEmailField?.value.trim() || "";

    try {
      await apiFetch("/api/auth/signup/start", {
        method: "POST",
        body: JSON.stringify({
          name: requireSelector("#signup-name")?.value.trim(),
          email,
          country: requireSelector("#signup-country")?.value.trim(),
        }),
      });

      authFlowState.email = email.toLowerCase();
      if (verifyEmailField) {
        verifyEmailField.value = authFlowState.email;
      }
      setSignupFrame("verify");
      showFieldMessage(
        verifyMessage,
        "Verification code sent. Check your inbox for the code from contact@voizn.store.",
        "success",
      );
    } catch (error) {
      showFieldMessage(signUpMessage, error.message, "error");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  verifyCodeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = verifyCodeForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, "Verifying");
    showFieldMessage(verifyMessage, "");

    try {
      const payload = await apiFetch("/api/auth/signup/verify-code", {
        method: "POST",
        body: JSON.stringify({
          email: verifyEmailField?.value.trim() || authFlowState.email,
          code: requireSelector("#verification-code")?.value.trim(),
        }),
      });

      authFlowState.setupToken = payload.setupToken;
      if (setupTokenField) {
        setupTokenField.value = authFlowState.setupToken;
      }
      setSignupFrame("password");
      showFieldMessage(
        passwordMessage,
        "Verification complete. Create your password to finish requesting access.",
        "success",
      );
    } catch (error) {
      showFieldMessage(verifyMessage, error.message, "error");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  setPasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = setPasswordForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, "Saving Password");
    showFieldMessage(passwordMessage, "");

    const password = requireSelector("#create-password")?.value || "";
    const confirmPassword = requireSelector("#confirm-password")?.value || "";

    if (password !== confirmPassword) {
      showFieldMessage(passwordMessage, "Passwords do not match.", "error");
      setButtonLoading(submitButton, false);
      return;
    }

    try {
      await apiFetch("/api/auth/signup/set-password", {
        method: "POST",
        body: JSON.stringify({
          setupToken: setupTokenField?.value || authFlowState.setupToken,
          password,
        }),
      });

      showFieldMessage(
        passwordMessage,
        "Account created. VOIZN will email you once manual access has been approved.",
        "success",
      );
      setTimeout(() => {
        window.location.href = "access-status.html?status=pending_approval";
      }, 1800);
    } catch (error) {
      showFieldMessage(passwordMessage, error.message, "error");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  resendButton?.addEventListener("click", async () => {
    const email = verifyEmailField?.value.trim() || authFlowState.email;
    if (!email) {
      showFieldMessage(verifyMessage, "Enter your email first to resend the code.", "error");
      return;
    }

    setButtonLoading(resendButton, true, "Sending");
    try {
      await apiFetch("/api/auth/signup/resend-code", {
        method: "POST",
        body: JSON.stringify({
          email,
        }),
      });
      authFlowState.email = email.toLowerCase();
      showFieldMessage(verifyMessage, "A fresh verification code has been sent.", "success");
    } catch (error) {
      showFieldMessage(verifyMessage, error.message, "error");
    } finally {
      setButtonLoading(resendButton, false);
    }
  });

  resetStartForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = resetStartForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, "Sending Email");
    showFieldMessage(resetStartMessage, "");

    const email = resetEmailField?.value.trim() || "";

    try {
      await apiFetch("/api/auth/password-reset/start", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setResetFrame("sent");
      showFieldMessage(
        resetSentMessage,
        `If the account exists, we sent a reset link to ${email}.`,
        "success",
      );
    } catch (error) {
      showFieldMessage(resetStartMessage, error.message, "error");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  resetPasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = resetPasswordForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, "Saving Password");
    showFieldMessage(resetPasswordMessage, "");

    const password = requireSelector("#reset-new-password")?.value || "";
    const confirmPassword = requireSelector("#reset-confirm-password")?.value || "";

    if (password !== confirmPassword) {
      showFieldMessage(resetPasswordMessage, "Passwords do not match.", "error");
      setButtonLoading(submitButton, false);
      return;
    }

    try {
      await apiFetch("/api/auth/password-reset/complete", {
        method: "POST",
        body: JSON.stringify({
          resetToken: resetTokenField?.value || resetTokenFromUrl,
          password,
        }),
      });
      showFieldMessage(
        resetPasswordMessage,
        "Your password has been updated. Redirecting you back to sign in.",
        "success",
      );
      setTimeout(() => {
        window.location.href = "signin.html";
      }, 1600);
    } catch (error) {
      showFieldMessage(resetPasswordMessage, error.message, "error");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  resetBackButton?.addEventListener("click", () => {
    setResetFrame("request");
    showFieldMessage(resetSentMessage, "");
  });

}

async function initializeProfilePage() {
  if (pageType !== "profile") {
    return;
  }

  if (!state.currentUser) {
    renderProfilePage(null);
    return;
  }

  try {
    showLoadingState("#profile-favorites-preview", 2);
    const payload = await apiFetch("/api/profile", {
      method: "GET",
    });
    state.favorites = payload.profile.favorites || [];
    state.favoritesMap = createFavoriteMap(state.favorites);
    renderProfilePage(payload.profile);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function initializeOrdersPage() {
  if (pageType !== "orders") {
    return;
  }

  try {
    showLoadingState("#orders-list", 3);
    await renderOrdersPage();
    const focusedOrder = new URLSearchParams(window.location.search).get("order");
    if (focusedOrder) {
      const detail = await apiFetch(`/api/orders/${focusedOrder}`, {
        method: "GET",
      });
      renderOrderDetails(detail.order);
    }
  } catch (error) {
    const empty = requireSelector("#orders-empty");
    if (empty) {
      empty.hidden = false;
      empty.textContent = error.message;
    }
  }
}

async function initializeFavoritesPage() {
  if (pageType !== "favorites") {
    return;
  }

  renderFavoritesPage();
}

function initializeAccessStatusPage() {
  if (pageType !== "access-status") {
    return;
  }

  const status = new URLSearchParams(window.location.search).get("status") || "pending_approval";
  const copy = buildAccessCopy(status);
  const title = requireSelector("#access-status-title");
  const body = requireSelector("#access-status-copy");
  if (title) title.textContent = copy.title;
  if (body) body.textContent = copy.description;
}

async function initializeCommonAuthenticatedFeatures() {
  setupFavorites();

  if (!state.currentUser) {
    return;
  }

  await loadFavorites();
  updateFavoriteButtons();

  if (pageType === "favorites") {
    renderFavoritesPage();
  }
}

async function main() {
  setupPageTransitions();
  setupThemeToggle();
  setupMenu();
  setupDropdowns();
  setupScrollCinema();
  setupSearchForms();
  setupRevealObserver();
  setupAuthPage();
  setupHeader();
  markPageReady();

  const catalogPromise = pageNeedsCatalogData()
    ? loadCatalogState()
    : Promise.resolve();
  const [authResult] = await Promise.allSettled([bootstrapAuth()]);
  if (authResult.status === "fulfilled") {
    state.currentUser = authResult.value;
  }

  if (isAuthPage && state.currentUser) {
    window.location.replace("index.html");
    return;
  }

  await catalogPromise;
  setupDropExperience();
  setupHeader();
  enhanceCatalogCards();
  setupSortProducts();
  await initializeCommonAuthenticatedFeatures();
  await initializeProfilePage();
  await initializeOrdersPage();
  await initializeFavoritesPage();
  await initializeAdminApprovalsPage();
  await initializeAnalyticsPage();
  initializeAccessStatusPage();
  trackAnalyticsEvent("PAGE_VIEW");
}

window.trackAnalyticsEvent = trackAnalyticsEvent;
window.showToast = showToast;

main().catch((error) => {
  console.error("VOIZN frontend bootstrap failed:", error);
});
