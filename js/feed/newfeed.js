(function() {
  let feedContainer;
  let loader;

  let isLoading = false;
  let hasMore = true;

  let cursorToken = null;
  let legacyCursorCreatedAt = null;
  let legacyCursorPostId = null;

  const LIMIT = APP_CONFIG.NEWSFEED_LIMIT;
  const feedT = (key, params = {}, fallback = "") =>
    window.I18n?.t ? window.I18n.t(key, params, fallback) : fallback;

  function isHomeSurfaceRoute() {
    const routeHelper = window.RouteHelper;
    const currentHash =
      window.location.hash ||
      (routeHelper?.buildHash ? routeHelper.buildHash("/") : "#/");
    const currentPath = routeHelper?.parseHash
      ? routeHelper.parseHash(currentHash).path
      : "";
    const paths = routeHelper?.PATHS || {};
    const storiesPath = paths.STORIES || "/stories";
    const storyPath = paths.STORY || "/story";
    const isHome = routeHelper?.isHomePath
      ? routeHelper.isHomePath(currentPath)
      : currentPath === "/" || currentPath === "/home";

    return (
      isHome ||
      currentPath === storiesPath ||
      currentPath.startsWith(`${storiesPath}/`) ||
      currentPath === storyPath ||
      currentPath.startsWith(`${storyPath}/`)
    );
  }

  function initFeed(shouldReload = true) {
    feedContainer = document.getElementById("feed");
    loader = document.getElementById("feed-loader");

    if (!feedContainer || !loader) {
      if (isHomeSurfaceRoute()) {
        console.warn("Feed DOM not ready");
      }
      return;
    }

    // If we are restoring state and have content, don't reset
    if (!shouldReload && feedContainer.children.length > 0) {
        console.log("Restoring feed state...");
        return;
    }

    // reset state khi vào lại home
    isLoading = false;
    hasMore = true;
    cursorToken = null;
    legacyCursorCreatedAt = null;
    legacyCursorPostId = null;

    // Register state hooks for PageCache
    window.getPageData = () => ({
        cursorToken,
        legacyCursorCreatedAt,
        legacyCursorPostId,
        hasMore
    });
    window.setPageData = (data) => {
        if (!data) return;
        cursorToken = data.cursorToken || null;
        legacyCursorCreatedAt = data.legacyCursorCreatedAt || null;
        legacyCursorPostId = data.legacyCursorPostId || null;
        hasMore = data.hasMore;
    };

    feedContainer.innerHTML = "";
    loadFeed();
  }

  function renderFeedSkeletons(count = 2) {
    if (!feedContainer) return;

    const safeCount = Math.max(1, Number.parseInt(count, 10) || 2);
    feedContainer.innerHTML = Array.from({ length: safeCount })
      .map(
        () => `
          <article class="post feed-skeleton-post" aria-hidden="true">
            <div class="feed-skeleton-header">
              <div class="feed-skeleton-avatar skeleton"></div>
              <div class="feed-skeleton-meta">
                <div class="feed-skeleton-line skeleton"></div>
                <div class="feed-skeleton-line short skeleton"></div>
              </div>
            </div>
            <div class="feed-skeleton-caption">
              <div class="feed-skeleton-line skeleton"></div>
              <div class="feed-skeleton-line medium skeleton"></div>
            </div>
            <div class="feed-skeleton-media skeleton"></div>
            <div class="feed-skeleton-actions">
              <div class="feed-skeleton-action skeleton"></div>
              <div class="feed-skeleton-action skeleton"></div>
              <div class="feed-skeleton-action skeleton"></div>
            </div>
          </article>
        `,
      )
      .join("");
  }

  function clearFeedSkeletons() {
    if (!feedContainer) return;
    feedContainer
      .querySelectorAll(".feed-skeleton-post")
      .forEach((item) => item.remove());
  }

  async function loadFeed() {
    if (isLoading || !hasMore) return;

    isLoading = true;
    const isInitialLoad =
      feedContainer &&
      (feedContainer.children.length === 0 ||
        feedContainer.querySelector(".feed-skeleton-post"));

    if (isInitialLoad) {
      renderFeedSkeletons(2);
    }

    // Chỉ hiện loader khi đã có bài viết (load more)
    if (
      feedContainer &&
      feedContainer.children.length > 0 &&
      !feedContainer.querySelector(".feed-skeleton-post")
    ) {
      LoadingUtils.toggle(loader, true);
    }

    try {
      let res;
      if (cursorToken) {
        res = await API.Posts.getFeed(LIMIT, cursorToken);
      } else if (legacyCursorCreatedAt && legacyCursorPostId) {
        res = await API.Posts.getFeed(LIMIT, legacyCursorCreatedAt, legacyCursorPostId);
      } else {
        res = await API.Posts.getFeed(LIMIT);
      }

      if (!res.ok) throw new Error("Load feed failed");

      const data = await res.json();
      const nextCursor = data?.nextCursor || null;

      clearFeedSkeletons();
      renderFeed(data.items);

      if (nextCursor?.token) {
        cursorToken = nextCursor.token;
        legacyCursorCreatedAt = null;
        legacyCursorPostId = null;
      } else if (nextCursor?.createdAt && nextCursor?.postId) {
        cursorToken = null;
        legacyCursorCreatedAt = nextCursor.createdAt;
        legacyCursorPostId = nextCursor.postId;
      } else {
        cursorToken = null;
        legacyCursorCreatedAt = null;
        legacyCursorPostId = null;
        hasMore = false;
      }
    } catch (err) {
      console.error(err);
      clearFeedSkeletons();
    } finally {
      isLoading = false;
      if (loader) LoadingUtils.toggle(loader, false);
    }
  }

  function renderFeed(posts) {
    if (!feedContainer) return;

    const existingPostIds = collectExistingPostIds();

    posts.forEach((post) => {
      const postId = normalizePostId(post?.postId);
      if (!postId || existingPostIds.has(postId)) {
        return;
      }

      existingPostIds.add(postId);
      const postEl = createPostElement(post);
      feedContainer.appendChild(postEl);
    });

    if (window.lucide) lucide.createIcons();
  }

  function normalizePostId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function collectExistingPostIds() {
    if (!feedContainer) {
      return new Set();
    }

    return new Set(
      Array.from(feedContainer.querySelectorAll("[data-post-id]"))
        .map((postEl) => normalizePostId(postEl.getAttribute("data-post-id")))
        .filter(Boolean),
    );
  }

  function normalizeAccountId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function isCurrentViewerAccount(accountId) {
    const targetId = normalizeAccountId(accountId);
    if (!targetId) return false;
    const currentId =
      normalizeAccountId(APP_CONFIG.CURRENT_USER_ID) ||
      normalizeAccountId(localStorage.getItem("accountId"));
    return !!currentId && targetId === currentId;
  }

  function buildProfileHash(profileTarget) {
    const safe = (profileTarget || "").toString().trim();
    if (window.RouteHelper?.buildProfileHash) {
      return window.RouteHelper.buildProfileHash(safe);
    }
    if (!safe) return "#/";
    return `#/${encodeURIComponent(safe)}`;
  }

  function createPostElement(post) {
      const postEl = document.createElement("div");
      postEl.className = "post";
      postEl.setAttribute("data-post-id", post.postId);
      postEl.dataset.currentUserTagged = Boolean(post.isCurrentUserTagged).toString();
      const isCurrentUserAuthor = isCurrentViewerAccount(post.author?.accountId);
      const storyRingClass = isCurrentUserAuthor
        ? ""
        : getStoryRingClass(post.author?.storyRingState);
      const storyAuthorDataAttr = storyRingClass
        ? ` data-story-author-id="${post.author.accountId}"`
        : "";
      const avatarUrl = post.author?.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
      const avatarMarkup = renderPostAvatarMarkup(avatarUrl);
      const authorProfileTarget =
        (post.author?.username || post.author?.accountId || "").toString().trim();
      const authorProfileHash = buildProfileHash(authorProfileTarget);
      const commentCount = Number.isFinite(Number(post.commentCount)) ? Number(post.commentCount) : 0;
      const ownerDisplayName = PostUtils.getPostOwnerDisplayName(post, true);
      const isAuthorRequested = Boolean(
        post.author?.isFollowRequestPendingByCurrentUser,
      );

      postEl.innerHTML = `
          <div class="post-header">
            <div class="post-user" data-account-id="${post.author.accountId}">
              <a href="${authorProfileHash}" class="post-avatar-ring ${storyRingClass}"${storyAuthorDataAttr}>
                  ${avatarMarkup}
              </a>
              <div class="user-meta">
                <div class="post-name-row">
                  <a href="${authorProfileHash}" style="text-decoration: none; color: inherit;">
                      <span class="post-username">${escapeAttr(ownerDisplayName)}</span>
                  </a>
                  <span class="post-tag-summary hidden"></span>
                </div>
                <div class="post-meta">
                  <span class="post-time"
                        title="${PostUtils.formatFullDateTime(post.createdAt)}"
                        onclick="openPostDetail('${post.postId}', '${post.postCode}')">${PostUtils.timeAgo(post.createdAt)}</span>
                  <span>•</span>
                  ${PostUtils.renderPrivacyBadge(post.privacy)}
                </div>
              </div>
            </div>
            <div class="post-actions">
            ${
              !post.isOwner && !post.author.isFollowedByCurrentUser
                ? isAuthorRequested
                  ? `<button class="follow-btn requested" onclick="FollowModule.showUnfollowConfirm('${post.author.accountId}', this)">
                    <i data-lucide="clock-3"></i>
                    <span data-i18n="common.buttons.requestSent">${feedT("common.buttons.requestSent", {}, "Request sent")}</span>
                   </button>`
                  : `<button class="follow-btn" onclick="FollowModule.followUser('${post.author.accountId}', this)">
                    <i data-lucide="user-plus"></i>
                    <span data-i18n="common.buttons.follow">${feedT("common.buttons.follow", {}, "Follow")}</span>
                   </button>`
                : ""
            }
            <button class="post-more" onclick="showPostOptions('${post.postId}', '${post.author.accountId}', ${post.isOwner}, ${post.author.isFollowedByCurrentUser}, ${Boolean(post.isSavedByCurrentUser)}, '${post.postCode || ""}', this.closest('.post')?.dataset.currentUserTagged === 'true')">
              <i data-lucide="more-horizontal"></i>
            </button>
            </div>
          </div>

          <div class="post-caption"></div>

          ${renderMedias(post.medias, post.postId, post.postCode)}

          <div class="post-actions">
            <div class="left">
              <div class="action-item react-btn"
        data-post-id="${post.postId}"
        data-reacted="${post.isReactedByCurrentUser}">

    <i data-lucide="heart"
       class="react-icon ${post.isReactedByCurrentUser ? "reacted" : ""} hover-scale-sm">
    </i>

    <span class="count hover-scale-text" onclick="event.stopPropagation(); window.InteractionModule?.openReactList('${post.postId}', 'post', '${post.reactCount}')">${post.reactCount}</span>
  </div>


              <div class="action-item" onclick="openPostDetail('${post.postId}', '${post.postCode}')" style="cursor: pointer;">
                <i data-lucide="message-circle" class="hover-scale-sm"></i>
                <span class="count hover-scale-text">${commentCount}</span>
              </div>
              <div class="action-item" onclick="event.stopPropagation(); if(window.openPostShareChatModal) window.openPostShareChatModal('${post.postId}', { postCode: '${post.postCode || ""}' });" style="cursor: pointer;">
                <i data-lucide="send" class="hover-scale-sm"></i>
              </div>
            </div>
            <div class="right action-item bookmark-btn"
                 data-save-toggle="true"
                 data-post-id="${post.postId}"
                 data-saved="${Boolean(post.isSavedByCurrentUser)}"
                 onclick="event.stopPropagation(); togglePostSave('${post.postId}', this)">
              <i data-lucide="bookmark" class="bookmark-icon hover-scale-sm ${post.isSavedByCurrentUser ? "saved" : ""}"></i>
            </div>
          </div>
        `;

      const mediaSlider = postEl.querySelector('.media-slider');
      if (mediaSlider) {
        const aspectRatio = getAspectRatioCSS(post.feedAspectRatio);
        mediaSlider.style.aspectRatio = aspectRatio;

        if (post.feedAspectRatio === 0) {
          mediaSlider.classList.add("fit-contain");
        }
      }

      initMediaSlider(postEl);
      setupMediaLoading(postEl);
      applyDominantColors(postEl);

      const captionEl = postEl.querySelector(".post-caption");
      PostUtils.setupCaption(captionEl, post.content || "");

      const tagSummaryEl = postEl.querySelector(".post-tag-summary");
      if (tagSummaryEl && window.PostUtils) {
        PostUtils.applyPostTagSummary(tagSummaryEl, post);
      }

      return postEl;
  }

  function getStoryRingClass(storyRingState) {
    const normalizedState = (storyRingState ?? "").toString().trim().toLowerCase();

    if (
      storyRingState === 2 ||
      normalizedState === "2" ||
      normalizedState === "unseen" ||
      normalizedState === "story-ring-unseen"
    ) {
      return "story-ring-unseen";
    }

    if (
      storyRingState === 1 ||
      normalizedState === "1" ||
      normalizedState === "seen" ||
      normalizedState === "story-ring-seen"
    ) {
      return "story-ring-seen";
    }

    return "";
  }

  function escapeAttr(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderPostAvatarMarkup(avatarUrl) {
    const safeAvatarUrl = escapeAttr(avatarUrl || APP_CONFIG.DEFAULT_AVATAR);
    return `<img class="post-avatar" src="${safeAvatarUrl}" alt="">`;
  }

  function prependPostToFeed(post) {
      if (!feedContainer) return;

      // Check if post already exists to avoid duplicates (e.g. from SignalR)
      const normalizedPostId = normalizePostId(post?.postId);
      if (!normalizedPostId || collectExistingPostIds().has(normalizedPostId)) {
          return;
      }

      const postEl = createPostElement(post);
      postEl.classList.add("post-new-fade-in"); // Add animation class
      feedContainer.prepend(postEl);

      if (window.lucide) lucide.createIcons();
  }

  function renderMedias(medias, postId, postCode) {
    if (!medias || medias.length === 0) return "";

    const previousMediaAria = escapeHtml(
      feedT("post.feed.previousMediaAria", {}, "Previous media"),
    );
    const nextMediaAria = escapeHtml(
      feedT("post.feed.nextMediaAria", {}, "Next media"),
    );

    return `
      <div class="post-media">
        <div class="media-slider">
          <div class="media-track" onclick="openPostDetail('${postId}', '${postCode || ''}')" style="cursor: pointer;">
            ${medias
              .map((m) => {
                if (m.type === 1) {
                  return `<div class="media-item skeleton"><video class="img-loaded" src="${m.mediaUrl}" controls></video></div>`;
                } else {
                  return `<div class="media-item skeleton"><img class="img-loaded" src="${m.mediaUrl}" /></div>`;
                }
              })
              .join("")}
          </div>
          <button class="nav prev" aria-label="${previousMediaAria}">
            <i data-lucide="chevron-left"></i>
          </button>
          <button class="nav next" aria-label="${nextMediaAria}">
            <i data-lucide="chevron-right"></i>
          </button>
        </div>
        <div class="media-dots"></div>
      </div>
    `;
  }

  function getAspectRatioCSS(feedAspectRatio) {
    switch (feedAspectRatio) {
      case 0: return "1 / 1";
      case 1: return "1 / 1";
      case 2: return "4 / 5";
      case 3: return "16 / 9";
      default: return "1 / 1";
    }
  }

  function setupMediaLoading(postEl) {
    const mediaItems = postEl.querySelectorAll(".media-item");
    mediaItems.forEach((item) => {
      const media = item.querySelector("img, video");
      if (!media) return;

      const onLoaded = () => {
        item.classList.remove("skeleton");
        media.classList.add("show");
      };

      if (media.tagName === "IMG") {
        if (media.complete) onLoaded();
        else media.onload = onLoaded;
      } else if (media.tagName === "VIDEO") {
        if (media.readyState >= 2) onLoaded();
        else media.onloadeddata = onLoaded;
      }
    });
  }

  function applyDominantColors(postEl) {
    const images = postEl.querySelectorAll(".media-track img");
    images.forEach(async (img) => {
      try {
        if (!window.extractDominantColor) return;
        const color = await extractDominantColor(img.src);
        img.style.background = `linear-gradient(135deg, ${color}, var(--img-gradient-base))`;
        const track = img.closest('.media-track');
        if (track) track.style.background = `linear-gradient(135deg, ${color}, var(--img-gradient-base))`;
      } catch (e) {
        console.error("❌ Failed to extract color:", e);
      }
    });
  }

  function initMediaSlider(postEl) {
    const slider = postEl.querySelector(".media-slider");
    const track = postEl.querySelector(".media-track");
    if (!slider || !track) return;

    const medias = track.querySelectorAll("img, video");
    const prev = postEl.querySelector(".prev");
    const next = postEl.querySelector(".next");
    const dotsContainer = postEl.querySelector(".media-dots");

    let index = 0;
    const total = medias.length;

    if (total <= 1) {
      if (prev) prev.style.display = "none";
      if (next) next.style.display = "none";
      return;
    }

    medias.forEach((_, i) => {
      const dot = document.createElement("span");
      if (i === 0) dot.classList.add("active");
      dot.addEventListener("click", () => {
        index = i;
        update();
      });
      dotsContainer.appendChild(dot);
    });

    const dots = dotsContainer.querySelectorAll("span");
    const mobileSwipeQuery = window.matchMedia("(max-width: 768px)");

    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let isDragging = false;
    let suppressTrackClick = false;

    function isSwipeEnabled() {
      if (window.CloudMResponsive?.isMobileLayout) {
        return window.CloudMResponsive.isMobileLayout();
      }

      return mobileSwipeQuery.matches;
    }

    function update() {
      track.style.transition = "";
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((d) => d.classList.remove("active"));
      dots[index].classList.add("active");
      medias.forEach((media, i) => {
        if (media.tagName === "VIDEO" && i !== index) media.pause();
      });
    }

    if (prev) prev.onclick = () => { index = (index - 1 + total) % total; update(); };
    if (next) next.onclick = () => { index = (index + 1) % total; update(); };

    track.addEventListener(
      "click",
      (event) => {
        if (!suppressTrackClick) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        suppressTrackClick = false;
      },
      true,
    );

    slider.addEventListener("pointerdown", (event) => {
      if (!isSwipeEnabled()) return;
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest(".nav, .media-dots, video")) return;

      activePointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      deltaX = 0;
      isDragging = false;
      suppressTrackClick = false;
    });

    slider.addEventListener("pointermove", (event) => {
      if (event.pointerId !== activePointerId) return;

      deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (!isDragging) {
        if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          activePointerId = null;
          return;
        }

        isDragging = true;
        track.style.transition = "none";
      }

      const sliderWidth = slider.clientWidth || 1;
      const minTranslate = -((total - 1) * sliderWidth);
      const baseTranslate = -(index * sliderWidth);
      let nextTranslate = baseTranslate + deltaX;

      if (nextTranslate > 0) {
        nextTranslate *= 0.35;
      } else if (nextTranslate < minTranslate) {
        nextTranslate =
          minTranslate + (nextTranslate - minTranslate) * 0.35;
      }

      track.style.transform = `translate3d(${nextTranslate}px, 0, 0)`;
      suppressTrackClick = true;
      event.preventDefault();
    });

    function finishPointerDrag(event) {
      if (event.pointerId !== activePointerId) return;

      const wasDragging = isDragging;
      const finalDeltaX = deltaX;
      activePointerId = null;
      deltaX = 0;
      isDragging = false;

      if (!wasDragging) return;

      const sliderWidth = slider.clientWidth || 1;
      const swipeThreshold = Math.min(96, sliderWidth * 0.18);

      if (finalDeltaX <= -swipeThreshold && index < total - 1) {
        index += 1;
      } else if (finalDeltaX >= swipeThreshold && index > 0) {
        index -= 1;
      }

      update();

      window.setTimeout(() => {
        suppressTrackClick = false;
      }, 220);
    }

    slider.addEventListener("pointerup", finishPointerDrag);
    slider.addEventListener("pointercancel", finishPointerDrag);
  }

  // Scroll listener
  let scrollTimeout;
  const handleFeedScroll = () => {
    // Check if feed is still in DOM
    const currentFeed = document.getElementById("feed");
    if (!currentFeed || !document.body.contains(currentFeed)) return;

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const mc = document.querySelector('.main-content');
      if (!mc) return;
      const nearBottom = mc.scrollTop + mc.clientHeight >= mc.scrollHeight - 200;
      if (nearBottom && !isLoading && hasMore) {
        loadFeed();
      }
    }, 100);
  };

  const mc = document.querySelector('.main-content');
  if (mc) mc.addEventListener("scroll", handleFeedScroll);

  // Expose initFeed
  window.initFeed = initFeed;
  window.prependPostToFeed = prependPostToFeed;

  // React listener
  document.addEventListener("click", async (e) => {
    const reactBtn = e.target.closest(".react-btn");
    if (!reactBtn) return;
    const clickedIcon = e.target.closest(".react-icon");
    const clickedCount = e.target.closest(".count");
    if (!clickedIcon && !clickedCount) return;

    if (clickedCount) {
      const postId = reactBtn.dataset.postId;
      const count = clickedCount.textContent;
      if (window.InteractionModule) window.InteractionModule.openReactList(postId, 'post', count);
      return;
    }

    const postId = reactBtn.dataset.postId;
    const icon = reactBtn.querySelector(".react-icon");
    const countEl = reactBtn.querySelector(".count");
    const wasReacted = reactBtn.dataset.reacted === "true";
    const oldCount = parseInt(countEl.textContent, 10);

    reactBtn.dataset.reacted = (!wasReacted).toString();
    if (!wasReacted) {
      icon.classList.add("reacted");
      icon.classList.remove("unreacting");
      countEl.textContent = oldCount + 1;
    } else {
      icon.classList.remove("reacted");
      icon.classList.add("unreacting");
      icon.addEventListener("animationend", () => icon.classList.remove("unreacting"), { once: true });
      countEl.textContent = oldCount - 1;
    }

    try {
      const res = await API.Posts.toggleReact(postId);
      if (res.status === 403 || res.status === 400) {
        if (window.toastInfo)
          toastInfo(feedT("post.options.postUnavailable"));
        PostUtils.hidePost(postId);
        return;
      }
      if (!res.ok) throw new Error("React failed");
      const data = await res.json();
      reactBtn.dataset.reacted = data.isReactedByCurrentUser.toString();
      icon.classList.toggle("reacted", data.isReactedByCurrentUser);
      countEl.textContent = data.reactCount;
    } catch (err) {
      console.error(err);
      reactBtn.dataset.reacted = wasReacted.toString();
      icon.classList.toggle("reacted", wasReacted);
      countEl.textContent = oldCount;
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (window.initProfilePreview) initProfilePreview();
  });

})();
