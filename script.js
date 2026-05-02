const THEME_STORAGE_KEY = "voizn-theme";
const EARLY_ACCESS_STORAGE_KEY = "voizn-early-access";
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
};
const EARLY_ACCESS_USERS = {
  voiznadmin: "39b5dac3622a493e66b0bfe0a00247a1bdacdd1233c080f6b57e8837b150106c",
  "contact@voizn.store":
    "2310c3503b250b426fdd8a452e9f9f3c29dda977fe331c2df26d125c98b679a9",
  srinithi7: "5262512637c208440ce7479b52014f3f556fcbc35b915ecbe9aea89a0d1f6b05",
  guest1: "1afc14e1e0676836a23b602b0b8c1609da95e234c147e7b7d36b562a0a79c3cb",
  sakana7: "5262512637c208440ce7479b52014f3f556fcbc35b915ecbe9aea89a0d1f6b05",
};

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const getSavedTheme = () => localStorage.getItem(THEME_STORAGE_KEY) || "dark";
const hasEarlyAccessEntry = () =>
  sessionStorage.getItem(EARLY_ACCESS_STORAGE_KEY) === "granted";

async function hashPassword(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

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
};

applyTheme(getSavedTheme());

async function apiFetch(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    const networkError = new Error(
      ["127.0.0.1", "localhost"].includes(window.location.hostname)
        ? "VOIZN backend is offline. Start the backend server and try again."
        : "VOIZN is unable to reach the live account server right now. Please try again shortly.",
    );
    networkError.status = 0;
    networkError.code = "network_unavailable";
    networkError.cause = error;
    throw networkError;
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
}

function setupRevealObserver() {
  if (!revealItems.length) {
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

  revealItems.forEach((item) => observer.observe(item));
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

  const searchBox = headerLeft.querySelector(".search-box");
  const bagLink = headerLeft.querySelector('.icon-link[aria-label="Basket"]');
  const navSupportLink = siteNav.querySelector('.nav-link[href="support.html"]');
  let favoritesLink = headerLeft.querySelector(".favorites-link");

  if (!favoritesLink) {
    favoritesLink = document.createElement("a");
    favoritesLink.className = "favorites-link";
    favoritesLink.href = "favorites.html";
    favoritesLink.setAttribute("aria-label", "Favourites");
    favoritesLink.innerHTML =
      '<span class="icon-heart" aria-hidden="true"></span><span>Favourites</span>';
  }

  headerLeft.innerHTML = "";
  if (searchBox) {
    headerLeft.appendChild(searchBox);
  }
  if (bagLink) {
    bagLink.href = "basket.html";
    headerLeft.appendChild(bagLink);
  }
  headerLeft.appendChild(favoritesLink);

  siteNav.querySelectorAll(".profile-menu").forEach((menu) => menu.remove());

  const profileMenu = document.createElement("div");
  profileMenu.className = "profile-menu";
  const trigger = document.createElement("button");
  trigger.className = "icon-link profile-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "Open account menu");
  trigger.innerHTML = '<span class="icon-user" aria-hidden="true"></span>';

  const panel = document.createElement("div");
  panel.className = "profile-dropdown";

  if (state.currentUser) {
    panel.innerHTML = `
      <p class="profile-dropdown-label">Logged into</p>
      <p class="profile-dropdown-user">${state.currentUser.name || state.currentUser.email}</p>
      <a href="profile.html">Profile</a>
      <a href="orders.html">Your Orders</a>
      <a href="favorites.html">Favourites</a>
      ${
        state.currentUser.role === "ADMIN"
          ? '<a href="admin-approvals.html">Access Approvals</a>'
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

  profileMenu.appendChild(trigger);
  profileMenu.appendChild(panel);
  if (navSupportLink) {
    navSupportLink.insertAdjacentElement("afterend", profileMenu);
  } else {
    siteNav.appendChild(profileMenu);
  }

  let navUtilityLinks = siteNav.querySelector(".nav-utility-links");
  if (!navUtilityLinks) {
    navUtilityLinks = document.createElement("div");
    navUtilityLinks.className = "nav-utility-links";
    siteNav.insertBefore(navUtilityLinks, siteNav.firstChild);
  }

  if (navUtilityLinks) {
    const mobileSearch = siteNav.querySelector(".search-box");
    const mobileFavorites = favoritesLink.cloneNode(true);
    const mobileBag = bagLink ? bagLink.cloneNode(true) : null;
    const mobileProfile = document.createElement("a");
    mobileProfile.className = "account-link";
    mobileProfile.href = state.currentUser ? "profile.html" : "login.html";
    mobileProfile.textContent = state.currentUser ? "Profile" : "Log In";

    const mobileOrders = document.createElement("a");
    mobileOrders.className = "account-link";
    mobileOrders.href = state.currentUser ? "orders.html" : "login.html";
    mobileOrders.textContent = state.currentUser ? "Your Orders" : "Request Access";

    navUtilityLinks.innerHTML = "";
    if (mobileSearch) {
      navUtilityLinks.appendChild(mobileSearch);
    }
    navUtilityLinks.appendChild(mobileFavorites);
    if (mobileBag) {
      mobileBag.href = "basket.html";
      navUtilityLinks.appendChild(mobileBag);
    }
    navUtilityLinks.appendChild(mobileProfile);
    navUtilityLinks.appendChild(mobileOrders);
  }

  trigger.addEventListener("click", () => {
    const isOpen = profileMenu.classList.toggle("open");
    trigger.setAttribute("aria-expanded", String(isOpen));
  });

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
      const normalized = {
        ...payload.favorite,
        productId: payload.favorite.productId,
      };
      state.favoritesMap.set(productMeta.productId, normalized);
      state.favorites = [normalized, ...state.favorites.filter((favorite) => favorite.productId !== normalized.productId)];
    }
  } catch (error) {
    window.alert(error.message);
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
    `;
    favoritesGrid.appendChild(article);
  });

  setupFavorites();
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
            <span>${order.status}</span>
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
      <div>
        <p class="product-tag">Order #${order.orderNumber}</p>
        <h2>${formatCurrency(order.totalAmount, order.currency)}</h2>
      </div>
      <span class="order-status-chip">${order.status}</span>
    </div>
    <dl class="order-detail-grid">
      <div><dt>Purchase Date</dt><dd>${formatDate(order.purchaseDate)}</dd></div>
      <div><dt>Delivery Date</dt><dd>${formatDate(order.deliveryDate)}</dd></div>
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
    window.alert(error.message);
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
    card.innerHTML = `
      <div>
        <p class="product-tag">Order #${order.orderNumber}</p>
        <h3>${formatCurrency(order.totalAmount, order.currency)}</h3>
      </div>
      <div class="order-card-meta">
        <span>${formatDate(order.purchaseDate)}</span>
        <span>${order.user?.name || "VOIZN member"}</span>
      </div>
    `;
    card.addEventListener("click", async () => {
      const detail = await apiFetch(`/api/orders/${order.orderNumber}`, {
        method: "GET",
      });
      renderOrderDetails(detail.order);
    });
    list.appendChild(card);
  });

  if (state.currentUser?.role === "ADMIN") {
    const pendingUsers = await fetchPendingApprovals();
    renderPendingApprovals(pendingUsers);
  }
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

