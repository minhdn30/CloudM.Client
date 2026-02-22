const createStoryModalState = {
  isInitialized: false,
  isSubmitting: false,
  contentType: 0, // 0=image, 1=video, 2=text
  selectedFile: null,
  previewObjectUrl: null,
  documentEventsBound: false,
};

function csGetElements() {
  return {
    modal: document.getElementById("createStoryModal"),
    submitBtn: document.getElementById("createStorySubmitBtn"),
    closeBtn: document.querySelector("#createStoryModal .create-story-close-btn"),
    cancelBtn: document.querySelector("#createStoryModal .create-story-cancel-btn"),
    typeButtons: Array.from(
      document.querySelectorAll("#createStoryModal .create-story-type-btn"),
    ),
    mediaSection: document.getElementById("createStoryMediaSection"),
    textSection: document.getElementById("createStoryTextSection"),
    thumbnailSection: document.getElementById("createStoryThumbnailSection"),
    mediaInput: document.getElementById("createStoryMediaInput"),
    selectFileBtn: document.getElementById("createStorySelectFileBtn"),
    fileName: document.getElementById("createStoryFileName"),
    textInput: document.getElementById("createStoryTextInput"),
    textCount: document.getElementById("createStoryTextCount"),
    privacySelect: document.getElementById("createStoryPrivacy"),
    expiresSelect: document.getElementById("createStoryExpires"),
    thumbnailInput: document.getElementById("createStoryThumbnailUrl"),
    previewEmpty: document.getElementById("createStoryPreviewEmpty"),
    imagePreview: document.getElementById("createStoryImagePreview"),
    videoPreview: document.getElementById("createStoryVideoPreview"),
    textPreview: document.getElementById("createStoryTextPreview"),
  };
}

function csReleasePreviewObjectUrl() {
  if (createStoryModalState.previewObjectUrl) {
    URL.revokeObjectURL(createStoryModalState.previewObjectUrl);
    createStoryModalState.previewObjectUrl = null;
  }
}

function csReadSelectedFileName(file) {
  if (!file || !file.name) return "No file selected";
  const maxLength = 34;
  if (file.name.length <= maxLength) return file.name;
  return `${file.name.slice(0, maxLength - 3)}...`;
}

function csApplyContentTypeUI() {
  const {
    typeButtons,
    mediaSection,
    textSection,
    thumbnailSection,
    mediaInput,
    fileName,
  } = csGetElements();

  typeButtons.forEach((button) => {
    const value = Number(button.dataset.storyType);
    button.classList.toggle("active", value === createStoryModalState.contentType);
  });

  const isTextStory = createStoryModalState.contentType === 2;
  if (mediaSection) {
    mediaSection.classList.toggle("create-story-hidden", isTextStory);
  }
  if (thumbnailSection) {
    thumbnailSection.classList.toggle("create-story-hidden", isTextStory);
  }
  if (textSection) {
    textSection.classList.toggle("create-story-hidden", !isTextStory);
  }

  if (mediaInput) {
    mediaInput.accept =
      createStoryModalState.contentType === 1 ? "video/*" : "image/*";
  }

  if (isTextStory) {
    createStoryModalState.selectedFile = null;
    csReleasePreviewObjectUrl();
    if (mediaInput) {
      mediaInput.value = "";
    }
    if (fileName) {
      fileName.textContent = "No file selected";
    }
  } else if (createStoryModalState.selectedFile) {
    const shouldClearSelectedFile =
      (createStoryModalState.contentType === 0 &&
        !createStoryModalState.selectedFile.type.startsWith("image/")) ||
      (createStoryModalState.contentType === 1 &&
        !createStoryModalState.selectedFile.type.startsWith("video/"));

    if (shouldClearSelectedFile) {
      createStoryModalState.selectedFile = null;
      csReleasePreviewObjectUrl();
      if (mediaInput) {
        mediaInput.value = "";
      }
      if (fileName) {
        fileName.textContent = "No file selected";
      }
    }
  }

  csRenderPreview();
  csUpdateSubmitState();
}

function csRenderPreview() {
  const { previewEmpty, imagePreview, videoPreview, textPreview, textInput } =
    csGetElements();

  if (!previewEmpty || !imagePreview || !videoPreview || !textPreview) return;

  previewEmpty.style.display = "none";
  imagePreview.style.display = "none";
  videoPreview.style.display = "none";
  textPreview.style.display = "none";

  if (createStoryModalState.contentType === 2) {
    const text = (textInput?.value || "").trim();
    if (!text) {
      previewEmpty.style.display = "flex";
      return;
    }

    textPreview.textContent = text;
    textPreview.style.display = "flex";
    return;
  }

  if (!createStoryModalState.selectedFile || !createStoryModalState.previewObjectUrl) {
    previewEmpty.style.display = "flex";
    return;
  }

  if (createStoryModalState.contentType === 1) {
    videoPreview.src = createStoryModalState.previewObjectUrl;
    videoPreview.style.display = "block";
    return;
  }

  imagePreview.src = createStoryModalState.previewObjectUrl;
  imagePreview.style.display = "block";
}

