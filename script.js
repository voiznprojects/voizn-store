const AUTH_STORAGE_KEY = "voizn-authenticated-user";
const AUTH_ERROR_KEY = "voizn-auth-error";
const THEME_STORAGE_KEY = "voizn-theme";
const FAVORITES_STORAGE_KEY_PREFIX = "voizn-favorites";

const isAuthPage = document.body.dataset.authPage === "true";
const isProtectedPage = document.body.dataset.protected === "true";
const themeToggleButtons = document.querySelectorAll(".theme-toggle");

const AUTH_USERS = {
  voiznadmin: "39b5dac3622a493e66b0bfe0a00247a1bdacdd1233c080f6b57e8837b150106c",
  srinithi7: "5262512637c208440ce7479b52014f3f556fcbc35b915ecbe9aea89a0d1f6b05",
  guest1: "1afc14e1e0676836a23b602b0b8c1609da95e234c147e7b7d36b562a0a79c3cb",
  sakana7: "5262512637c208440ce7479b52014f3f556fcbc35b915ecbe9aea89a0d1f6b05",
};

const getActiveUser = () => sessionStorage.getItem(AUTH_STORAGE_KEY) || "";
const getSavedTheme = () => localStorage.getItem(THEME_STORAGE_KEY) || "dark";
const getFavoritesStorageKey = () =>
  `${FAVORITES_STORAGE_KEY_PREFIX}-${getActiveUser() || "guest"}`;
const normalizeFavoriteItems = (items) => {
  const normalizedItems = {};

  Object.values(items || {}).forEach((item) => {
    if (!item || !item.name) {
      return;
    }

    const normalizedId = slugify(item.name);
    normalizedItems[normalizedId] = {
      ...item,
      id: normalizedId,
    };
  });

  return normalizedItems;
};
const getSavedFavorites = () => {
  const storageKey = getFavoritesStorageKey();
  const savedItems = JSON.parse(localStorage.getItem(storageKey) || "{}");
  const normalizedItems = normalizeFavoriteItems(savedItems);

  if (JSON.stringify(savedItems) !== JSON.stringify(normalizedItems)) {
    localStorage.setItem(storageKey, JSON.stringify(normalizedItems));
  }

  return normalizedItems;
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

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

applyTheme(getSavedTheme());

const hashPassword = async (value) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

if (isProtectedPage && !getActiveUser()) {
  sessionStorage.setItem(AUTH_ERROR_KEY, "signin-required");
  window.location.replace("login.html");
}

if (isAuthPage && getActiveUser()) {
  window.location.replace("index.html");
}

const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const usernameField = document.querySelector("#login-username");
    const passwordField = document.querySelector("#login-password");

    if (!usernameField || !passwordField) {
      return;
    }

    const username = usernameField.value.trim();
    const passwordHash = await hashPassword(passwordField.value);

    if (AUTH_USERS[username] && AUTH_USERS[username] === passwordHash) {
      sessionStorage.setItem(AUTH_STORAGE_KEY, username);
      window.location.replace("index.html");
      return;
    }

    if (loginError) {
      loginError.textContent = "Incorrect username or password.";
    }
  });

  if (
    sessionStorage.getItem(AUTH_ERROR_KEY) === "signin-required" &&
    loginError
  ) {
    loginError.textContent =
      "Error: you must sign in before viewing the website.";
    sessionStorage.removeItem(AUTH_ERROR_KEY);
  }
}

const header = document.querySelector(".site-header");
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelectorAll(".site-nav a");
const dropdownParents = document.querySelectorAll(".has-dropdown");
const dropdownTriggers = document.querySelectorAll(".dropdown-trigger");
const revealItems = document.querySelectorAll(".reveal");
const searchForms = document.querySelectorAll(".search-box");
const sortProducts = document.querySelector("#sort-products");
const catalogGrid = document.querySelector(".catalog-grid");
const favoritesGrid = document.querySelector("#favorites-grid");
const favoritesEmpty = document.querySelector("#favorites-empty");

const setupHeader = () => {
  if (!header) {
    return;
  }

  const headerLeft = header.querySelector(".header-left");
  const brand = header.querySelector(".brand");
  const siteNav = header.querySelector(".site-nav");

  if (!headerLeft || !brand || !siteNav) {
    return;
  }

  const searchBox = headerLeft.querySelector(".search-box");
  const supportLink = headerLeft.querySelector('.utility-link[href="support.html"]');
  const profileLink = headerLeft.querySelector('.icon-link[aria-label="Profile"]');
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
    headerLeft.appendChild(bagLink);
  }
  headerLeft.appendChild(favoritesLink);

  if (profileLink) {
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
    panel.innerHTML = `
      <p class="profile-dropdown-label">Logged into</p>
      <p class="profile-dropdown-user">${getActiveUser() || "Guest"}</p>
      <a href="profile.html">Profile</a>
      <a href="orders.html">Your Orders</a>
      <a href="favorites.html">Favourites</a>
      <button class="logout-button" type="button">Logout</button>
    `;

    profileMenu.appendChild(trigger);
    profileMenu.appendChild(panel);
    if (navSupportLink) {
      navSupportLink.insertAdjacentElement("afterend", profileMenu);
    } else {
      siteNav.appendChild(profileMenu);
    }
  }

  let navUtilityLinks = siteNav.querySelector(".nav-utility-links");
  if (!navUtilityLinks) {
    navUtilityLinks = document.createElement("div");
    navUtilityLinks.className = "nav-utility-links";
    siteNav.insertBefore(navUtilityLinks, siteNav.firstChild);
  }

  if (!navUtilityLinks.querySelector(".favorites-link")) {
    const navSearch = siteNav.querySelector(".search-box");
    const mobileFavorites = favoritesLink.cloneNode(true);
    const mobileBag = bagLink ? bagLink.cloneNode(true) : null;
    const mobileProfile = profileLink ? profileLink.cloneNode(true) : null;
    const mobileAccount = document.createElement("a");
    mobileAccount.className = "account-link";
    mobileAccount.href = "profile.html";
    mobileAccount.textContent = "Profile";
    const mobileOrders = document.createElement("a");
    mobileOrders.className = "account-link";
    mobileOrders.href = "orders.html";
    mobileOrders.textContent = "Your Orders";

    navUtilityLinks.innerHTML = "";
    if (navSearch) {
      navUtilityLinks.appendChild(navSearch);
    }
    navUtilityLinks.appendChild(mobileFavorites);
    if (mobileBag) {
      navUtilityLinks.appendChild(mobileBag);
    }
    navUtilityLinks.appendChild(mobileAccount);
    navUtilityLinks.appendChild(mobileOrders);
    if (mobileProfile) {
      mobileProfile.href = "profile.html";
      navUtilityLinks.appendChild(mobileProfile);
    }
  }
};

