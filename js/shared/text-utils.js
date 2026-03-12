/**
 * Text Processing Utilities
 * Global functions for text manipulation
 */

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return "";
  return text.replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[m]
  );
}

/**
 * Unescape HTML entities
 * @param {string} text - Text to unescape
 * @returns {string} Unescaped text
 */
function unescapeHtml(text) {
  if (!text) return "";
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

/**
 * Truncate text with ellipsis (basic)
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * Truncate text without cutting in the middle of a word (smart)
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateSmart(text, maxLength) {
  if (!text || text.length <= maxLength) return text;

  // Take a substring of maxLength
  let truncated = text.substring(0, maxLength);

  // Find the last space within this substring
  const lastSpace = truncated.lastIndexOf(" ");

  // If there's a space, truncate at the space to avoid cutting a word
  if (lastSpace > 0) {
    truncated = truncated.substring(0, lastSpace);
  }

  return truncated + "...";
}

/**
 * Sanitize input by removing dangerous characters
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized input
 */
function sanitizeInput(input) {
  if (!input) return "";
  // Remove script tags and event handlers
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "");
}

/**
 * Convert newlines to <br> tags
 * @param {string} text - Text with newlines
 * @returns {string} Text with <br> tags
 */
function nl2br(text) {
  if (!text) return "";
  return text.replace(/\n/g, "<br>");
}

/**
 * Strip HTML tags from text
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
function stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

/**
 * Automatically convert URLs in text to clickable <a> tags
 * @param {string} text - The text to process
 * @returns {string} Text with clickable links
 */
function linkify(text) {
  if (!text) return "";

  // URL regex: supports http, https, and www.
  const urlPattern = /(\b(https?):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
  
  return text.replace(urlPattern, (url) => {
    let href = url;
    // Add http:// if it starts with www.
    if (url.toLowerCase().startsWith('www.')) {
        href = 'http://' + url;
    }
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${url}</a>`;
  });
}

(function (global) {
  const DEFAULT_RECENT_MESSAGE_DAYS = 30;

  function relationshipT(key, params = {}, fallback = "") {
    return global.I18n?.t ? global.I18n.t(key, params, fallback || key) : fallback || key;
  }

  function normalizeRelationshipBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value !== 0;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1") {
        return true;
      }

      if (normalized === "false" || normalized === "0") {
        return false;
      }
    }

    return false;
  }

  function parseLastContactedAt(value) {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function getRecentMessageWindowMs() {
    const rawDays = Number(global.APP_CONFIG?.ACCOUNT_RELATIONSHIP_RECENT_MESSAGE_DAYS);
    const safeDays = Number.isFinite(rawDays) && rawDays > 0
      ? Math.floor(rawDays)
      : DEFAULT_RECENT_MESSAGE_DAYS;

    return safeDays * 24 * 60 * 60 * 1000;
  }

  function isRecentlyMessaged(lastContactedAt) {
    const parsed = parseLastContactedAt(lastContactedAt);
    if (!parsed) {
      return false;
    }

    return Date.now() - parsed.getTime() <= getRecentMessageWindowMs();
  }

  function resolveLabelKey(options = {}) {
    if (normalizeRelationshipBoolean(options.isFollower)) {
      return "common.relationships.followsYou";
    }

    if (normalizeRelationshipBoolean(options.isFollowing)) {
      return "common.relationships.following";
    }

    const hasDirectConversation =
      normalizeRelationshipBoolean(options.hasDirectConversation) ||
      !!parseLastContactedAt(options.lastContactedAt);

    if (!hasDirectConversation) {
      return "";
    }

    return isRecentlyMessaged(options.lastContactedAt)
      ? "common.relationships.messagedRecently"
      : "common.relationships.messagedBefore";
  }

  function resolveLabel(options = {}) {
    const key = resolveLabelKey(options);
    if (!key) {
      return "";
    }

    const fallbacks = {
      "common.relationships.following": "Following",
      "common.relationships.followsYou": "Follows you",
      "common.relationships.messagedRecently": "Messaged recently",
      "common.relationships.messagedBefore": "Messaged before",
    };

    return relationshipT(key, {}, fallbacks[key] || "");
  }

  global.AccountRelationshipText = {
    parseLastContactedAt,
    isRecentlyMessaged,
    resolveLabelKey,
    resolveLabel,
  };
})(window);

