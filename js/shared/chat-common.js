/**
 * Chat Common Utilities
 * Reusable functions for chat components (Sidebar, Windows, Full Page)
 */
const ChatCommon = {
    /**
     * Helper to get avatar URL with fallback
     */
    getAvatar(conv) {
        return conv.displayAvatar || APP_CONFIG.DEFAULT_AVATAR;
    },

    /**
     * Helper to get display name (Username for private, DisplayName for group)
     */
    getDisplayName(conv) {
        return conv.displayName || 'Unknown';
    },

    /**
     * Generate HTML for a message bubble
     */
    renderMessageBubble(msg, options = {}) {
        const time = PostUtils.timeAgo(msg.sentAt, true);
        const { showAuthor = false, authorName = '' } = options;
        const hasMedia = msg.medias && msg.medias.length > 0;
        
        let mediaHtml = '';
        if (hasMedia) {
            mediaHtml = `
                <div class="msg-media-grid ${msg.medias.length > 1 ? 'multiple' : 'single'}">
                    ${msg.medias.map(m => {
                        if (m.mediaType === 0) { // Image
                            return `<div class="msg-media-item"><img src="${m.mediaUrl}" alt="image" loading="lazy" onclick="window.previewImage && window.previewImage('${m.mediaUrl}')"></div>`;
                        } else if (m.mediaType === 1) { // Video
                            return `<div class="msg-media-item"><video src="${m.mediaUrl}" controls></video></div>`;
                        }
                        return '';
                    }).join('')}
                </div>
            `;
        }

        return `
            <div class="msg-bubble-wrapper ${msg.isOwn ? 'sent' : 'received'}">
                ${showAuthor ? `<div class="msg-author">${escapeHtml(authorName)}</div>` : ''}
                <div class="msg-content-container">
                    ${mediaHtml}
                    ${msg.content ? `<div class="msg-bubble">${escapeHtml(msg.content)}</div>` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Render a centered time separator
     * @param {string|Date} date 
     */
    renderChatSeparator(date) {
        const timeStr = PostUtils.formatChatSeparatorTime(date);
        return `<div class="chat-time-separator">${timeStr}</div>`;
    },

    /**
     * Format last message preview
     */
    getLastMsgPreview(conv) {
        if (conv.lastMessagePreview) return conv.lastMessagePreview;
        return conv.isGroup ? 'Group created' : 'Started a conversation';
    }
};

window.ChatCommon = ChatCommon;