function csSetTextCount() {
  const { textInput, textCount } = csGetElements();
  if (!textInput || !textCount) return;
  textCount.textContent = String((textInput.value || "").length);
}

function csValidateBeforeSubmit(showToast = false) {
  const { textInput } = csGetElements();
  if (createStoryModalState.contentType === 2) {
    const text = (textInput?.value || "").trim();
    if (!text) {
      if (showToast && window.toastError) {
        toastError("Text content is required for text story.");
      }
      return false;
    }
    return true;
  }

  if (!createStoryModalState.selectedFile) {
    if (showToast && window.toastError) {
      toastError("Please select a media file first.");
    }
    return false;
  }

  return true;
}

function csUpdateSubmitState() {
  const { submitBtn } = csGetElements();
  if (!submitBtn) return;

  if (createStoryModalState.isSubmitting) {
    submitBtn.disabled = true;
    return;
  }

  submitBtn.disabled = !csValidateBeforeSubmit(false);
}

function csSetSubmitting(isSubmitting) {
  const {
    submitBtn,
    typeButtons,
    selectFileBtn,
    mediaInput,
    textInput,
    privacySelect,
    expiresSelect,
    thumbnailInput,
    closeBtn,
    cancelBtn,
  } = csGetElements();

  createStoryModalState.isSubmitting = isSubmitting;

  const controlsToToggle = [
    ...typeButtons,
    selectFileBtn,
    mediaInput,
    textInput,
    privacySelect,
    expiresSelect,
    thumbnailInput,
    closeBtn,
    cancelBtn,
  ];

  controlsToToggle.forEach((control) => {
    if (!control) return;
    control.disabled = isSubmitting;
  });

  if (submitBtn) {
    const defaultText = submitBtn.dataset.defaultText || submitBtn.textContent || "Share Story";
    submitBtn.dataset.defaultText = defaultText;
    submitBtn.textContent = isSubmitting ? "Sharing..." : defaultText;

    if (window.LoadingUtils?.setButtonLoading) {
      window.LoadingUtils.setButtonLoading(submitBtn, isSubmitting);
    } else {
      submitBtn.disabled = isSubmitting;
    }
  }

  if (!isSubmitting) {
    csUpdateSubmitState();
  }
}

function csResetForm() {
  const {
    mediaInput,
    fileName,
    textInput,
    textCount,
    privacySelect,
    expiresSelect,
    thumbnailInput,
    imagePreview,
    videoPreview,
    textPreview,
  } = csGetElements();

  createStoryModalState.contentType = 0;
  createStoryModalState.selectedFile = null;
  createStoryModalState.isSubmitting = false;
  csReleasePreviewObjectUrl();

  if (mediaInput) {
    mediaInput.value = "";
    mediaInput.accept = "image/*";
  }
  if (fileName) {
    fileName.textContent = "No file selected";
  }
  if (textInput) {
    textInput.value = "";
  }
  if (textCount) {
    textCount.textContent = "0";
  }
  if (privacySelect) {
    privacySelect.value = "0";
  }
  if (expiresSelect) {
    expiresSelect.value = "24";
  }
  if (thumbnailInput) {
    thumbnailInput.value = "";
  }
  if (imagePreview) {
    imagePreview.src = "";
  }
  if (videoPreview) {
    videoPreview.pause();
    videoPreview.removeAttribute("src");
    videoPreview.load();
  }
  if (textPreview) {
    textPreview.textContent = "";
  }

  csApplyContentTypeUI();
}

async function csReadErrorMessage(res, fallback = "Failed to create story.") {
  let message = fallback;

  try {
    const data = await res.json();
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message.trim();
    }
    if (typeof data?.title === "string" && data.title.trim()) {
      return data.title.trim();
    }

    if (data?.errors && typeof data.errors === "object") {
      const firstKey = Object.keys(data.errors)[0];
      const firstValue = firstKey ? data.errors[firstKey] : null;
      if (Array.isArray(firstValue) && firstValue.length > 0) {
        return String(firstValue[0]);
      }
    }
  } catch (_) {}

  try {
    const text = await res.text();
    if (typeof text === "string" && text.trim()) {
      message = text.trim();
    }
  } catch (_) {}

  return message;
}

function csHandleMediaChange(event) {
  const { mediaInput, fileName } = csGetElements();
  const file = event?.target?.files?.[0] || null;

  if (!file) {
    createStoryModalState.selectedFile = null;
    csReleasePreviewObjectUrl();
    if (fileName) {
      fileName.textContent = "No file selected";
    }
    csRenderPreview();
    csUpdateSubmitState();
    return;
  }

  const maxSizeMb = window.APP_CONFIG?.MAX_UPLOAD_SIZE_MB || 5;
  const maxBytes = maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    if (window.toastError) {
      toastError(`File is too large. Maximum size is ${maxSizeMb}MB.`);
    }
    if (mediaInput) {
      mediaInput.value = "";
    }
    return;
  }

  const isImageStory = createStoryModalState.contentType === 0;
  const isVideoStory = createStoryModalState.contentType === 1;
  if (isImageStory && !file.type.startsWith("image/")) {
    if (window.toastError) {
      toastError("Please select an image file for image story.");
    }
    if (mediaInput) {
      mediaInput.value = "";
    }
    return;
  }
  if (isVideoStory && !file.type.startsWith("video/")) {
    if (window.toastError) {
      toastError("Please select a video file for video story.");
    }
    if (mediaInput) {
      mediaInput.value = "";
    }
    return;
  }

  createStoryModalState.selectedFile = file;
  csReleasePreviewObjectUrl();
  createStoryModalState.previewObjectUrl = URL.createObjectURL(file);
  if (fileName) {
    fileName.textContent = csReadSelectedFileName(file);
  }

  csRenderPreview();
  csUpdateSubmitState();
}

