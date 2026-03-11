(function (global) {
  const BLOCKED_USERS_SUBPAGE = "blocked-users";

  function t(key, params = {}, fallback = "") {
    return global.I18n?.t ? global.I18n.t(key, params, fallback || key) : fallback || key;
  }

  function normalizeId(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function getDefaultAvatar() {
    return (global.APP_CONFIG?.DEFAULT_AVATAR || "").toString().trim();
  }

  function getMaskedUserLabel() {
    return t("common.labels.user", {}, "User");
  }

  function isBlockedMaskApplied(entity = {}) {
    return !!(entity?.isBlockedMaskApplied ?? entity?.IsBlockedMaskApplied ?? false);
  }

  function getAvatarUrl(entity = {}) {
    if (isBlockedMaskApplied(entity)) {
      return getDefaultAvatar();
    }

    const avatarUrl = (
      entity?.avatarUrl ??
      entity?.AvatarUrl ??
      entity?.displayAvatar ??
      entity?.DisplayAvatar ??
      entity?.avatar ??
      ""
    )
      .toString()
      .trim();
    return avatarUrl || getDefaultAvatar();
  }

  function getDisplayName(entity = {}, fallback = "") {
    if (isBlockedMaskApplied(entity)) {
      return getMaskedUserLabel();
    }

    const value =
      entity?.nickname ??
      entity?.Nickname ??
      entity?.displayName ??
      entity?.DisplayName ??
      entity?.username ??
      entity?.userName ??
      entity?.Username ??
      entity?.UserName ??
      entity?.fullName ??
      entity?.FullName ??
      fallback;

    return (value || "").toString().trim() || fallback || getMaskedUserLabel();
  }

  function getUsername(entity = {}, fallback = "") {
    if (isBlockedMaskApplied(entity)) {
      return getMaskedUserLabel();
    }

    const value =
      entity?.username ??
      entity?.userName ??
      entity?.Username ??
      entity?.UserName ??
      fallback;

    return (value || "").toString().trim() || fallback || "";
  }

  function getFullName(entity = {}, fallback = "") {
    if (isBlockedMaskApplied(entity)) {
      return getMaskedUserLabel();
    }

    const value =
      entity?.fullName ??
      entity?.FullName ??
      entity?.displayName ??
      entity?.DisplayName ??
      fallback;

    return (value || "").toString().trim() || fallback || getMaskedUserLabel();
  }

  function buildBlockedUsersHash() {
    if (global.RouteHelper?.buildAccountSettingsSubHash) {
      return global.RouteHelper.buildAccountSettingsSubHash("", BLOCKED_USERS_SUBPAGE);
    }

    const username = (localStorage.getItem("username") || "").toString().trim();
    if (username) {
      return `#/${encodeURIComponent(username)}/settings/${BLOCKED_USERS_SUBPAGE}`;
    }

    return "#/account-settings/blocked-users";
  }

  function openBlockedUsersPage() {
    global.location.hash = buildBlockedUsersHash();
  }

  function normalizeStatus(raw = {}, targetId = "") {
    return {
      targetId:
        (raw?.targetId ?? raw?.TargetId ?? targetId ?? "").toString().trim(),
      isBlockedByCurrentUser: !!(
        raw?.isBlockedByCurrentUser ??
        raw?.IsBlockedByCurrentUser ??
        false
      ),
      isBlockedByTargetUser: !!(
        raw?.isBlockedByTargetUser ??
        raw?.IsBlockedByTargetUser ??
        false
      ),
      isBlockedEitherWay: !!(
        raw?.isBlockedEitherWay ??
        raw?.IsBlockedEitherWay ??
        false
      ),
    };
  }

  async function readErrorMessage(res, fallbackKey, fallbackMessage) {
    if (!res) {
      return t(fallbackKey, {}, fallbackMessage);
    }

    if (res.status === 401 || res.status === 403) {
      return t("errors.chat.permission_denied", {}, "You do not have permission to do that");
    }

    if (res.status === 404) {
      return t("profile.blockedUsersSettings.errors.targetUnavailable", {}, "This user is unavailable right now");
    }

    if (res.status >= 500) {
      return t("errors.generic", {}, "The server is busy right now. Please try again.");
    }

    return t(fallbackKey, {}, fallbackMessage);
  }

  async function requestStatus(targetId) {
    if (!targetId || !global.API?.Blocks?.status) {
      return normalizeStatus({}, targetId);
    }

    try {
      const res = await global.API.Blocks.status(targetId);
      if (!res?.ok) {
        return normalizeStatus({}, targetId);
      }
      const data = await res.json().catch(() => ({}));
      return normalizeStatus(data, targetId);
    } catch (_) {
      return normalizeStatus({}, targetId);
    }
  }

  function getActionLabelKey(isBlockedByCurrentUser) {
    return isBlockedByCurrentUser
      ? "profile.blockedUsersSettings.actions.unblock"
      : "profile.blockedUsersSettings.actions.block";
  }

  function syncPresenceAfterToggle(targetId, status = {}) {
    const normalizedTargetId = normalizeId(targetId);
    if (!normalizedTargetId || !global.PresenceStore) {
      return;
    }

    const isBlockedEitherWay = !!(
      status?.isBlockedEitherWay ??
      status?.IsBlockedEitherWay ??
      false
    );

    if (isBlockedEitherWay) {
      if (typeof global.PresenceStore.applyHiddenEvent === "function") {
        global.PresenceStore.applyHiddenEvent({ accountId: normalizedTargetId });
      }
      return;
    }

    if (typeof global.PresenceStore.ensureSnapshotForAccountIds === "function") {
      global.PresenceStore.ensureSnapshotForAccountIds([normalizedTargetId], {
        force: true,
      }).catch(() => {});
    }
  }

  function getConfirmTargetName(options = {}) {
    const username = (options?.targetUsername || "").toString().trim();
    if (username) {
      return username;
    }

    const fullName = (options?.targetFullName || "").toString().trim();
    if (fullName) {
      return fullName;
    }

    const fallbackName = (options?.targetName || "").toString().trim();
    return fallbackName || getMaskedUserLabel();
  }

  function showConfirm(options = {}) {
    if (global.ChatCommon && typeof global.ChatCommon.showConfirm === "function") {
      global.ChatCommon.showConfirm(options);
      return true;
    }
    return false;
  }

  async function toggleBlock(options = {}) {
    const targetId = (options?.targetId || "").toString().trim();
    if (!targetId || !global.API?.Blocks) {
      if (global.toastError) {
        global.toastError(
          t("profile.blockedUsersSettings.errors.generic", {}, "Could not update blocked users right now"),
        );
      }
      return null;
    }

    const isBlockedByCurrentUser = !!options?.isBlockedByCurrentUser;
    const action = isBlockedByCurrentUser ? "unblock" : "block";
    const safeName = getConfirmTargetName(options);
    const titleKey = isBlockedByCurrentUser
      ? "profile.blockedUsersSettings.confirm.unblockTitle"
      : "profile.blockedUsersSettings.confirm.blockTitle";
    const messageKey = isBlockedByCurrentUser
      ? "profile.blockedUsersSettings.confirm.unblockMessage"
      : "profile.blockedUsersSettings.confirm.blockMessage";
    const confirmKey = isBlockedByCurrentUser
      ? "profile.blockedUsersSettings.actions.unblock"
      : "profile.blockedUsersSettings.actions.block";

    const runAction = async () => {
      try {
        const res =
          action === "block"
            ? await global.API.Blocks.block(targetId)
            : await global.API.Blocks.unblock(targetId);

        if (!res?.ok) {
          const message = await readErrorMessage(
            res,
            "profile.blockedUsersSettings.errors.generic",
            "Could not update blocked users right now",
          );
          if (global.toastError) {
            global.toastError(message);
          }
          if (typeof options?.onError === "function") {
            options.onError(message, res);
          }
          return null;
        }

        const payload = await res.json().catch(() => ({}));
        const status = normalizeStatus(payload, targetId);
        syncPresenceAfterToggle(targetId, status);

        if (global.PageCache?.clear) {
          global.PageCache.clear("#/account-settings/blocked-users");
          global.PageCache.clear(buildBlockedUsersHash());
        }

        if (global.toastSuccess) {
          global.toastSuccess(
            t(
              action === "block"
                ? "profile.blockedUsersSettings.toast.blocked"
                : "profile.blockedUsersSettings.toast.unblocked",
              {},
              action === "block" ? "User blocked" : "User unblocked",
            ),
          );
        }

        if (typeof options?.onSuccess === "function") {
          await options.onSuccess(status);
        }

        return status;
      } catch (error) {
        console.error("Failed to update block status:", error);
        const message = t(
          "profile.blockedUsersSettings.errors.generic",
          {},
          "Could not update blocked users right now",
        );
        if (global.toastError) {
          global.toastError(message);
        }
        if (typeof options?.onError === "function") {
          options.onError(message, null);
        }
        return null;
      }
    };

    const confirmOptions = {
      title: t(titleKey, { name: safeName }, safeName),
      message: t(messageKey, { name: safeName }, safeName),
      confirmText: t(confirmKey, {}, action === "block" ? "Block" : "Unblock"),
      cancelText: t("common.buttons.cancel", {}, "Cancel"),
      isDanger: !isBlockedByCurrentUser,
      onConfirm: runAction,
    };

    if (!showConfirm(confirmOptions)) {
      await runAction();
    }

    return null;
  }

  function canSendInConversation(meta = {}) {
    const isGroup = !!(meta?.isGroup ?? meta?.IsGroup ?? false);
    if (isGroup) return true;
    return !!(meta?.canSendMessage ?? meta?.CanSendMessage ?? true);
  }

  global.BlockUtils = {
    BLOCKED_USERS_SUBPAGE,
    buildBlockedUsersHash,
    canSendInConversation,
    getActionLabelKey,
    getAvatarUrl,
    getConfirmTargetName,
    getDefaultAvatar,
    getDisplayName,
    getFullName,
    getMaskedUserLabel,
    getUsername,
    isBlockedMaskApplied,
    normalizeStatus,
    openBlockedUsersPage,
    readErrorMessage,
    requestStatus,
    syncPresenceAfterToggle,
    toggleBlock,
  };
})(window);
