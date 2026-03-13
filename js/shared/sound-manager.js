(function (global) {
  const DEFAULT_SOUND_FILES = Object.freeze({
    message: "assets/sounds/sound-basic.mp3",
    mention: "assets/sounds/sound-basic.mp3",
    notification: "assets/sounds/sound-basic.mp3",
  });
  const STORAGE_PREFIX = "cloudm:sound";
  const DEFAULT_ACCOUNT_ID = "";
  const MAX_DEFERRED_INTENTS = 20;
  const tabId =
    global.crypto?.randomUUID?.() ||
    `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const pendingDecisions = new Map();
  const recentPlayedEvents = new Map();
  const deferredIntents = [];

  let currentAccountId = DEFAULT_ACCOUNT_ID;
  let isEnabled = true;
  let isPreferenceResolved = false;
  let audioUnlocked = false;
  let soundChannel = null;
  let channelName = "";
  let leaderRenewTimer = null;
  let leaderClaimPromise = null;
  let leaderClaimToken = 0;
  let baseAudio = null;
  let boundUnlock = false;
  let lastPlaybackAt = 0;

  function getConfigNumber(key, fallback) {
    const value = Number(global.APP_CONFIG?.[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function clampVolume(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0.4;
    return Math.min(1, Math.max(0, numeric));
  }

  function getSoundFiles() {
    return {
      ...DEFAULT_SOUND_FILES,
      ...(global.APP_CONFIG?.SOUND_FILES || {}),
    };
  }

  function getSoundEnabledDefault() {
    return global.APP_CONFIG?.SOUND_ENABLED_DEFAULT !== false;
  }

  function normalizeBoolean(value, fallback = true) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1" || normalized === "on") {
        return true;
      }
      if (normalized === "false" || normalized === "0" || normalized === "off") {
        return false;
      }
    }
    return fallback;
  }

  function getSoundVolume() {
    return clampVolume(global.APP_CONFIG?.SOUND_VOLUME ?? 0.4);
  }

  function getCooldownMs() {
    return getConfigNumber("SOUND_COOLDOWN_MS", 900);
  }

  function getDecisionWindowMs() {
    return (
      Number(global.APP_CONFIG?.SOUND_EVENT_DECISION_WINDOW_MS) ||
      getConfigNumber("SOUND_DECISION_WINDOW_MS", 140)
    );
  }

  function getLeaderHeartbeatIntervalMs() {
    return (
      Number(global.APP_CONFIG?.SOUND_LEADER_RENEW_INTERVAL_MS) ||
      getConfigNumber("SOUND_LEADER_HEARTBEAT_INTERVAL_MS", 2500)
    );
  }

  function getLeaderTtlMs() {
    const configured =
      Number(global.APP_CONFIG?.SOUND_LEADER_LEASE_TTL_MS) ||
      getConfigNumber("SOUND_LEADER_TTL_MS", 6000);
    return Math.max(configured, getLeaderHeartbeatIntervalMs() + 1500);
  }

  function getRecentEventTtlMs() {
    return (
      Number(global.APP_CONFIG?.SOUND_EVENT_DEDUPE_WINDOW_MS) ||
      getConfigNumber("SOUND_RECENT_EVENT_TTL_MS", 15000)
    );
  }

  function getRecentEventMaxEntries() {
    return (
      Number(global.APP_CONFIG?.SOUND_EVENT_DEDUPE_MAX_ENTRIES) ||
      getConfigNumber("SOUND_RECENT_EVENT_MAX_ENTRIES", 200)
    );
  }

  function getLeaderClaimSettleMs() {
    return Math.max(60, Math.min(getLeaderHeartbeatIntervalMs(), 120));
  }

  function getPendingDecisionTtlMs() {
    return Math.max(getDecisionWindowMs() * 20, 15000);
  }

  function getPendingDecisionMaxEntries() {
    return Math.max(getRecentEventMaxEntries(), 200);
  }

  function getCurrentAccountId() {
    return (localStorage.getItem("accountId") || "")
      .toString()
      .trim()
      .toLowerCase();
  }

  function getLeaderStorageKey(accountId = currentAccountId) {
    return `${STORAGE_PREFIX}:leader:${accountId || DEFAULT_ACCOUNT_ID}`;
  }

  function getMessageStorageKey(accountId = currentAccountId) {
    return `${STORAGE_PREFIX}:message:${accountId || DEFAULT_ACCOUNT_ID}`;
  }

  function getPreferenceStorageKey(accountId = currentAccountId) {
    return `${STORAGE_PREFIX}:enabled:${accountId || DEFAULT_ACCOUNT_ID}`;
  }

  function parseJson(rawValue) {
    if (typeof rawValue !== "string" || !rawValue.trim()) return null;
    try {
      return JSON.parse(rawValue);
    } catch (_) {
      return null;
    }
  }

  function clearDecisionTimer(entry) {
    if (!entry?.timerId) return;
    clearTimeout(entry.timerId);
    entry.timerId = null;
  }

  function clearPendingDecision(eventKey) {
    const entry = pendingDecisions.get(eventKey);
    if (!entry) return;
    clearDecisionTimer(entry);
    pendingDecisions.delete(eventKey);
  }

  function clearAllPendingDecisions() {
    for (const eventKey of pendingDecisions.keys()) {
      clearPendingDecision(eventKey);
    }
  }

  function invalidateLeaderClaim() {
    leaderClaimToken += 1;
    leaderClaimPromise = null;
  }

  function prunePendingDecisions(nowMs = Date.now()) {
    const ttlMs = getPendingDecisionTtlMs();
    for (const [eventKey, entry] of pendingDecisions.entries()) {
      const createdAt = Number(entry?.createdAt || 0);
      if (!createdAt || nowMs - createdAt > ttlMs) {
        clearPendingDecision(eventKey);
      }
    }

    const maxEntries = getPendingDecisionMaxEntries();
    while (pendingDecisions.size > maxEntries) {
      const oldestKey = pendingDecisions.keys().next().value;
      if (!oldestKey) break;
      clearPendingDecision(oldestKey);
    }
  }

  function pruneRecentPlayedEvents(nowMs = Date.now()) {
    const ttlMs = getRecentEventTtlMs();
    for (const [eventKey, playedAt] of recentPlayedEvents.entries()) {
      if (nowMs - playedAt > ttlMs) {
        recentPlayedEvents.delete(eventKey);
      }
    }

    const maxEntries = getRecentEventMaxEntries();
    if (recentPlayedEvents.size <= maxEntries) return;

    const overflow = recentPlayedEvents.size - maxEntries;
    const keysToDelete = Array.from(recentPlayedEvents.keys()).slice(0, overflow);
    keysToDelete.forEach((eventKey) => recentPlayedEvents.delete(eventKey));
  }

  function wasRecentlyPlayed(eventKey) {
    if (!eventKey) return false;
    pruneRecentPlayedEvents();
    return recentPlayedEvents.has(eventKey);
  }

  function markEventPlayed(eventKey, playedAt = Date.now()) {
    if (!eventKey) return;
    recentPlayedEvents.set(eventKey, playedAt);
    pruneRecentPlayedEvents(playedAt);
    clearPendingDecision(eventKey);
  }

  function hasCachedPreference(accountId = currentAccountId) {
    if (!accountId) return false;
    const rawValue = localStorage.getItem(getPreferenceStorageKey(accountId));
    return rawValue !== null && rawValue !== undefined && `${rawValue}`.trim() !== "";
  }

  function clearDeferredIntents() {
    deferredIntents.length = 0;
  }

  function enqueueDeferredIntent(intent, options = {}) {
    if (!intent?.eventKey || wasRecentlyPlayed(intent.eventKey)) return;

    const nowMs = Date.now();
    const existingIndex = deferredIntents.findIndex(
      (entry) => entry.eventKey === intent.eventKey,
    );
    const normalizedIntent = {
      ...intent,
      queuedAt: nowMs,
      shouldBroadcast: options.shouldBroadcast !== false,
    };

    if (existingIndex >= 0) {
      deferredIntents.splice(existingIndex, 1, normalizedIntent);
    } else {
      deferredIntents.push(normalizedIntent);
    }

    const ttlMs = getPendingDecisionTtlMs();
    while (
      deferredIntents.length &&
      nowMs - Number(deferredIntents[0]?.queuedAt || 0) > ttlMs
    ) {
      deferredIntents.shift();
    }

    while (deferredIntents.length > MAX_DEFERRED_INTENTS) {
      deferredIntents.shift();
    }
  }

  function flushDeferredIntents() {
    if (!currentAccountId || !isPreferenceResolved || !deferredIntents.length) {
      return;
    }

    const queuedIntents = deferredIntents.splice(0, deferredIntents.length);
    if (!isEnabled) return;

    const canRegisterLocally = audioUnlocked;
    queuedIntents.forEach((intent) => {
      if (!intent?.eventKey || wasRecentlyPlayed(intent.eventKey)) return;

      if (intent.shouldBroadcast) {
        postCrossTabMessage({
          type: "play-intent",
          eventKey: intent.eventKey,
          soundKey: intent.soundKey || "notification",
          eligibleToPlay: !!intent.eligibleToPlay,
          suppressSound: !!intent.suppressSound,
        });
      }

      if (canRegisterLocally) {
        registerPlayIntent(intent);
      }
    });
  }

  function readLeaderLease() {
    if (!currentAccountId) return null;
    return parseJson(localStorage.getItem(getLeaderStorageKey()));
  }

  function isLeaseActive(lease) {
    return !!(
      lease &&
      lease.accountId === currentAccountId &&
      lease.tabId &&
      typeof lease.expiresAt === "number" &&
      lease.expiresAt > Date.now()
    );
  }

  function isCurrentTabLeader() {
    const lease = readLeaderLease();
    return !!(lease && isLeaseActive(lease) && lease.tabId === tabId);
  }

  function stopLeaderRenewLoop() {
    if (!leaderRenewTimer) return;
    clearInterval(leaderRenewTimer);
    leaderRenewTimer = null;
  }

  function writeLeaderLease(expiresAt) {
    if (!currentAccountId) return;
    localStorage.setItem(
      getLeaderStorageKey(),
      JSON.stringify({
        accountId: currentAccountId,
        tabId,
        expiresAt,
        updatedAt: Date.now(),
        audioUnlocked,
      }),
    );
  }

  function renewLeadershipLease() {
    if (!currentAccountId || !isEnabled || !audioUnlocked) {
      releaseLeadership(false);
      return;
    }

    if (!isCurrentTabLeader()) {
      stopLeaderRenewLoop();
      return;
    }

    writeLeaderLease(Date.now() + getLeaderTtlMs());
  }

  function startLeaderRenewLoop() {
    stopLeaderRenewLoop();
    if (!isCurrentTabLeader()) return;
    renewLeadershipLease();
    leaderRenewTimer = setInterval(() => {
      renewLeadershipLease();
    }, getLeaderHeartbeatIntervalMs());
  }

  function postCrossTabMessage(message) {
    if (!currentAccountId || !message) return;

    const payload = {
      ...message,
      accountId: currentAccountId,
      senderTabId: tabId,
      sentAt: Date.now(),
    };

    if (soundChannel) {
      soundChannel.postMessage(payload);
      return;
    }

    localStorage.setItem(getMessageStorageKey(), JSON.stringify(payload));
  }

  function closeSoundChannel() {
    if (!soundChannel) return;
    soundChannel.close();
    soundChannel = null;
    channelName = "";
  }

  function openSoundChannelIfNeeded() {
    if (!currentAccountId || typeof global.BroadcastChannel !== "function") {
      closeSoundChannel();
      return;
    }

    const nextName = `${STORAGE_PREFIX}:channel:${currentAccountId}`;
    if (soundChannel && channelName === nextName) return;

    closeSoundChannel();
    soundChannel = new global.BroadcastChannel(nextName);
    channelName = nextName;
    soundChannel.onmessage = (event) => {
      handleCrossTabMessage(event?.data);
    };
  }

  function loadCachedPreference(accountId = currentAccountId) {
    if (!accountId) return getSoundEnabledDefault();

    const rawValue = (localStorage.getItem(getPreferenceStorageKey(accountId)) || "")
      .toString()
      .trim()
      .toLowerCase();

    if (rawValue === "true" || rawValue === "1") return true;
    if (rawValue === "false" || rawValue === "0") return false;
    return getSoundEnabledDefault();
  }

  function persistEnabledPreference(enabled) {
    if (!currentAccountId) return;
    localStorage.setItem(getPreferenceStorageKey(), enabled ? "true" : "false");
  }

  function rebindAccountIfNeeded() {
    const nextAccountId = getCurrentAccountId();
    if (nextAccountId === currentAccountId) return;

    invalidateLeaderClaim();
    releaseLeadership(false);
    stopLeaderRenewLoop();
    closeSoundChannel();
    clearAllPendingDecisions();
    clearDeferredIntents();
    recentPlayedEvents.clear();

    currentAccountId = nextAccountId;
    const cachedPreferenceExists = hasCachedPreference(currentAccountId);
    isPreferenceResolved = !!currentAccountId && cachedPreferenceExists;
    isEnabled = loadCachedPreference(currentAccountId);
    if (currentAccountId) {
      openSoundChannelIfNeeded();
    }
  }

  function claimLeadership() {
    if (!currentAccountId || !isEnabled || !isPreferenceResolved || !audioUnlocked) {
      return Promise.resolve(false);
    }

    if (leaderClaimPromise) {
      return leaderClaimPromise;
    }

    const claimToken = ++leaderClaimToken;
    leaderClaimPromise = new Promise((resolve) => {
      writeLeaderLease(Date.now() + getLeaderTtlMs());

      global.setTimeout(() => {
        const isClaimStillValid =
          claimToken === leaderClaimToken &&
          !!currentAccountId &&
          isEnabled &&
          isPreferenceResolved &&
          audioUnlocked;

        if (!isClaimStillValid) {
          stopLeaderRenewLoop();
          if (claimToken === leaderClaimToken) {
            leaderClaimPromise = null;
          }
          resolve(false);
          return;
        }

        const latestLease = readLeaderLease();
        const didClaim =
          !!latestLease &&
          latestLease.tabId === tabId &&
          isLeaseActive(latestLease);

        if (didClaim) {
          startLeaderRenewLoop();
          schedulePendingDecisionFlush();
        } else {
          stopLeaderRenewLoop();
        }

        if (claimToken === leaderClaimToken) {
          leaderClaimPromise = null;
        }

        resolve(didClaim);
      }, getLeaderClaimSettleMs());
    });

    return leaderClaimPromise;
  }

  function releaseLeadership(broadcast = true) {
    invalidateLeaderClaim();
    stopLeaderRenewLoop();
    if (!currentAccountId) return;

    const lease = readLeaderLease();
    if (lease?.tabId === tabId) {
      localStorage.removeItem(getLeaderStorageKey());
      if (broadcast) {
        postCrossTabMessage({ type: "leader-release" });
      }
    }
  }

  function ensureLeaderForPendingEvent() {
    if (!currentAccountId || !isEnabled || !isPreferenceResolved || !audioUnlocked) {
      return Promise.resolve(false);
    }
    if (isCurrentTabLeader()) {
      startLeaderRenewLoop();
      schedulePendingDecisionFlush();
      return Promise.resolve(true);
    }

    const lease = readLeaderLease();
    if (!isLeaseActive(lease)) {
      return claimLeadership();
    }

    return Promise.resolve(false);
  }

  function ensureBaseAudio(soundKey = "notification") {
    const soundFiles = getSoundFiles();
    const source = soundFiles[soundKey] || soundFiles.notification || soundFiles.message;
    if (!source) return null;

    if (!baseAudio || baseAudio.dataset.source !== source) {
      baseAudio = new Audio(source);
      baseAudio.preload = "auto";
      baseAudio.dataset.source = source;
      baseAudio.load();
    }

    return baseAudio;
  }

  async function unlockAudio() {
    rebindAccountIfNeeded();
    const audio = ensureBaseAudio("message");
    if (!audio) {
      audioUnlocked = true;
      if (isEnabled) {
        ensureLeaderForPendingEvent();
        flushDeferredIntents();
      }
      return true;
    }

    if (audioUnlocked) return true;

    try {
      audio.volume = 0;
      const playResult = audio.play();
      if (playResult && typeof playResult.then === "function") {
        await playResult;
      }
      audio.pause();
      audio.currentTime = 0;
      audio.volume = getSoundVolume();
      audioUnlocked = true;
      if (isEnabled) {
        ensureLeaderForPendingEvent();
        flushDeferredIntents();
      }
      return true;
    } catch (_) {
      audio.volume = getSoundVolume();
      return false;
    }
  }

  async function playSound(soundKey, eventKey) {
    if (!isEnabled || !audioUnlocked || !currentAccountId || !eventKey) return false;
    if (wasRecentlyPlayed(eventKey)) return false;

    const nowMs = Date.now();
    if (nowMs - lastPlaybackAt < getCooldownMs()) {
      clearPendingDecision(eventKey);
      return false;
    }

    const audio = ensureBaseAudio(soundKey);
    if (!audio) return false;

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = getSoundVolume();
      const playResult = audio.play();
      if (playResult && typeof playResult.then === "function") {
        await playResult;
      }
      lastPlaybackAt = Date.now();
      markEventPlayed(eventKey, lastPlaybackAt);
      postCrossTabMessage({
        type: "played",
        eventKey,
        soundKey,
        playedAt: lastPlaybackAt,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function schedulePendingDecision(eventKey) {
    prunePendingDecisions();
    const entry = pendingDecisions.get(eventKey);
    if (!entry || entry.timerId) return;

    entry.timerId = setTimeout(async () => {
      const latestEntry = pendingDecisions.get(eventKey);
      if (!latestEntry) return;

      clearDecisionTimer(latestEntry);
      if (!isCurrentTabLeader()) {
        ensureLeaderForPendingEvent();
        return;
      }

      if (latestEntry.shouldSuppress || !latestEntry.hasEligibleRequester) {
        markEventPlayed(eventKey, Date.now());
        clearPendingDecision(eventKey);
        return;
      }

      const didPlay = await playSound(latestEntry.soundKey, eventKey);
      if (!didPlay) {
        markEventPlayed(eventKey, Date.now());
      }
      clearPendingDecision(eventKey);
    }, getDecisionWindowMs());
  }

  function schedulePendingDecisionFlush() {
    if (!isCurrentTabLeader()) return;
    for (const eventKey of pendingDecisions.keys()) {
      schedulePendingDecision(eventKey);
    }
  }

  function registerPlayIntent(intent) {
    if (!intent?.eventKey || !currentAccountId) return;
    if (wasRecentlyPlayed(intent.eventKey)) return;
    prunePendingDecisions();

    const nowMs = Date.now();
    let entry = pendingDecisions.get(intent.eventKey);
    if (!entry) {
      entry = {
        soundKey: intent.soundKey || "notification",
        hasEligibleRequester: false,
        shouldSuppress: false,
        timerId: null,
        createdAt: nowMs,
      };
      pendingDecisions.set(intent.eventKey, entry);
    }

    entry.soundKey = intent.soundKey || entry.soundKey;
    entry.hasEligibleRequester = entry.hasEligibleRequester || !!intent.eligibleToPlay;
    entry.shouldSuppress = entry.shouldSuppress || !!intent.suppressSound;
    entry.createdAt = entry.createdAt || nowMs;

    if (isCurrentTabLeader()) {
      schedulePendingDecision(intent.eventKey);
      return;
    }

    ensureLeaderForPendingEvent();
  }

  function handleCrossTabMessage(message) {
    if (!message || message.accountId !== currentAccountId || message.senderTabId === tabId) {
      return;
    }

    switch (message.type) {
      case "play-intent":
        if (!isPreferenceResolved) {
          enqueueDeferredIntent(message, { shouldBroadcast: false });
          break;
        }
        if (!isEnabled || !audioUnlocked) {
          break;
        }
        registerPlayIntent(message);
        break;
      case "played":
        markEventPlayed(message.eventKey, message.playedAt || Date.now());
        break;
      case "leader-release":
        if (audioUnlocked && isEnabled) {
          ensureLeaderForPendingEvent();
        }
        break;
      default:
        break;
    }
  }

  function bindUnlockListeners() {
    if (boundUnlock) return;
    boundUnlock = true;

    const attemptUnlock = () => {
      unlockAudio();
    };

    global.addEventListener("pointerdown", attemptUnlock, { passive: true });
    global.addEventListener("keydown", attemptUnlock, { passive: true });
    global.addEventListener("beforeunload", () => {
      releaseLeadership(false);
      closeSoundChannel();
    });
    global.addEventListener("pagehide", () => {
      releaseLeadership(true);
    });
    global.addEventListener("storage", (event) => {
      rebindAccountIfNeeded();

      if (event.key === getMessageStorageKey() && event.newValue) {
        handleCrossTabMessage(parseJson(event.newValue));
        return;
      }

      if (event.key === getPreferenceStorageKey()) {
        const nextEnabled = loadCachedPreference(currentAccountId);
        const didResolvePreference = !isPreferenceResolved;
        isPreferenceResolved = true;
        if (nextEnabled === isEnabled && !didResolvePreference) return;
        isEnabled = nextEnabled;
        if (!isEnabled) {
          clearAllPendingDecisions();
          clearDeferredIntents();
          releaseLeadership(false);
          return;
        }
        flushDeferredIntents();
        if (audioUnlocked) {
          ensureLeaderForPendingEvent();
        }
        return;
      }

      if (event.key === getLeaderStorageKey()) {
        if (!isCurrentTabLeader()) {
          stopLeaderRenewLoop();
        }
      }
    });
  }

  function setEnabled(nextEnabled, options = {}) {
    rebindAccountIfNeeded();
    isPreferenceResolved = true;
    isEnabled = normalizeBoolean(nextEnabled, getSoundEnabledDefault());
    if (options.persist !== false) {
      persistEnabledPreference(isEnabled);
    }

    if (!isEnabled) {
      clearAllPendingDecisions();
      clearDeferredIntents();
      releaseLeadership(true);
      return isEnabled;
    }

    flushDeferredIntents();
    if (audioUnlocked) {
      ensureLeaderForPendingEvent();
    }

    return isEnabled;
  }

  function resolvePreferenceFallback(options = {}) {
    rebindAccountIfNeeded();
    if (!currentAccountId || isPreferenceResolved) return isEnabled;

    isPreferenceResolved = true;
    isEnabled = normalizeBoolean(
      options.enabled,
      getSoundEnabledDefault(),
    );

    if (!isEnabled) {
      clearAllPendingDecisions();
      clearDeferredIntents();
      releaseLeadership(true);
      return isEnabled;
    }

    flushDeferredIntents();
    if (audioUnlocked) {
      ensureLeaderForPendingEvent();
    }

    return isEnabled;
  }

  function applyAccountSettings(settings) {
    rebindAccountIfNeeded();
    if (!settings || typeof settings !== "object") return;

    const targetAccountId = (
      settings.accountId ||
      settings.AccountId ||
      currentAccountId
    )
      .toString()
      .trim()
      .toLowerCase();

    if (!targetAccountId || (currentAccountId && targetAccountId !== currentAccountId)) {
      return;
    }

    const nextEnabled =
      settings.soundEffectsEnabled ??
      settings.SoundEffectsEnabled ??
      getSoundEnabledDefault();

    setEnabled(normalizeBoolean(nextEnabled, getSoundEnabledDefault()));
  }

  function requestSound(intent) {
    rebindAccountIfNeeded();
    bindUnlockListeners();

    if (!currentAccountId || !intent?.eventKey) return;

    const normalizedIntent = {
      type: "play-intent",
      eventKey: intent.eventKey,
      soundKey: intent.soundKey || "notification",
      eligibleToPlay: !!intent.eligibleToPlay,
      suppressSound: !!intent.suppressSound,
    };

    if (!isPreferenceResolved) {
      postCrossTabMessage(normalizedIntent);
      enqueueDeferredIntent(normalizedIntent, { shouldBroadcast: false });
      return;
    }

    if (!isEnabled) return;

    postCrossTabMessage(normalizedIntent);
    if (!audioUnlocked) return;

    registerPlayIntent(normalizedIntent);
  }

  const SoundManager = {
    init() {
      rebindAccountIfNeeded();
      bindUnlockListeners();
    },
    getEnabled() {
      rebindAccountIfNeeded();
      return isEnabled;
    },
    setEnabled(nextEnabled, options = {}) {
      return setEnabled(nextEnabled, options);
    },
    applyAccountSettings(settings) {
      applyAccountSettings(settings);
    },
    resolvePreferenceFallback(options = {}) {
      return resolvePreferenceFallback(options);
    },
    requestMessageSound({ eventKey, eligibleToPlay, suppressSound, isMentioned }) {
      requestSound({
        eventKey: `message:${eventKey}`,
        soundKey: isMentioned ? "mention" : "message",
        eligibleToPlay,
        suppressSound,
      });
    },
    requestNotificationSound({ eventKey, eligibleToPlay = true }) {
      requestSound({
        eventKey: `notification:${eventKey}`,
        soundKey: "notification",
        eligibleToPlay,
        suppressSound: false,
      });
    },
    requestPlayback({ eventKey, suppress = false, type = "notification" }) {
      if (!eventKey) return;
      const normalizedType = ["message", "mention", "notification"].includes(type)
        ? type
        : "notification";
      const normalizedEventKey = `${normalizedType}:${eventKey}`;
      requestSound({
        eventKey: normalizedEventKey,
        soundKey: normalizedType,
        eligibleToPlay: true,
        suppressSound: suppress,
      });
    },
  };

  SoundManager.init();
  global.SoundManager = SoundManager;
})(window);
