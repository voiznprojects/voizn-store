(function () {
  "use strict";

  const DEFAULT_API_VERSION = "2026-04";
  const CART_STORAGE_KEY = "voizn-shopify-cart-id";
  const BASKET_STORAGE_KEY = "voizn-basket-items";
  const AUTH_STORAGE_KEY = "voizn-authenticated-user";
  const FAVORITES_STORAGE_KEY_PREFIX = "voizn-favorites";
  const PRODUCT_BINDINGS = {
    "Ghostline Hoodie": {
      handle: "ghostline-hoodie",
      variantId: "gid://shopify/ProductVariant/59557595578702",
      page: "ghostline-hoodie.html",
      materialInfo: "Heavyweight brushed cotton blend with a soft fleece-backed interior.",
      detailBody:
        "Built for colder rotations with a cleaner oversized shape, dropped shoulders, and an everyday monochrome finish.",
      details: [
        "Oversized fit",
        "Ribbed hem and cuffs",
        "Soft brushed interior",
        "Style: VOI-GH01",
      ],
    },
    "Signal Tee": {
      handle: "signal-tee",
      variantId: "gid://shopify/ProductVariant/59557632606542",
      page: "signal-tee.html",
      materialInfo: "Premium midweight cotton jersey made for everyday wear.",
      detailBody:
        "A clean base layer with a boxy silhouette and sharper hem finish for understated styling.",
      details: [
        "Box fit",
        "Midweight cotton",
        "Minimal seam finish",
        "Style: VOI-ST01",
      ],
    },
    "Silent Short": {
      handle: "silent-short",
      variantId: "gid://shopify/ProductVariant/59557635850574",
      page: "silent-short.html",
      materialInfo: "Lightweight performance fabric with a soft utility mesh hand feel.",
      detailBody:
        "Warm-weather shorts with a cleaner cut, easy movement, and understated technical energy.",
      details: [
        "Utility mesh texture",
        "Relaxed fit",
        "Elastic waistband",
        "Style: VOI-SS01",
      ],
    },
  };

  let productModalElements = null;

  function getBasketItems() {
    return JSON.parse(localStorage.getItem(BASKET_STORAGE_KEY) || "[]");
  }

  function setBasketItems(items) {
    localStorage.setItem(BASKET_STORAGE_KEY, JSON.stringify(items));
  }

  function getCurrencySymbol(currencyCode) {
    return currencyCode === "GBP" ? "£" : `${currencyCode} `;
  }

  function readShopifyConfig() {
    const globalConfig = window.SHOPIFY_CONFIG || {};
    const root = document.documentElement;

    const storeDomain =
      globalConfig.storeDomain ||
      root.dataset.shopifyStoreDomain ||
      "";
    const storefrontToken =
      globalConfig.storefrontToken ||
      root.dataset.shopifyStorefrontToken ||
      "";
    const apiVersion =
      globalConfig.apiVersion ||
      root.dataset.shopifyApiVersion ||
      DEFAULT_API_VERSION;

    if (!storeDomain) {
      throw new Error(
        "Missing Shopify store domain. Set SHOPIFY_CONFIG.storeDomain or data-shopify-store-domain.",
      );
    }

    return {
      storeDomain: normalizeStoreDomain(storeDomain),
      storefrontToken,
      apiVersion,
    };
  }

  function normalizeStoreDomain(domain) {
    return domain
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "");
  }

  function getGraphQLEndpoint(config) {
    return `https://${config.storeDomain}/api/${config.apiVersion}/graphql.json`;
  }

  async function storefrontRequest(query, variables) {
    const config = readShopifyConfig();
    const headers = {
      "Content-Type": "application/json",
    };

    // Public Storefront tokens are allowed in browser code.
    // Do not put Admin API credentials here.
    if (config.storefrontToken) {
      headers["X-Shopify-Storefront-Access-Token"] = config.storefrontToken;
    }

    const response = await fetch(getGraphQLEndpoint(config), {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        variables: variables || {},
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Shopify Storefront API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await response.json();

    if (payload.errors && payload.errors.length > 0) {
      throw new Error(payload.errors.map((error) => error.message).join("; "));
    }

    return payload.data;
  }

  function formatProducts(productEdges) {
    return (productEdges || []).map(({ node }) => ({
      id: node.id,
      title: node.title,
      handle: node.handle,
      description: node.description,
      images: (node.images.edges || []).map(({ node: imageNode }) => ({
        url: imageNode.url,
        altText: imageNode.altText || "",
      })),
      price: node.priceRange.minVariantPrice.amount,
      currencyCode: node.priceRange.minVariantPrice.currencyCode,
      variants: (node.variants.edges || []).map(({ node: variantNode }) => ({
        id: variantNode.id,
        title: variantNode.title,
        availableForSale: variantNode.availableForSale,
        price: variantNode.price.amount,
        currencyCode: variantNode.price.currencyCode,
      })),
    }));
  }

  async function fetchProducts(options) {
    const settings = {
      first: 12,
      query: "",
      ...options,
    };

    const data = await storefrontRequest(
      `
        query FetchProducts($first: Int!, $query: String) {
          products(first: $first, query: $query) {
            edges {
              node {
                id
                title
                handle
                description
                images(first: 5) {
                  edges {
                    node {
                      url
                      altText
                    }
                  }
                }
                priceRange {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                }
                variants(first: 25) {
                  edges {
                    node {
                      id
                      title
                      availableForSale
                      price {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      {
        first: settings.first,
        query: settings.query || null,
      },
    );

    return formatProducts(data.products.edges);
  }

  async function fetchProductByHandle(handle) {
    if (!handle) {
      throw new Error("Missing Shopify product handle.");
    }

    const data = await storefrontRequest(
      `
        query FetchProductByHandle($handle: String!) {
          product(handle: $handle) {
            id
            title
            handle
            description
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            options(first: 10) {
              id
              name
              optionValues {
                name
                firstSelectableVariant {
                  id
                }
              }
            }
            variants(first: 50) {
              edges {
                node {
                  id
                  title
                  availableForSale
                  selectedOptions {
                    name
                    value
                  }
                  price {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      `,
      {
        handle,
      },
    );

    return data.product;
  }

  function getStoredCartId() {
    return localStorage.getItem(CART_STORAGE_KEY) || "";
  }

  function setStoredCartId(cartId) {
    localStorage.setItem(CART_STORAGE_KEY, cartId);
  }

  async function createCart(lines) {
    const data = await storefrontRequest(
      `
        mutation CreateCart($input: CartInput) {
          cartCreate(input: $input) {
            cart {
              id
              checkoutUrl
              totalQuantity
              lines(first: 50) {
                edges {
                  node {
                    id
                    quantity
                    merchandise {
                      ... on ProductVariant {
                        id
                        title
                        product {
                          title
                          handle
                        }
                        price {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
              cost {
                subtotalAmount {
                  amount
                  currencyCode
                }
                totalAmount {
                  amount
                  currencyCode
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        input: {
          lines: lines || [],
        },
      },
    );

    const result = data.cartCreate;

    if (result.userErrors.length > 0) {
      throw new Error(result.userErrors.map((error) => error.message).join("; "));
    }

    setStoredCartId(result.cart.id);
    return result.cart;
  }

  async function getCart(cartId) {
    const targetCartId = cartId || getStoredCartId();

    if (!targetCartId) {
      return null;
    }

    const data = await storefrontRequest(
      `
        query GetCart($cartId: ID!) {
          cart(id: $cartId) {
            id
            checkoutUrl
            totalQuantity
            lines(first: 50) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                      product {
                        title
                        handle
                      }
                      image {
                        url
                        altText
                      }
                      price {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
            cost {
              subtotalAmount {
                amount
                currencyCode
              }
              totalAmount {
                amount
                currencyCode
              }
            }
          }
        }
      `,
      {
        cartId: targetCartId,
      },
    );

    return data.cart;
  }

  async function addToCart(variantId, quantity) {
    if (!variantId) {
      throw new Error("Missing variant ID for addToCart.");
    }

    const targetQuantity = Number(quantity || 1);
    let cartId = getStoredCartId();

    if (!cartId) {
      const cart = await createCart([
        {
          merchandiseId: variantId,
          quantity: targetQuantity,
        },
      ]);

      return cart;
    }

    const data = await storefrontRequest(
      `
        mutation AddToCart($cartId: ID!, $lines: [CartLineInput!]!) {
          cartLinesAdd(cartId: $cartId, lines: $lines) {
            cart {
              id
              checkoutUrl
              totalQuantity
              lines(first: 50) {
                edges {
                  node {
                    id
                    quantity
                    merchandise {
                      ... on ProductVariant {
                        id
                        title
                        product {
                          title
                          handle
                        }
                        price {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
              cost {
                subtotalAmount {
                  amount
                  currencyCode
                }
                totalAmount {
                  amount
                  currencyCode
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        cartId,
        lines: [
          {
            merchandiseId: variantId,
            quantity: targetQuantity,
          },
        ],
      },
    );

    const result = data.cartLinesAdd;

    if (result.userErrors.length > 0) {
      throw new Error(result.userErrors.map((error) => error.message).join("; "));
    }

    setStoredCartId(result.cart.id);
    return result.cart;
  }

  async function redirectToCheckout() {
    const cart = await getCart();

    if (!cart || !cart.checkoutUrl) {
      throw new Error("No Shopify cart found for checkout.");
    }

    window.location.href = cart.checkoutUrl;
  }

  function getVariantIdFromElement(element) {
    return (
      element.dataset.variantId ||
      element.getAttribute("data-variant-id") ||
      ""
    );
  }

  function getQuantityFromElement(element) {
    const quantity = Number(
      element.dataset.quantity || element.getAttribute("data-quantity") || 1,
    );

    return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  }

  function getCurrentUser() {
    return sessionStorage.getItem(AUTH_STORAGE_KEY) || "";
  }

  function getFavoritesStorageKey() {
    return `${FAVORITES_STORAGE_KEY_PREFIX}-${getCurrentUser() || "guest"}`;
  }

  function getSavedFavorites() {
    return JSON.parse(localStorage.getItem(getFavoritesStorageKey()) || "{}");
  }

  function setSavedFavorites(items) {
    localStorage.setItem(getFavoritesStorageKey(), JSON.stringify(items));
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function formatMoney(amount, currencyCode) {
    const numericAmount = Number(amount || 0);
    return `${getCurrencySymbol(currencyCode)}${numericAmount.toFixed(2)}`;
  }

  function getMeaningfulOptions(product) {
    return (product?.options || []).filter(
      (option) =>
        option.name &&
        option.name.toLowerCase() !== "title" &&
        option.optionValues &&
        option.optionValues.length > 0,
    );
  }

  function buildAvailableOptions(product) {
    return getMeaningfulOptions(product).map((option) => ({
      name: option.name,
      values: option.optionValues.map((value) => value.name),
    }));
  }

  function mapVariantsForBasket(variants) {
    return (variants || []).map((variant) => ({
      id: variant.id,
      price: Number(variant.price?.amount || 0),
      currencyCode: variant.price?.currencyCode || "GBP",
      selectedOptions: (variant.selectedOptions || []).map((selectedOption) => ({
        name: selectedOption.name,
        value: selectedOption.value,
      })),
    }));
  }

  function normalizeSelectedOptions(selectedOptions, availableOptions) {
    return (availableOptions || []).map((option) => {
      const selectedMatch = (selectedOptions || []).find(
        (selectedOption) => selectedOption.name === option.name,
      );

      return {
        name: option.name,
        value: selectedMatch?.value || option.values[0] || "",
      };
    });
  }

  function findMatchingVariant(variants, selectedOptions) {
    return (variants || []).find((variant) =>
      (selectedOptions || []).every((selectedOption) =>
        (variant.selectedOptions || []).some(
          (variantOption) =>
            variantOption.name === selectedOption.name &&
            variantOption.value === selectedOption.value,
        ),
      ),
    );
  }

  function buildProductSnapshot(card) {
    const art = card.querySelector(".product-art");
    const title = card.querySelector("h3")?.textContent?.trim() || "";
    const binding = PRODUCT_BINDINGS[title] || {};

    return {
      id: slugify(title),
      title,
      handle: binding.handle || card.dataset.shopifyHandle || "",
      variantId: binding.variantId || card.dataset.variantId || "",
      tag: card.querySelector(".product-tag")?.textContent?.trim() || "",
      description: card.querySelector(".product-meta p")?.textContent?.trim() || "",
      price: card.querySelector(".product-meta span")?.textContent?.trim() || "",
      artClass:
        Array.from(art?.classList || []).find((className) =>
          className.startsWith("art-"),
        ) || "",
      materialInfo: binding.materialInfo || "Material details coming soon.",
      detailBody:
        binding.detailBody ||
        "Detailed product information will appear here once this item is fully synced.",
      details: binding.details || [],
      page: binding.page || "",
    };
  }

  function ensureProductModal() {
    if (productModalElements) {
      return productModalElements;
    }

    const shell = document.createElement("div");
    shell.className = "product-modal-shell";
    shell.hidden = true;
    shell.innerHTML = `
      <div class="product-modal-backdrop" data-product-modal-close></div>
      <div class="product-modal">
        <button class="product-modal-close" type="button" aria-label="Close product view" data-product-modal-close>&times;</button>
        <div class="product-modal-grid">
          <div class="product-modal-gallery">
            <div class="product-modal-thumbs"></div>
            <div class="product-modal-main">
              <img class="product-modal-main-image" alt="" />
              <div class="product-modal-main-fallback"></div>
            </div>
          </div>
          <div class="product-modal-info">
            <p class="product-modal-kicker"></p>
            <h2 class="product-modal-title"></h2>
            <p class="product-modal-subtitle"></p>
            <p class="product-modal-price"></p>
            <div class="product-modal-options"></div>
            <div class="product-modal-material"></div>
            <div class="product-modal-actions">
              <button class="cta-button product-modal-add" type="button">Add To Bag</button>
              <button class="tile-link product-modal-favorite" type="button">Add To Favourite</button>
            </div>
            <button class="product-modal-detail-trigger" type="button">View Product Details</button>
          </div>
        </div>
        <div class="product-detail-popover" hidden>
          <div class="product-detail-popover-card">
            <button class="product-detail-close" type="button" aria-label="Close product details">&times;</button>
            <div class="product-detail-header">
              <div class="product-detail-thumb"></div>
              <div>
                <h3 class="product-detail-title"></h3>
                <p class="product-detail-price"></p>
              </div>
            </div>
            <p class="product-detail-body"></p>
            <div class="product-detail-list-wrap">
              <h4>Product Details</h4>
              <ul class="product-detail-list"></ul>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(shell);

    const elements = {
      shell,
      thumbs: shell.querySelector(".product-modal-thumbs"),
      mainImage: shell.querySelector(".product-modal-main-image"),
      mainFallback: shell.querySelector(".product-modal-main-fallback"),
      kicker: shell.querySelector(".product-modal-kicker"),
      title: shell.querySelector(".product-modal-title"),
      subtitle: shell.querySelector(".product-modal-subtitle"),
      price: shell.querySelector(".product-modal-price"),
      options: shell.querySelector(".product-modal-options"),
      material: shell.querySelector(".product-modal-material"),
      addButton: shell.querySelector(".product-modal-add"),
      favoriteButton: shell.querySelector(".product-modal-favorite"),
      detailTrigger: shell.querySelector(".product-modal-detail-trigger"),
      detailPopover: shell.querySelector(".product-detail-popover"),
      detailThumb: shell.querySelector(".product-detail-thumb"),
      detailTitle: shell.querySelector(".product-detail-title"),
      detailPrice: shell.querySelector(".product-detail-price"),
      detailBody: shell.querySelector(".product-detail-body"),
      detailList: shell.querySelector(".product-detail-list"),
    };

    shell.querySelectorAll("[data-product-modal-close]").forEach((button) => {
      button.addEventListener("click", closeProductModal);
    });

    shell.querySelector(".product-detail-close").addEventListener("click", () => {
      elements.detailPopover.hidden = true;
    });

    productModalElements = elements;
    return productModalElements;
  }

  function closeProductModal() {
    const elements = ensureProductModal();
    elements.shell.hidden = true;
    elements.detailPopover.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function renderGallery(images, fallbackClass) {
    const elements = ensureProductModal();
    const galleryImages = images && images.length > 0 ? images : [];

    elements.thumbs.innerHTML = "";
    elements.mainImage.hidden = galleryImages.length === 0;
    elements.mainFallback.hidden = galleryImages.length > 0;
    elements.mainFallback.className = `product-modal-main-fallback ${fallbackClass || ""}`;

    if (galleryImages.length === 0) {
      return;
    }

    const setMainImage = (image) => {
      elements.mainImage.src = image.url;
      elements.mainImage.alt = image.altText || "";
    };

    galleryImages.forEach((image, index) => {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "product-modal-thumb";
      thumb.innerHTML = `<img src="${image.url}" alt="${image.altText || ""}" />`;
      thumb.addEventListener("click", () => setMainImage(image));
      elements.thumbs.appendChild(thumb);

      if (index === 0) {
        setMainImage(image);
      }
    });
  }

  function renderOptions(product) {
    const elements = ensureProductModal();
    elements.options.innerHTML = "";

    const meaningfulOptions = getMeaningfulOptions(product);

    if (meaningfulOptions.length === 0) {
      return [];
    }

    const selectors = [];

    meaningfulOptions.forEach((option) => {
      const wrapper = document.createElement("label");
      wrapper.className = "product-modal-option";
      const title = document.createElement("span");
      title.textContent = option.name;

      const select = document.createElement("select");
      option.optionValues.forEach((value) => {
        const optionElement = document.createElement("option");
        optionElement.value = value.name;
        optionElement.textContent = value.name;
        if (value.firstSelectableVariant?.id) {
          optionElement.dataset.variantId = value.firstSelectableVariant.id;
        }
        select.appendChild(optionElement);
      });

      wrapper.appendChild(title);
      wrapper.appendChild(select);
      elements.options.appendChild(wrapper);
      selectors.push({ name: option.name, select });
    });

    return selectors;
  }

  function toggleFavoriteFromSnapshot(snapshot) {
    const favorites = getSavedFavorites();

    if (!getCurrentUser()) {
      window.location.replace("login.html");
      return false;
    }

    if (favorites[snapshot.id]) {
      delete favorites[snapshot.id];
      setSavedFavorites(favorites);
      return false;
    }

    favorites[snapshot.id] = {
      id: snapshot.id,
      name: snapshot.title,
      tag: snapshot.tag,
      description: snapshot.description,
      price: snapshot.price,
      artClass: snapshot.artClass,
    };
    setSavedFavorites(favorites);
    return true;
  }

  function isFavorited(snapshot) {
    return Boolean(getSavedFavorites()[snapshot.id]);
  }

  function addItemToBasket(item) {
    const items = getBasketItems();
    const existingItem = items.find(
      (basketItem) =>
        basketItem.variantId === item.variantId &&
        JSON.stringify(basketItem.selectedOptions || []) ===
          JSON.stringify(item.selectedOptions || []),
    );

    if (existingItem) {
      existingItem.quantity += item.quantity;
    } else {
      items.push(item);
    }

    setBasketItems(items);
    return items;
  }

  function updateBasketItem(itemIndex, updates) {
    const items = getBasketItems();

    if (!items[itemIndex]) {
      return items;
    }

    items[itemIndex] = {
      ...items[itemIndex],
      ...updates,
    };
    setBasketItems(items);
    return items;
  }

  function removeBasketItem(itemIndex) {
    const items = getBasketItems();
    items.splice(itemIndex, 1);
    setBasketItems(items);
    return items;
  }

  async function goToShopifyCheckoutFromBasket() {
    const basketItems = getBasketItems();

    if (basketItems.length === 0) {
      throw new Error("Your basket is empty.");
    }

    try {
      readShopifyConfig();
    } catch (error) {
      throw new Error(
        "Shopify checkout is not connected yet. Add your store domain and Storefront token to SHOPIFY_CONFIG before continuing to checkout.",
      );
    }

    const lines = basketItems.map((item) => ({
      merchandiseId: item.variantId,
      quantity: Number(item.quantity || 1),
    }));

    const cart = await createCart(lines);
    window.location.href = cart.checkoutUrl;
  }

  async function openProductModal(card) {
    const elements = ensureProductModal();
    const snapshot = buildProductSnapshot(card);
    let product = null;

    elements.shell.hidden = false;
    document.body.classList.add("modal-open");
    elements.detailPopover.hidden = true;

    elements.kicker.textContent = snapshot.tag || "Product";
    elements.title.textContent = snapshot.title;
    elements.subtitle.textContent = snapshot.description || "Product details";
    elements.price.textContent = snapshot.price || "";
    elements.material.textContent = snapshot.materialInfo;
    renderGallery([], snapshot.artClass);
    elements.options.innerHTML = "";

    try {
      if (snapshot.handle) {
        product = await fetchProductByHandle(snapshot.handle);
      }
    } catch (error) {
      console.warn("Shopify product modal fallback used:", error.message);
    }

    const images = (product?.images?.edges || []).map(({ node }) => ({
      url: node.url,
      altText: node.altText || snapshot.title,
    }));
    renderGallery(images, snapshot.artClass);

    const livePrice =
      product?.variants?.edges?.[0]?.node?.price?.amount || snapshot.price.replace(/[^\d.]/g, "");
    const liveCurrency =
      product?.variants?.edges?.[0]?.node?.price?.currencyCode || "GBP";
    elements.price.textContent = livePrice
      ? `${liveCurrency === "GBP" ? "£" : `${liveCurrency} `}${livePrice}`
      : snapshot.price;
    elements.subtitle.textContent = product?.description || snapshot.description || "Product details";

    const optionSelectors = renderOptions(product);

    const resolveVariantId = () => {
      if (!product?.variants?.edges?.length) {
        return snapshot.variantId;
      }

      if (optionSelectors.length === 0) {
        return product.variants.edges[0].node.id;
      }

      const matchedVariant = product.variants.edges.find(({ node }) =>
        optionSelectors.every(({ name, select }) =>
          node.selectedOptions.some(
            (selectedOption) =>
              selectedOption.name === name &&
              selectedOption.value === select.value,
          ),
        ),
      );

      return matchedVariant?.node?.id || snapshot.variantId;
    };

    elements.addButton.onclick = async () => {
      try {
        await addToCart(resolveVariantId(), 1);
        elements.addButton.textContent = "Added To Bag";
        window.setTimeout(() => {
          elements.addButton.textContent = "Add To Bag";
        }, 1200);
      } catch (error) {
        alert(error.message);
      }
    };

    const updateFavoriteButton = () => {
      elements.favoriteButton.textContent = isFavorited(snapshot)
        ? "Remove Favourite"
        : "Add To Favourite";
    };

    elements.favoriteButton.onclick = () => {
      toggleFavoriteFromSnapshot(snapshot);
      updateFavoriteButton();
    };
    updateFavoriteButton();

    elements.detailTitle.textContent = snapshot.title;
    elements.detailPrice.textContent = elements.price.textContent;
    elements.detailBody.textContent =
      snapshot.detailBody || product?.description || snapshot.description || "";
    elements.detailList.innerHTML = "";
    (snapshot.details || []).forEach((detail) => {
      const li = document.createElement("li");
      li.textContent = detail;
      elements.detailList.appendChild(li);
    });
    elements.detailThumb.className = `product-detail-thumb ${snapshot.artClass || ""}`;
    if (images[0]) {
      elements.detailThumb.innerHTML = `<img src="${images[0].url}" alt="${images[0].altText || snapshot.title}" />`;
    } else {
      elements.detailThumb.innerHTML = "";
    }

    elements.detailTrigger.onclick = () => {
      elements.detailPopover.hidden = false;
    };
  }

  function renderProductPage(product, snapshot) {
    const shell = document.querySelector(".product-page-shell");
    if (!shell) {
      return;
    }

    const images = (product?.images?.edges || []).map(({ node }) => ({
      url: node.url,
      altText: node.altText || snapshot.title,
    }));
    const variants = (product?.variants?.edges || []).map(({ node }) => node);
    const detailImage = document.querySelector(".product-page-detail-thumb");
    const thumbList = document.querySelector(".product-page-thumbs");
    const mainImage = document.querySelector(".product-page-main-image");
    const mainFallback = document.querySelector(".product-page-main-fallback");
    const title = document.querySelector(".product-page-title");
    const subtitle = document.querySelector(".product-page-subtitle");
    const price = document.querySelector(".product-page-price");
    const material = document.querySelector(".product-page-material");
    const options = document.querySelector(".product-page-options");
    const addButton = document.querySelector(".product-page-add");
    const favoriteButton = document.querySelector(".product-page-favorite");
    const detailTrigger = document.querySelector(".product-page-detail-trigger");
    const detailPopover = document.querySelector(".product-page-detail-popover");
    const detailTitle = document.querySelector(".product-page-detail-title");
    const detailPrice = document.querySelector(".product-page-detail-price");
    const detailBody = document.querySelector(".product-page-detail-body");
    const detailList = document.querySelector(".product-page-detail-list");
    const detailClose = document.querySelector(".product-page-detail-close");

    const livePrice = variants[0]?.price?.amount || snapshot.price.replace(/[^\d.]/g, "");
    const liveCurrency = variants[0]?.price?.currencyCode || "GBP";
    const formattedPrice = livePrice
      ? `${liveCurrency === "GBP" ? "£" : `${liveCurrency} `}${livePrice}`
      : snapshot.price;

    title.textContent = snapshot.title;
    subtitle.textContent = product?.description || snapshot.description || "";
    price.textContent = formattedPrice;
    material.textContent = snapshot.materialInfo;
    detailTitle.textContent = snapshot.title;
    detailPrice.textContent = formattedPrice;
    detailBody.textContent = snapshot.detailBody || product?.description || "";
    detailList.innerHTML = "";
    (snapshot.details || []).forEach((detail) => {
      const li = document.createElement("li");
      li.textContent = detail;
      detailList.appendChild(li);
    });

    const setMainImage = (image) => {
      if (!mainImage || !mainFallback) {
        return;
      }

      if (image) {
        mainImage.hidden = false;
        mainFallback.hidden = true;
        mainImage.src = image.url;
        mainImage.alt = image.altText || snapshot.title;
      } else {
        mainImage.hidden = true;
        mainFallback.hidden = false;
        mainFallback.className = `product-page-main-fallback ${snapshot.artClass || ""}`;
      }
    };

    thumbList.innerHTML = "";
    if (images.length > 0) {
      images.forEach((image, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "product-page-thumb";
        button.innerHTML = `<img src="${image.url}" alt="${image.altText || snapshot.title}" />`;
        button.addEventListener("click", () => setMainImage(image));
        thumbList.appendChild(button);
        if (index === 0) {
          setMainImage(image);
        }
      });
      if (detailImage) {
        detailImage.innerHTML = `<img src="${images[0].url}" alt="${images[0].altText || snapshot.title}" />`;
      }
    } else {
      setMainImage(null);
      if (detailImage) {
        detailImage.innerHTML = "";
        detailImage.className = `product-page-detail-thumb ${snapshot.artClass || ""}`;
      }
    }

    options.innerHTML = "";
    const optionSelectors = renderProductPageOptions(product, options);
    const resolveVariantId = () => {
      if (variants.length === 0) {
        return snapshot.variantId;
      }

      if (optionSelectors.length === 0) {
        return variants[0].id;
      }

      const matchedVariant = variants.find((variant) =>
        optionSelectors.every(({ name, select }) =>
          variant.selectedOptions.some(
            (selectedOption) =>
              selectedOption.name === name &&
              selectedOption.value === select.value,
          ),
        ),
      );

      return matchedVariant?.id || snapshot.variantId;
    };

    addButton.onclick = async () => {
      const availableOptions = buildAvailableOptions(product);
      const selectedOptions = normalizeSelectedOptions(
        optionSelectors.map(({ name, select }) => ({
          name,
          value: select.value,
        })),
        availableOptions,
      );
      const selectedVariantId = resolveVariantId();
      const selectedVariant =
        variants.find((variant) => variant.id === selectedVariantId) || variants[0];
      const basketItem = {
        id: `${snapshot.id}-${selectedVariantId}`,
        title: snapshot.title,
        handle: snapshot.handle,
        variantId: selectedVariantId,
        quantity: 1,
        price: Number(selectedVariant?.price?.amount || livePrice || 0),
        currencyCode: selectedVariant?.price?.currencyCode || liveCurrency || "GBP",
        selectedOptions,
        image: images[0]?.url || "",
        imageAlt: images[0]?.altText || snapshot.title,
        artClass: snapshot.artClass,
        tag: snapshot.tag,
        availableOptions,
        variants: mapVariantsForBasket(variants),
      };

      addItemToBasket(basketItem);
      addButton.textContent = "Added To Bag";
      window.setTimeout(() => {
        addButton.textContent = "Add To Bag";
      }, 1200);
    };

    const updateFavoriteButton = () => {
      favoriteButton.textContent = isFavorited(snapshot)
        ? "Remove Favourite"
        : "Add To Favourite";
    };

    favoriteButton.onclick = () => {
      toggleFavoriteFromSnapshot(snapshot);
      updateFavoriteButton();
    };
    updateFavoriteButton();

    detailTrigger.onclick = () => {
      detailPopover.hidden = false;
    };

    detailClose?.addEventListener("click", () => {
      detailPopover.hidden = true;
    });
  }

  function renderProductPageOptions(product, mountPoint) {
    const options = product?.options || [];
    const meaningfulOptions = options.filter(
      (option) =>
        option.name &&
        option.name.toLowerCase() !== "title" &&
        option.optionValues &&
        option.optionValues.length > 0,
    );

    if (meaningfulOptions.length === 0) {
      return [];
    }

    const selectors = [];

    meaningfulOptions.forEach((option) => {
      const wrapper = document.createElement("label");
      wrapper.className = "product-page-option";
      const title = document.createElement("span");
      title.textContent = option.name;
      const select = document.createElement("select");

      option.optionValues.forEach((value) => {
        const optionElement = document.createElement("option");
        optionElement.value = value.name;
        optionElement.textContent = value.name;
        select.appendChild(optionElement);
      });

      wrapper.appendChild(title);
      wrapper.appendChild(select);
      mountPoint.appendChild(wrapper);
      selectors.push({ name: option.name, select });
    });

    return selectors;
  }

  async function bindProductPage() {
    const shell = document.querySelector(".product-page-shell");
    if (!shell) {
      return;
    }

    const handle = shell.dataset.shopifyHandle || "";
    const title = shell.dataset.productTitle || "";
    const snapshot = {
      id: slugify(title),
      title,
      handle,
      variantId: shell.dataset.variantId || "",
      tag: shell.dataset.productTag || "",
      description: shell.dataset.productDescription || "",
      price: shell.dataset.productPrice || "",
      artClass: shell.dataset.artClass || "",
      materialInfo: shell.dataset.materialInfo || "Material details coming soon.",
      detailBody: shell.dataset.detailBody || "",
      details: shell.dataset.details
        ? shell.dataset.details.split("|").map((item) => item.trim()).filter(Boolean)
        : [],
      page: "",
    };

    let product = null;
    try {
      product = await fetchProductByHandle(handle);
    } catch (error) {
      console.warn("Product page Shopify fetch failed:", error.message);
    }

    renderProductPage(product, snapshot);
  }

  async function handleAddToCartClick(button) {
    const variantId = getVariantIdFromElement(button);
    const quantity = getQuantityFromElement(button);

    if (!variantId) {
      throw new Error("Add to cart button is missing data-variant-id.");
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Adding...";

    try {
      addItemToBasket({
        id: `${slugify(button.dataset.productTitle || variantId)}-${variantId}`,
        title: button.dataset.productTitle || "Product",
        handle: button.dataset.handle || "",
        variantId,
        quantity,
        price: Number(button.dataset.price || 0),
        currencyCode: button.dataset.currencyCode || "GBP",
        selectedOptions: [],
        image: button.dataset.image || "",
        imageAlt: button.dataset.imageAlt || "",
        artClass: button.dataset.artClass || "",
        tag: button.dataset.tag || "",
      });
      button.textContent = "Added";
    } catch (error) {
      console.error(error);
      button.textContent = "Error";
      throw error;
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
      }, 1200);
    }
  }

  async function handleBuyNowClick(button) {
    const variantId = getVariantIdFromElement(button);
    const quantity = getQuantityFromElement(button);

    if (!variantId) {
      throw new Error("Buy now button is missing data-variant-id.");
    }

    button.disabled = true;

    try {
      const cart = await createCart([
        {
          merchandiseId: variantId,
          quantity,
        },
      ]);

      window.location.href = cart.checkoutUrl;
    } catch (error) {
      button.disabled = false;
      console.error(error);
      throw error;
    }
  }

  function bindBasketLinks() {
    document.querySelectorAll('.icon-link[aria-label="Basket"]').forEach((link) => {
      link.href = "basket.html";
    });
  }

  function renderBasketPage() {
    const basketList = document.querySelector("#basket-items");
    const basketEmpty = document.querySelector("#basket-empty");
    const basketTotal = document.querySelector("#basket-total");
    const basketCheckout = document.querySelector("#basket-checkout");

    if (!basketList || !basketTotal || !basketCheckout) {
      return;
    }

    const items = getBasketItems();
    basketList.innerHTML = "";

    if (items.length === 0) {
      basketEmpty.hidden = false;
      basketTotal.textContent = "£0.00";
      basketCheckout.disabled = true;
      return;
    }

    basketEmpty.hidden = true;
    basketCheckout.disabled = false;

    items.forEach((item, index) => {
      const row = document.createElement("article");
      row.className = "basket-item";
      const selectedOptions = normalizeSelectedOptions(
        item.selectedOptions,
        item.availableOptions,
      );

      const optionMarkup =
        item.availableOptions && item.availableOptions.length > 0
          ? item.availableOptions
              .map(
                (option) => `
                  <label class="basket-select-wrap">
                    <span>${option.name}</span>
                    <select data-basket-option="${index}" data-option-name="${option.name}">
                      ${option.values
                        .map((value) => {
                          const selectedValue =
                            selectedOptions.find(
                              (selectedOption) => selectedOption.name === option.name,
                            )?.value || option.values[0];
                          return `<option value="${value}" ${
                            value === selectedValue ? "selected" : ""
                          }>${value}</option>`;
                        })
                        .join("")}
                    </select>
                  </label>
                `,
              )
              .join("")
          : `
              <label class="basket-select-wrap basket-select-wrap-disabled">
                <span>Size</span>
                <select disabled>
                  <option selected>Default</option>
                </select>
              </label>
            `;

      row.innerHTML = `
        <div class="basket-item-media ${
          item.image ? "" : item.artClass || ""
        }">
          ${item.image ? `<img src="${item.image}" alt="${item.imageAlt || item.title}" />` : ""}
        </div>
        <div class="basket-item-info">
          <div class="basket-item-copy">
            <div>
              <p class="basket-item-tag">${item.tag || "Product"}</p>
              <h3>${item.title}</h3>
            </div>
            <button class="basket-remove" type="button" data-basket-remove="${index}">Remove</button>
          </div>
          <p class="basket-item-price">${formatMoney(item.price, item.currencyCode)}</p>
          <div class="basket-item-controls">
            ${optionMarkup}
            <label class="basket-select-wrap">
              <span>Quantity</span>
              <select data-basket-quantity="${index}">
                ${Array.from({ length: 10 }, (_, qtyIndex) => {
                  const qty = qtyIndex + 1;
                  return `<option value="${qty}" ${
                    qty === Number(item.quantity) ? "selected" : ""
                  }>${qty}</option>`;
                }).join("")}
              </select>
            </label>
          </div>
        </div>
      `;

      basketList.appendChild(row);
    });

    const total = items.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
      0,
    );
    basketTotal.textContent = formatMoney(total, items[0]?.currencyCode || "GBP");

    basketList.querySelectorAll("[data-basket-quantity]").forEach((select) => {
      select.addEventListener("change", () => {
        const itemIndex = Number(select.dataset.basketQuantity);
        updateBasketItem(itemIndex, {
          quantity: Number(select.value),
        });
        renderBasketPage();
      });
    });

    basketList.querySelectorAll("[data-basket-option]").forEach((select) => {
      select.addEventListener("change", () => {
        const itemIndex = Number(select.dataset.basketOption);
        const optionName = select.dataset.optionName || "";
        const basketItems = getBasketItems();
        const item = basketItems[itemIndex];

        if (!item) {
          return;
        }

        const currentSelectedOptions = normalizeSelectedOptions(
          item.selectedOptions,
          item.availableOptions,
        );
        const nextSelectedOptions = normalizeSelectedOptions(
          currentSelectedOptions.map((selectedOption) =>
            selectedOption.name === optionName
              ? { ...selectedOption, value: select.value }
              : selectedOption,
          ),
          item.availableOptions,
        );

        const matchedVariant = findMatchingVariant(item.variants, nextSelectedOptions);
        updateBasketItem(itemIndex, {
          selectedOptions: nextSelectedOptions,
          variantId: matchedVariant?.id || item.variantId,
          price: matchedVariant?.price || item.price,
          currencyCode: matchedVariant?.currencyCode || item.currencyCode,
        });
        renderBasketPage();
      });
    });

    basketList.querySelectorAll("[data-basket-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        const itemIndex = Number(button.dataset.basketRemove);
        removeBasketItem(itemIndex);
        renderBasketPage();
      });
    });

    basketCheckout.onclick = async () => {
      try {
        basketCheckout.disabled = true;
        basketCheckout.textContent = "Opening Checkout...";
        await goToShopifyCheckoutFromBasket();
      } catch (error) {
        alert(error.message);
        basketCheckout.disabled = false;
        basketCheckout.textContent = "Continue To Checkout";
      }
    };
  }

  function bindShopifyButtons() {
    bindBasketLinks();
    document.querySelectorAll("[data-shopify-add-to-cart]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await handleAddToCartClick(button);
        } catch (error) {
          alert(error.message);
        }
      });
    });

    document.querySelectorAll("[data-shopify-buy-now]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await handleBuyNowClick(button);
        } catch (error) {
          alert(error.message);
        }
      });
    });

    document.querySelectorAll("[data-shopify-checkout]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await redirectToCheckout();
        } catch (error) {
          alert(error.message);
        }
      });
    });

    document.querySelectorAll(".product-card").forEach((card) => {
      const title = card.querySelector("h3")?.textContent?.trim() || "";
      const binding = PRODUCT_BINDINGS[title];

      if (!binding) {
        return;
      }

      card.dataset.shopifyHandle = binding.handle;
      card.dataset.variantId = binding.variantId;

      if (binding.page) {
        card.classList.add("product-card-link");
        card.addEventListener("click", (event) => {
          if (event.target.closest(".favorite-button")) {
            return;
          }
          window.location.href = binding.page;
        });
      }
    });
  }

  window.ShopifyStorefront = {
    fetchProducts,
    fetchProductByHandle,
    createCart,
    addToCart,
    getCart,
    redirectToCheckout,
    bindShopifyButtons,
    getStoredCartId,
    bindProductPage,
    renderBasketPage,
    goToShopifyCheckoutFromBasket,
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindShopifyButtons();
    bindProductPage();
    renderBasketPage();
  });
})();
