// ================= CREATE POST MODAL =================

// Load user info for create post modal
function loadCreatePostUserInfo() {
  const avatarUrl = localStorage.getItem("avatarUrl");
  const fullname = localStorage.getItem("fullname");

  const avatarElement = document.getElementById("post-user-avatar");
  const nameElement = document.getElementById("post-user-name");

  if (avatarElement) {
    if (!avatarUrl || avatarUrl === "null" || avatarUrl.trim() === "") {
      avatarElement.src = APP_CONFIG.DEFAULT_AVATAR;
    } else {
      avatarElement.src = avatarUrl;
    }
  }

  if (nameElement) {
    nameElement.textContent =
      fullname && fullname.trim() !== "" ? fullname : "User";
  }
}

// Open create post modal
function openCreatePostModal() {
  const modal = document.getElementById("createPostModal");
  if (!modal) return;

  modal.classList.add("show");
  document.body.style.overflow = "hidden"; // Prevent body scroll

  // Load user info
  loadCreatePostUserInfo();

  // Recreate lucide icons
  lucide.createIcons();

  // Focus on caption input
  setTimeout(() => {
    const captionInput = document.getElementById("postCaption");
    if (captionInput) captionInput.focus();
  }, 300);
}

// Close create post modal
function closeCreatePostModal() {
  const modal = document.getElementById("createPostModal");
  if (!modal) return;

  modal.classList.remove("show");
  document.body.style.overflow = ""; // Restore body scroll

  // Reset form
  resetPostForm();
}

// Reset post form
function resetPostForm() {
  const captionInput = document.getElementById("postCaption");
  const imagePreview = document.getElementById("postImagePreview");
  const imageInput = document.getElementById("postImageInput");
  const charCount = document.getElementById("charCount");

  if (captionInput) captionInput.value = "";
  if (imagePreview) imagePreview.src = "";
  if (imageInput) imageInput.value = "";
  if (charCount) charCount.textContent = "0";

  // Close all expanded sections
  const sections = ["location", "collaborators", "advanced"];
  sections.forEach((section) => {
    const content = document.getElementById(`${section}Content`);
    if (content) content.style.display = "none";
  });
}

// Handle image upload
function triggerImageUpload() {
  const imageInput = document.getElementById("postImageInput");
  if (imageInput) imageInput.click();
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate file type
  if (!file.type.startsWith("image/")) {
    alert("Vui lòng chọn file hình ảnh!");
    return;
  }

  // Validate file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    alert("Kích thước file không được vượt quá 10MB!");
    return;
  }

  // Preview image
  const reader = new FileReader();
  reader.onload = function (e) {
    const imagePreview = document.getElementById("postImagePreview");
    if (imagePreview) {
      imagePreview.src = e.target.result;
    }
  };
  reader.readAsDataURL(file);
}

// Update character count
function updateCharCount() {
  const captionInput = document.getElementById("postCaption");
  const charCount = document.getElementById("charCount");

  if (captionInput && charCount) {
    const count = captionInput.value.length;
    charCount.textContent = count;

    // Change color if near limit
    if (count > 2000) {
      charCount.style.color = "var(--danger-alt)";
    } else {
      charCount.style.color = "var(--text-disabled)";
    }
  }
}

// Toggle section
function toggleSection(sectionName) {
  const content = document.getElementById(`${sectionName}Content`);
  const header = event.currentTarget;

  if (!content) return;

  if (content.style.display === "none" || content.style.display === "") {
    content.style.display = "block";
    if (header) header.classList.add("expanded");
  } else {
    content.style.display = "none";
    if (header) header.classList.remove("expanded");
  }
}

// Toggle emoji picker (placeholder)
function toggleEmojiPicker() {
  console.log("Toggle emoji picker");
  // TODO: Implement emoji picker
  alert("Tính năng emoji đang được phát triển!");
}

// Submit post
function submitPost() {
  const captionInput = document.getElementById("postCaption");
  const imagePreview = document.getElementById("postImagePreview");

  // Validate
  if (!imagePreview || !imagePreview.src) {
    alert("Vui lòng chọn hình ảnh!");
    return;
  }

  const caption = captionInput ? captionInput.value.trim() : "";

  // TODO: Implement actual post submission
  console.log("Submitting post:", {
    caption: caption,
    image: imagePreview.src,
  });

  // Show success message
  alert("Đã chia sẻ bài viết thành công!");

  // Close modal
  closeCreatePostModal();
}

// Close modal when clicking overlay
document.addEventListener("click", (e) => {
  const modal = document.getElementById("createPostModal");
  if (e.target === modal) {
    closeCreatePostModal();
  }
});

// Close modal with ESC key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modal = document.getElementById("createPostModal");
    if (modal && modal.classList.contains("show")) {
      closeCreatePostModal();
    }
  }
});

// Toggle platform sharing
document.addEventListener("click", (e) => {
  if (e.target.closest(".toggle-switch") && e.target.closest(".setting-item")) {
    const toggle = e.target.closest(".toggle-switch");
    toggle.classList.toggle("active");
  }
});