function csBindEvents() {
  if (createStoryModalState.isInitialized) return;

  const { selectFileBtn, mediaInput, textInput } = csGetElements();
  if (!selectFileBtn || !mediaInput || !textInput) return;

  selectFileBtn.addEventListener("click", () => {
    if (createStoryModalState.isSubmitting) return;
    mediaInput.click();
  });

  mediaInput.addEventListener("change", csHandleMediaChange);

  textInput.addEventListener("input", () => {
    csSetTextCount();
    csRenderPreview();
    csUpdateSubmitState();
  });

  createStoryModalState.isInitialized = true;
}

function csBindDocumentEvents() {
  if (createStoryModalState.documentEventsBound) return;

  document.addEventListener("click", (event) => {
    const { modal } = csGetElements();
    if (!modal || !modal.classList.contains("show")) return;
    if (event.target === modal) {
      closeCreateStoryModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const { modal } = csGetElements();
    if (!modal || !modal.classList.contains("show")) return;
    closeCreateStoryModal();
  });

  createStoryModalState.documentEventsBound = true;
}

window.setCreateStoryContentType = function (nextType) {
  const parsed = Number(nextType);
  if (![0, 1, 2].includes(parsed)) return;
  if (createStoryModalState.isSubmitting) return;

  createStoryModalState.contentType = parsed;
  csApplyContentTypeUI();
  if (window.lucide) {
    lucide.createIcons();
  }
};

window.openCreateStoryModal = function () {
  const { modal } = csGetElements();
  if (!modal) return;

  csBindEvents();
  csBindDocumentEvents();
  csResetForm();

  modal.classList.add("show");
  if (window.lockScroll) {
    window.lockScroll();
  }

  if (window.lucide) {
    lucide.createIcons();
  }
};

window.closeCreateStoryModal = function (forceClose = false) {
  if (createStoryModalState.isSubmitting && !forceClose) return;

  const { modal } = csGetElements();
  if (!modal) return;

  modal.classList.remove("show");
  if (window.unlockScroll) {
    window.unlockScroll();
  }

  csResetForm();
};

window.submitCreateStory = async function () {
  if (createStoryModalState.isSubmitting) return;

  if (!window.API?.Stories?.create) {
    if (window.toastError) {
      toastError("Story API is unavailable.");
    }
    return;
  }

  if (!csValidateBeforeSubmit(true)) return;

  const { textInput, privacySelect, expiresSelect, thumbnailInput } = csGetElements();

  const formData = new FormData();
  formData.append("ContentType", String(createStoryModalState.contentType));

  const privacy = Number.parseInt(privacySelect?.value || "0", 10);
  formData.append("Privacy", String(Number.isNaN(privacy) ? 0 : privacy));

  const expiresRaw = Number.parseInt(expiresSelect?.value || "24", 10);
  const expires = [6, 12, 24].includes(expiresRaw) ? expiresRaw : 24;
  formData.append("ExpiresEnum", String(expires));

  if (createStoryModalState.contentType === 2) {
    formData.append("TextContent", (textInput?.value || "").trim());
  } else if (createStoryModalState.selectedFile) {
    formData.append(
      "MediaFile",
      createStoryModalState.selectedFile,
      createStoryModalState.selectedFile.name,
    );

    const thumbnail = (thumbnailInput?.value || "").trim();
    if (thumbnail) {
      formData.append("ThumbnailUrl", thumbnail);
    }
  }

  csSetSubmitting(true);
  if (typeof window.showGlobalLoader === "function") {
    window.showGlobalLoader();
  }

  try {
    const res = await window.API.Stories.create(formData);
    if (!res.ok) {
      const message = await csReadErrorMessage(res, "Failed to create story.");
      if (window.toastError) {
        toastError(message);
      }
      return;
    }

    const story = await res.json().catch(() => null);
    if (window.toastSuccess) {
      toastSuccess("Story created successfully.");
    }

    window.closeCreateStoryModal(true);
    window.dispatchEvent(new CustomEvent("story:created", { detail: story }));
  } catch (error) {
    console.error("submitCreateStory failed:", error);
    if (window.toastError) {
      toastError("Could not connect to server.");
    }
  } finally {
    if (typeof window.hideGlobalLoader === "function") {
      window.hideGlobalLoader();
    }
    csSetSubmitting(false);
  }
};
