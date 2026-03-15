(function (global) {
  const CHAT_ROOT_PATH = "/chat";
  const MESSAGES_ROOT_PATH = "/messages";
  const CHAT_LIST_CLASS = "chat-mobile-list-active";
  const CHAT_CONVERSATION_CLASS = "chat-mobile-conversation-active";
  const CHAT_INFO_CLASS = "chat-mobile-info-active";
  const BACK_BUTTON_ID = "chat-mobile-back-btn";
  const INFO_MOBILE_NAV_ID = "chat-info-mobile-nav";
  let appObserver = null;
  let infoPanelObserver = null;
  let syncFrame = null;
  let lastConversationPath = null;

  function parseHash(rawHash) {
    if (global.RouteHelper?.parseHash) {
      return global.RouteHelper.parseHash(rawHash || global.location.hash || "");
    }

    const normalizedHash = (rawHash || global.location.hash || "").toString().trim();
    const hashBody = normalizedHash.startsWith("#")
      ? normalizedHash.slice(1)
      : normalizedHash;
    const pathOnly = (hashBody.split("?")[0] || "").trim();

    return {
      path: pathOnly.startsWith("/") ? pathOnly : `/${pathOnly || ""}`.replace(/\/+$/, "") || "/",
    };
  }

  function isMobileLayout() {
    return (
      global.CloudMResponsive?.isMobileLayout?.() ||
      global.innerWidth <= 768
    );
  }

  function isChatPath(path) {
    if (global.RouteHelper?.isChatPath) {
      return global.RouteHelper.isChatPath(path || "");
    }

    const normalized = (path || "").toString().trim();
    return (
      normalized === CHAT_ROOT_PATH ||
      normalized.startsWith(`${CHAT_ROOT_PATH}/`) ||
      normalized === MESSAGES_ROOT_PATH ||
      normalized.startsWith(`${MESSAGES_ROOT_PATH}/`)
    );
  }

  function isChatConversationPath(path) {
    if (global.RouteHelper?.isChatConversationPath) {
      return global.RouteHelper.isChatConversationPath(path || "");
    }

    const normalized = (path || "").toString().trim();
    return (
      normalized.startsWith(`${CHAT_ROOT_PATH}/`) ||
      normalized.startsWith(`${MESSAGES_ROOT_PATH}/`)
    );
  }

  function shouldObserveAppMutations() {
    const path = parseHash(global.location.hash || "").path || "/";
    return isMobileLayout() && isChatPath(path);
  }

  function getBackLabel() {
    return (
      global.I18n?.t?.("chat.header.backToChats", {}, "Back to chats") ||
      "Back to chats"
    );
  }

  function getInfoBackLabel() {
    return global.I18n?.t?.("common.back", {}, "Back") || "Back";
  }

  function getInfoTitle() {
    return global.I18n?.t?.("chat.info.section.info", {}, "Chat info") || "Chat info";
  }

  function getInfoPanel() {
    return document.getElementById("chat-info");
  }

  function getInfoContent() {
    return document.getElementById("chat-info-content");
  }

  function getInfoButton() {
    return document.getElementById("chat-info-btn");
  }

  function goToChatList() {
    const targetPath = CHAT_ROOT_PATH;
    closeMobileInfoPanel();

    if (global.RouteHelper?.setHash) {
      global.RouteHelper.setHash(targetPath);
    } else {
      global.location.hash = `#${targetPath}`;
    }
  }

  function isInfoSidebarVisible() {
    const panel = getInfoPanel();
    return !!panel && !panel.classList.contains("hidden");
  }

  function setInfoButtonActive(isActive) {
    const infoBtn = getInfoButton();
    if (!infoBtn) return;
    infoBtn.classList.toggle("active", !!isActive);
  }

  function removeMobileInfoNav() {
    getInfoContent()?.querySelector(`#${INFO_MOBILE_NAV_ID}`)?.remove();
  }

  function closeMobileInfoPanel() {
    if (!isMobileLayout()) return;

    const panel = getInfoPanel();
    if (panel) {
      panel.classList.add("hidden");
    }

    setInfoButtonActive(false);
    document.body?.classList.remove(CHAT_INFO_CLASS);
    removeMobileInfoNav();
  }

  function ensureMobileInfoNav() {
    if (!isMobileLayout()) {
      removeMobileInfoNav();
      return;
    }

    const panel = getInfoPanel();
    const content = getInfoContent();
    if (!panel || panel.classList.contains("hidden") || !content) {
      removeMobileInfoNav();
      return;
    }

    if (
      content.querySelector(".chat-media-panel-inline") ||
      content.querySelector(".chat-members-panel-inline") ||
      content.querySelector(".chat-search-panel-inline")
    ) {
      removeMobileInfoNav();
      return;
    }

    const infoHeader = content.querySelector(".chat-info-header");
    if (!infoHeader) {
      removeMobileInfoNav();
      return;
    }

    let nav = content.querySelector(`#${INFO_MOBILE_NAV_ID}`);
    if (!nav) {
      nav = document.createElement("div");
      nav.id = INFO_MOBILE_NAV_ID;
      nav.className = "chat-info-mobile-nav";
      nav.innerHTML = `
        <button type="button" class="chat-info-mobile-back-btn" aria-label="${getInfoBackLabel()}" title="${getInfoBackLabel()}">
          <i data-lucide="arrow-left"></i>
        </button>
        <span class="chat-info-mobile-title">${getInfoTitle()}</span>
      `;
      content.insertBefore(nav, infoHeader);
    } else {
      const button = nav.querySelector(".chat-info-mobile-back-btn");
      const title = nav.querySelector(".chat-info-mobile-title");
      if (button) {
        button.setAttribute("aria-label", getInfoBackLabel());
        button.setAttribute("title", getInfoBackLabel());
      }
      if (title) {
        title.textContent = getInfoTitle();
      }
    }

    const backBtn = nav.querySelector(".chat-info-mobile-back-btn");
    if (backBtn) {
      backBtn.onclick = () => {
        closeMobileInfoPanel();
        syncSoon();
      };
    }

    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ container: nav });
    }
  }

  function ensureChatSidebarOpen() {
    if (!global.ChatSidebar || typeof global.ChatSidebar.open !== "function") {
      return;
    }

    const panel = document.getElementById("chat-panel");
    const isSidebarAlreadyOpen =
      !!global.ChatSidebar.isOpen && !!panel?.classList.contains("show");

    if (!isSidebarAlreadyOpen) {
      Promise.resolve(global.ChatSidebar.open()).catch(() => {});
    }
  }

  function ensureBackButton() {
    const header = document.querySelector(".chat-view-header");
    const userBlock = header?.querySelector(".chat-view-user");
    if (!header || !userBlock) return;

    let button = document.getElementById(BACK_BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = BACK_BUTTON_ID;
      button.className = "chat-mobile-back-btn";
      button.innerHTML = '<i data-lucide="chevron-left"></i>';
      button.addEventListener("click", goToChatList);
    }

    button.setAttribute("aria-label", getBackLabel());
    button.setAttribute("title", getBackLabel());

    if (!header.contains(button)) {
      header.insertBefore(button, userBlock);
    }

    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ container: button });
    }
  }

  function removeBackButton() {
    document.getElementById(BACK_BUTTON_ID)?.remove();
  }

  function syncChatMobileState() {
    const body = document.body;
    if (!body) return;

    const path = parseHash(global.location.hash || "").path || "/";
    const mobile = isMobileLayout();
    const chatPath = mobile && isChatPath(path);
    const conversationPath = chatPath && isChatConversationPath(path);
    const listPath = chatPath && !conversationPath;
    const isConversationChanged =
      conversationPath && path !== lastConversationPath;

    if (isConversationChanged) {
      closeMobileInfoPanel();
    }

    if (!conversationPath) {
      lastConversationPath = null;
    } else {
      lastConversationPath = path;
    }

    const infoPath = conversationPath && isInfoSidebarVisible();

    body.classList.toggle(CHAT_LIST_CLASS, listPath);
    body.classList.toggle(CHAT_CONVERSATION_CLASS, conversationPath);
    body.classList.toggle(CHAT_INFO_CLASS, infoPath);
    setInfoButtonActive(infoPath);
    ensureMobileInfoNav();

    if (!chatPath) {
      removeBackButton();
      body.classList.remove(CHAT_INFO_CLASS);
      removeMobileInfoNav();
      if (!mobile && isChatPath(path)) {
        ensureChatSidebarOpen();
        return;
      }

      if (mobile && typeof global.closeChatSidebar === "function") {
        global.closeChatSidebar(true);
      }
      return;
    }

    if (conversationPath) {
      ensureBackButton();
    } else {
      removeBackButton();
    }

    if (conversationPath && typeof global.closeChatSidebar === "function") {
      global.closeChatSidebar(true);
    } else if (listPath) {
      ensureChatSidebarOpen();
    }
  }

  function syncSoon() {
    if (syncFrame) {
      global.cancelAnimationFrame(syncFrame);
    }

    syncFrame = global.requestAnimationFrame(() => {
      syncFrame = null;
      refreshAppObserver();
      syncChatMobileState();
    });
  }

  function disconnectAppObserver() {
    if (!appObserver) return;
    appObserver.disconnect();
    appObserver = null;
  }

  function disconnectInfoPanelObserver() {
    if (!infoPanelObserver) return;
    infoPanelObserver.disconnect();
    infoPanelObserver = null;
  }

  function refreshAppObserver() {
    const appRoot = document.getElementById("app");
    if (!appRoot || !shouldObserveAppMutations()) {
      disconnectAppObserver();
      disconnectInfoPanelObserver();
      return;
    }

    if (!appObserver) {
      appObserver = new MutationObserver(() => {
        syncSoon();
      });

      appObserver.observe(appRoot, {
        childList: true,
        subtree: true,
      });
    }

    const infoPanel = getInfoPanel();
    if (!infoPanel || infoPanelObserver) return;

    infoPanelObserver = new MutationObserver(() => {
      syncSoon();
    });

    infoPanelObserver.observe(infoPanel, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  if (global.I18n?.onChange) {
    global.I18n.onChange(() => syncSoon());
  }

  global.addEventListener("hashchange", syncSoon);
  global.addEventListener("pageshow", syncSoon);
  global.addEventListener("cloudm:viewport-change", syncSoon);
  document.addEventListener("DOMContentLoaded", () => {
    syncSoon();
  });

  syncSoon();
})(window);
