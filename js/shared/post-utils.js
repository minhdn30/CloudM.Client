/**
 * Shared Post Utilities used by both Newfeed and Post Detail
 * namespace: window.PostUtils
 */

(function(global) {
    const PostUtils = {};

    /**
     * Convert date string to relative time (e.g. "2 hours ago")
     * @param {string} dateStr 
     * @returns {string} Relative time string
     */
    PostUtils.timeAgo = function(dateStr, short = false) {
        const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
      
        if (diff < 60) return short ? "now" : "just now";
      
        const minutes = Math.floor(diff / 60);
        if (minutes < 60) return short ? `${minutes}m` : `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
      
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return short ? `${hours}h` : `${hours} hour${hours > 1 ? "s" : ""} ago`;
      
        const days = Math.floor(hours / 24);
        if (days < 7) return short ? `${days}d` : `${days} day${days > 1 ? "s" : ""} ago`;
        
        const weeks = Math.floor(days / 7);
        return short ? `${weeks}w` : `${weeks} week${weeks > 1 ? "s" : ""} ago`;
    };

    /**
     * Setup comment content with truncation logic (similar to setupCaption)
     * @param {HTMLElement} el 
     * @param {string} fullContent 
     * @param {number} maxLen 
     */
    PostUtils.setupCommentContent = function(el, fullContent, maxLen = APP_CONFIG.COMMENT_CONTENT_TRUNCATE_LENGTH, forceExpand = false) {
        if (!fullContent) {
            el.textContent = "";
            return;
        }

        // Always store full content for easier retrieval (e.g., when editing)
        el.dataset.fullContent = fullContent;

        if (fullContent.length <= maxLen) {
            el.textContent = fullContent;
            return;
        }

        // Use truncateSmart to avoid cutting words
        const truncatedContent = typeof truncateSmart === 'function' 
            ? truncateSmart(fullContent, maxLen)
            : fullContent.substring(0, maxLen) + "...";
        
        el.innerHTML = "";
        
        // If forceExpand, show full content immediately
        const initialText = forceExpand ? fullContent : truncatedContent;
        const textNode = document.createTextNode(initialText);
        el.appendChild(textNode);

        const btn = document.createElement("span");
        btn.className = "caption-toggle comment-toggle";
        // If forceExpand, button should be " less"
        btn.textContent = forceExpand ? " less" : "more";
        
        btn.onclick = (e) => {
            e.stopPropagation();
            const isMore = btn.textContent === "more";
            if (isMore) {
                 textNode.textContent = fullContent;
                 btn.textContent = " less";
            } else {
                 textNode.textContent = truncatedContent;
                 btn.textContent = "more";
            }
        };

        el.appendChild(btn);
    };



    /**
     * Truncate name without cutting in the middle of a word
     * @param {string} name - Full user name
     * @param {number} maxLen - Max length before truncation
     * @returns {string} Truncated name
     */
    PostUtils.truncateName = function(name, maxLen = window.APP_CONFIG?.MAX_NAME_DISPLAY_LENGTH || 25) {
        if (typeof truncateSmart === 'function') {
            return truncateSmart(name, maxLen);
        }
        
        // Fallback if text-utils.js not loaded
        if (!name || name.length <= maxLen) return name;
        let truncated = name.substring(0, maxLen);
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > 0) {
            truncated = truncated.substring(0, lastSpace);
        }
        return truncated + "...";
    };

    /**
     * Format full date for tooltip
     * @param {string} dateStr 
     * @returns {string} Formatted date (e.g. "February 2, 2026, 09:07 PM")
     */
    PostUtils.formatFullDateTime = function(dateStr) {
        const date = new Date(dateStr);
        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        return date.toLocaleString('en-US', options);
    };

    /**
     * Setup caption truncation with more/less toggle
     * @param {HTMLElement} el - The caption text element
     * @param {string} fullContent - Full caption text
     * @param {number} maxLen - Max length before truncation (default 150)
     */
    PostUtils.setupCaption = function(el, fullContent, maxLen = APP_CONFIG.CAPTION_TRUNCATE_LENGTH) {
        if (!fullContent) {
            el.textContent = "";
            return;
        }

        el.dataset.fullContent = fullContent;

        if (fullContent.length <= maxLen) {
            el.textContent = fullContent;
            return;
        }

        const truncatedContent = fullContent.substring(0, maxLen) + "...";
        
        // Clear and create text node for caption text
        el.innerHTML = "";
        const textNode = document.createTextNode(truncatedContent);
        el.appendChild(textNode);

        // Create Toggle Btn (No <br> needed, handled by CSS)

        // Create Toggle Btn
        const btn = document.createElement("span");
        btn.className = "caption-toggle";
        btn.textContent = "more";
        
        btn.onclick = (e) => {
            e.stopPropagation(); // prevent post click
            const isMore = btn.textContent === "more";
            if (isMore) {
                 textNode.textContent = fullContent;
                 btn.textContent = "less";
            } else {
                 textNode.textContent = truncatedContent;
                 btn.textContent = "more";
            }
        };

        el.appendChild(btn);
    };

    /**
     * Get privacy icon name
     * @param {number} privacy - 0: Public, 1: FollowOnly, 2: Private
     */
    PostUtils.getPrivacyIconName = function(privacy) {
        switch (privacy) {
            case 0: return "globe";
            case 1: return "users";
            case 2: return "lock";
            default: return "globe";
        }
    };

    /**
     * Get privacy label
     * @param {number} privacy 
     */
    PostUtils.getPrivacyLabel = function(privacy) {
        switch (privacy) {
            case 0: return "Public";
            case 1: return "Followers";
            case 2: return "Private";
            default: return "Public";
        }
    };

    /**
     * Render privacy badge HTML (Read-only version of privacy-selector)
     * @param {number} privacy 
     */
    PostUtils.renderPrivacyBadge = function(privacy) {
        const icon = PostUtils.getPrivacyIconName(privacy);
        const label = PostUtils.getPrivacyLabel(privacy);
        // Reuse .privacy-selector style but remove interactive elements/cursor
        // Added styling to make it look good in post header context (e.g. smaller, inline)
        return `
            <div class="privacy-selector" style="cursor: pointer; padding: 2px 0px; background: transparent; border: none; gap: 4px;" title="${label}">
                <i data-lucide="${icon}" class="privacy-icon" style="width: 14px; height: 14px; color: var(--text-tertiary);"></i>
            </div>
        `;
    };

    /**
     * Sync post data from detail view back to feed/list view
     * @param {string} postId 
     * @param {number|string} reactCount 
     * @param {boolean} isReacted 
     * @param {number|string} commentCount 
     * @param {string} [createdAt] - Optional, to update timeago
     */
    /**
     * Sync post data from detail view back to feed/list view
     * @param {string} postId 
     * @param {number|string} [reactCount]
     * @param {boolean} [isReacted] 
     * @param {number|string} [commentCount] 
     * @param {string} [createdAt] - Optional, to update timeago
     * @param {string} [content] - Optional, to update caption
     * @param {number} [privacy] - Optional, to update privacy badge
     */
    PostUtils.syncPostFromDetail = function(postId, reactCount, isReacted, commentCount, createdAt, content, privacy) {
        const postEl = document.querySelector(`.post[data-post-id="${postId}"]`);
        if (!postEl) return;

        // 1. Update React Button
        if (reactCount !== undefined && isReacted !== undefined) {
            const reactBtn = postEl.querySelector(`.react-btn`);
            if (reactBtn) {
                reactBtn.dataset.reacted = isReacted.toString();
                const icon = reactBtn.querySelector(".react-icon");
                const countEl = reactBtn.querySelector(".count");
                if (icon) icon.classList.toggle("reacted", isReacted);
                if (countEl) countEl.textContent = reactCount;
            }
        }
    
        // 2. Update Comment Button
        if (commentCount !== undefined) {
            const commentBtn = postEl.querySelector(`div.action-item[onclick*="openPostDetail('${postId}')"]`);
            if (commentBtn) {
                const countEl = commentBtn.querySelector(".count");
                if (countEl) countEl.textContent = commentCount;
            }
        }
        
        // 3. Update Time Ago (Only if provided)
        if (createdAt) {
            const timeEl = postEl.querySelector('.post-time');
            if (timeEl) {
                timeEl.textContent = PostUtils.timeAgo(createdAt);
                timeEl.title = PostUtils.formatFullDateTime(createdAt);
            }
        }

        // 4. Update Content/Caption
        if (content !== undefined) {
            const captionEl = postEl.querySelector(".post-caption");
            if (captionEl) {
                if (!content || content.trim().length === 0) {
                    captionEl.style.display = "none";
                    captionEl.textContent = "";
                    delete captionEl.dataset.fullContent;
                } else {
                    captionEl.style.display = "block";
                    PostUtils.setupCaption(captionEl, content);
                }
            }
        }

        // 5. Update Privacy Badge
        if (privacy !== undefined) {
            const metaContainer = postEl.querySelector(".post-meta");
            if (metaContainer) {
                // Find or target the privacy badge part
                // To keep it simple and preserve time, we find the existing time element
                const timeStr = postEl.querySelector('.post-time')?.outerHTML || "";
                const dot = `<span>•</span>`;
                const privacyBadge = PostUtils.renderPrivacyBadge(privacy);
                metaContainer.innerHTML = `${timeStr} ${dot} ${privacyBadge}`;
                if (window.lucide) lucide.createIcons();
            }
        }
    };

    // Export to global scope
    global.PostUtils = PostUtils;

})(window);