function setupAuthPage() {
  if (!isAuthPage) {
    return;
  }

  const entryForm = requireSelector("#entry-form");
  const entryMessage = requireSelector("#entry-message");
  const redirectTarget =
    new URLSearchParams(window.location.search).get("redirect") || "index.html";
  const signInMessage = requireSelector("#signin-message");
  const signUpMessage = requireSelector("#signup-message");
  const verifyMessage = requireSelector("#verify-message");
  const passwordMessage = requireSelector("#password-message");
  const oauthMessage = requireSelector("#oauth-message");
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

  if (pageType === "signin" && !hasEarlyAccessEntry()) {
    window.location.replace("login.html");
    return;
  }

  entryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = entryForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, "Checking");
    showFieldMessage(entryMessage, "");

    const username = requireSelector("#entry-username")?.value.trim().toLowerCase();
    const password = requireSelector("#entry-password")?.value || "";

    try {
      const passwordHash = await hashPassword(password);
      if (!username || EARLY_ACCESS_USERS[username] !== passwordHash) {
        throw new Error("Incorrect early access username or password.");
      }

      sessionStorage.setItem(EARLY_ACCESS_STORAGE_KEY, "granted");
      window.location.href = "signin.html";
    } catch (error) {
      showFieldMessage(entryMessage, error.message, "error");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

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
      "Sign in to continue into the private website.",
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
      showFieldMessage(signInMessage, error.message, "error");
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
        window.location.href = "signin.html";
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
      await apiFetch("/api/auth/signup/start", {
        method: "POST",
        body: JSON.stringify({
          name: requireSelector("#signup-name")?.value.trim() || "VOIZN Member",
          email,
          country: requireSelector("#signup-country")?.value.trim() || "",
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

  document.querySelectorAll("[data-oauth-provider]").forEach((button) => {
    button.addEventListener("click", async () => {
      const provider = button.dataset.oauthProvider;
      setButtonLoading(button, true, "Loading");
      showFieldMessage(oauthMessage, "");

      try {
        await apiFetch(`/api/auth/oauth/${provider}`, {
          method: "GET",
        });
      } catch (error) {
        showFieldMessage(
          oauthMessage,
          error.message,
          error.code === "oauth_not_configured" ? "info" : "error",
        );
      } finally {
        setButtonLoading(button, false);
      }
    });
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
    const payload = await apiFetch("/api/profile", {
      method: "GET",
    });
    state.favorites = payload.profile.favorites || [];
    state.favoritesMap = createFavoriteMap(state.favorites);
    renderProfilePage(payload.profile);
  } catch (error) {
    window.alert(error.message);
  }
}

async function initializeOrdersPage() {
  if (pageType !== "orders") {
    return;
  }

  try {
    await renderOrdersPage();
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

async function initializeCommonAuthenticatedFeatures() {
  if (!state.currentUser) {
    return;
  }

  await loadFavorites();
  setupFavorites();

  if (pageType === "favorites") {
    renderFavoritesPage();
  }
}

async function main() {
  setupThemeToggle();
  setupMenu();
  setupDropdowns();
  setupSearchForms();
  setupSortProducts();
  setupRevealObserver();
  setupAuthPage();
  await bootstrapAuth();

  if (isAuthPage && state.currentUser) {
    window.location.replace("index.html");
    return;
  }

  setupHeader();
  await initializeCommonAuthenticatedFeatures();
  await initializeProfilePage();
  await initializeOrdersPage();
  await initializeFavoritesPage();
  await initializeAdminApprovalsPage();
}

main().catch((error) => {
  console.error("VOIZN frontend bootstrap failed:", error);
});