const setupFavorites = () => {
  const favoriteItems = getSavedFavorites();
  const productCards = document.querySelectorAll(".product-card");

  productCards.forEach((card, index) => {
    const productArt = card.querySelector(".product-art");
    const productName = card.querySelector("h3")?.textContent || `product-${index + 1}`;
    const productId =
      card.dataset.productId ||
      slugify(productName);

    card.dataset.productId = productId;

    if (!productArt || productArt.querySelector(".favorite-button")) {
      return;
    }

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "favorite-button";
    favoriteButton.dataset.productId = productId;
    favoriteButton.setAttribute("aria-label", `Toggle favourite for ${productName}`);
    favoriteButton.setAttribute("title", `Toggle favourite for ${productName}`);

    const productMeta = {
      id: productId,
      name: productName,
      tag: card.querySelector(".product-tag")?.textContent || "",
      description: card.querySelector(".product-meta p")?.textContent || "",
      price: card.querySelector(".product-meta span")?.textContent || "",
      artClass:
        Array.from(productArt.classList).find((className) =>
          className.startsWith("art-"),
        ) || "",
    };

    const updateFavoriteState = () => {
      const isFavorited = Boolean(favoriteItems[productId]);
      favoriteButton.classList.toggle("is-favorited", isFavorited);
      favoriteButton.setAttribute("aria-pressed", String(isFavorited));
    };

    favoriteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!getActiveUser()) {
        window.location.replace("login.html");
        return;
      }

      if (favoriteItems[productId]) {
        delete favoriteItems[productId];
      } else {
        favoriteItems[productId] = productMeta;
      }

      localStorage.setItem(
        getFavoritesStorageKey(),
        JSON.stringify(favoriteItems),
      );
      updateFavoriteState();

      if (favoritesGrid && favoritesGrid.contains(card) && !favoriteItems[productId]) {
        card.remove();
        if (favoritesEmpty && favoritesGrid.children.length === 0) {
          favoritesEmpty.hidden = false;
        }
      }
    });

    updateFavoriteState();
    productArt.appendChild(favoriteButton);
  });
};

const renderFavoritesPage = () => {
  if (!favoritesGrid) {
    return;
  }

  const favoriteItems = Object.values(getSavedFavorites());
  favoritesGrid.innerHTML = "";

  if (favoriteItems.length === 0) {
    if (favoritesEmpty) {
      favoritesEmpty.hidden = false;
    }
    return;
  }

  if (favoritesEmpty) {
    favoritesEmpty.hidden = true;
  }

  favoriteItems.forEach((item) => {
    const article = document.createElement("article");
    article.className = "product-card reveal is-visible";
    article.dataset.productId = item.id;
    article.innerHTML = `
      <div class="product-art ${item.artClass || ""}"></div>
      <div class="product-meta">
        <div>
          ${item.tag ? `<p class="product-tag">${item.tag}</p>` : ""}
          <h3>${item.name}</h3>
          <p>${item.description}</p>
        </div>
        <span>${item.price}</span>
      </div>
    `;
    favoritesGrid.appendChild(article);
  });

  setupFavorites();
};

setupHeader();
setupFavorites();
renderFavoritesPage();

const profileUsername = document.querySelector("#profile-username");
if (profileUsername && getActiveUser()) {
  profileUsername.textContent = `${getActiveUser()} is currently signed into private access.`;
}

if (menuToggle && header) {
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

  const profileMenu = event.target.closest(".profile-menu");
  document.querySelectorAll(".profile-menu").forEach((menu) => {
    const trigger = menu.querySelector(".profile-trigger");
    if (!trigger) {
      return;
    }

    if (!profileMenu || profileMenu !== menu) {
      menu.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    }
  });
});

document.querySelectorAll(".profile-trigger").forEach((trigger) => {
  trigger.addEventListener("click", () => {
    const parentMenu = trigger.closest(".profile-menu");
    if (!parentMenu) {
      return;
    }

    const isOpen = parentMenu.classList.toggle("open");
    trigger.setAttribute("aria-expanded", String(isOpen));
  });
});

document.querySelectorAll(".logout-button").forEach((button) => {
  button.addEventListener("click", () => {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    window.location.replace("login.html");
  });
});

if (revealItems.length > 0) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}

searchForms.forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });
});

if (sortProducts && catalogGrid) {
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

    sortedCards.forEach((card) => {
      catalogGrid.appendChild(card);
    });
  });
}

themeToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextTheme =
      document.body.dataset.theme === "light" ? "dark" : "light";
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  });
});
