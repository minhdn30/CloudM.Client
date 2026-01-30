let currentPostOptions = null;

/* ===== Show post options popup ===== */
function showPostOptions(postId, accountId, isOwnPost, isFollowing) {
  if (currentPostOptions) closePostOptions();

  const overlay = document.createElement("div");
  overlay.className = "post-options-overlay";
  overlay.id = "postOptionsOverlay";

  const popup = document.createElement("div");
  popup.className = "post-options-popup";

  let optionsHTML = "";

  if (isOwnPost) {
    optionsHTML = `
      <button class="post-option post-option-danger" onclick="deletePost('${postId}')">
        <i data-lucide="trash-2"></i><span>Delete</span>
      </button>
      <button class="post-option" onclick="editPost('${postId}')">
        <i data-lucide="edit"></i><span>Edit</span>
      </button>
      <button class="post-option" onclick="hidePostLikes('${postId}')">
        <i data-lucide="eye-off"></i><span>Hide like count</span>
      </button>
      <button class="post-option" onclick="turnOffCommenting('${postId}')">
        <i data-lucide="message-square-off"></i><span>Turn off commenting</span>
      </button>
    `;
  } else {
    const followOption = isFollowing
      ? `
        <button class="post-option" onclick="unfollowFromPost('${accountId}')">
          <i data-lucide="user-minus"></i><span>Unfollow</span>
        </button>
      `
      : `
        <button class="post-option" onclick="followFromPost('${accountId}')">
          <i data-lucide="user-plus"></i><span>Follow</span>
        </button>
      `;

    optionsHTML = `
      <button class="post-option post-option-danger" onclick="reportPost('${postId}')">
        <i data-lucide="flag"></i><span>Report</span>
      </button>
      ${followOption}
      <button class="post-option" onclick="hidePost('${postId}')">
        <i data-lucide="eye-off"></i><span>Hide</span>
      </button>
      <button class="post-option" onclick="addToFavorites('${postId}')">
        <i data-lucide="bookmark"></i><span>Add to favorites</span>
      </button>
      <button class="post-option" onclick="copyPostLink('${postId}')">
        <i data-lucide="link"></i><span>Copy link</span>
      </button>
      <button class="post-option" onclick="shareToStory('${postId}')">
        <i data-lucide="send"></i><span>Share to story</span>
      </button>
      <button class="post-option" onclick="aboutThisAccount('${accountId}')">
        <i data-lucide="info"></i><span>About this account</span>
      </button>
    `;
  }

  optionsHTML += `
    <button class="post-option post-option-cancel" onclick="closePostOptions()">
      Cancel
    </button>
  `;

  popup.innerHTML = optionsHTML;
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  currentPostOptions = overlay;

  if (window.lucide) lucide.createIcons();

  requestAnimationFrame(() => overlay.classList.add("show"));

  overlay.onclick = (e) => {
    if (e.target === overlay) closePostOptions();
  };
}

/* ===== Close popup ===== */
function closePostOptions() {
  if (!currentPostOptions) return;

  currentPostOptions.classList.remove("show");
  setTimeout(() => {
    currentPostOptions?.remove();
    currentPostOptions = null;
  }, 200);
}

/* ===== Own post actions ===== */
function deletePost(postId) {
  closePostOptions();
  console.log("Delete post:", postId);
  toastError("Post deleted (demo)");
}

function editPost(postId) {
  closePostOptions();
  console.log("Edit post:", postId);
  toastInfo("Edit post (todo)");
}

function hidePostLikes(postId) {
  closePostOptions();
  console.log("Hide likes:", postId);
  toastInfo("Like count hidden");
}

function turnOffCommenting(postId) {
  closePostOptions();
  console.log("Turn off commenting:", postId);
  toastInfo("Commenting turned off");
}

/* ===== Other post actions ===== */
function reportPost(postId) {
  closePostOptions();

  const overlay = document.createElement("div");
  overlay.className = "post-options-overlay";

  const popup = document.createElement("div");
  popup.className = "post-options-popup";

  popup.innerHTML = `
    <div class="post-options-header">
      <h3>Report</h3>
      <p>Why are you reporting this post?</p>
    </div>
    <button class="post-option" onclick="submitReport('${postId}', 'spam')">It's spam</button>
    <button class="post-option" onclick="submitReport('${postId}', 'inappropriate')">Nudity or sexual activity</button>
    <button class="post-option" onclick="submitReport('${postId}', 'hate')">Hate speech or symbols</button>
    <button class="post-option" onclick="submitReport('${postId}', 'violence')">Violence or dangerous organizations</button>
    <button class="post-option" onclick="submitReport('${postId}', 'false')">False information</button>
    <button class="post-option" onclick="submitReport('${postId}', 'scam')">Scam or fraud</button>
    <button class="post-option post-option-cancel" onclick="this.closest('.post-options-overlay').remove()">Cancel</button>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add("show"));

  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
}

function submitReport(postId, reason) {
  console.log("Report:", postId, reason);
  document.querySelector(".post-options-overlay")?.remove();
  toastSuccess("Thanks for reporting. We'll review this post.");
}

function followFromPost(accountId) {
  closePostOptions();
  console.log("Follow:", accountId);
  toastSuccess("Following");
}

function unfollowFromPost(accountId) {
  closePostOptions();
  console.log("Unfollow:", accountId);
  toastInfo("Unfollowed");
}

function hidePost(postId) {
  closePostOptions();
  console.log("Hide post:", postId);
  toastInfo("Post hidden");
}

function addToFavorites(postId) {
  closePostOptions();
  console.log("Favorite:", postId);
  toastSuccess("Added to favorites");
}

function copyPostLink(postId) {
  closePostOptions();
  const link = `${location.origin}/post/${postId}`;

  navigator.clipboard
    .writeText(link)
    .then(() => toastSuccess("Link copied"))
    .catch(() => toastError("Failed to copy link"));
}

function shareToStory(postId) {
  closePostOptions();
  console.log("Share to story:", postId);
  toastInfo("Share to story (todo)");
}

function aboutThisAccount(accountId) {
  closePostOptions();
  console.log("About account:", accountId);
  toastInfo("About this account (todo)");
}

/* ===== Export ===== */
window.showPostOptions = showPostOptions;
window.closePostOptions = closePostOptions;
