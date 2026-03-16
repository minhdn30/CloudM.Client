/**
 * Chat Message Runtime
 * Shared internal runtime for chat-page and chat-window message flow.
 */
(function (global) {
    function toLowerSafe(value) {
        if (value === null || value === undefined) return '';
        return value.toString().toLowerCase();
    }

    function toStringSafe(value) {
        if (value === null || value === undefined) return '';
        return value.toString();
    }

    function runtimeT(key, fallback = '', params = {}) {
        const i18n = global.I18n;
        if (i18n && typeof i18n.t === 'function') {
            try {
                const translated = i18n.t(key, params);
                if (
                    typeof translated === 'string' &&
                    translated.trim().length > 0 &&
                    translated !== key
                ) {
                    return translated;
                }
            } catch (_err) {
                // fallback below
            }
        }
        return fallback || key;
    }

    function createContext(options = {}) {
        const myId = toLowerSafe(options.myAccountId || localStorage.getItem('accountId') || '');
        return {
            scope: options.scope === 'window' ? 'window' : 'page',
            conversationId: options.conversationId || null,
            myAccountId: myId,
            retryFiles: options.retryFiles instanceof Map ? options.retryFiles : new Map(),
            pendingSeenByConv: options.pendingSeenByConv instanceof Map ? options.pendingSeenByConv : new Map(),
            blobUrls: options.blobUrls instanceof Map ? options.blobUrls : new Map(),
            optimisticTempBubbles: options.optimisticTempBubbles instanceof Map ? options.optimisticTempBubbles : new Map(),
            now: typeof options.now === 'function' ? options.now : () => new Date()
        };
    }

    function normalizeIncomingMessage(raw, myAccountId = '') {
        if (!raw || typeof raw !== 'object') return null;
        if (raw.__normalized === true) {
            return raw;
        }

        const myId = toLowerSafe(myAccountId || localStorage.getItem('accountId') || '');
        const convRaw = raw.ConversationId || raw.conversationId || raw.conversationID || raw.conversation;
        const msgRaw = raw.MessageId || raw.messageId || raw.messageID;
        const tempId = raw.TempId || raw.tempId || null;
        const senderRaw =
            raw.Sender?.AccountId ||
            raw.sender?.accountId ||
            raw.SenderId ||
            raw.senderId ||
            '';
        const senderId = toLowerSafe(senderRaw);
        const messageId = msgRaw ? toLowerSafe(msgRaw) : null;
        const conversationId = convRaw ? toLowerSafe(convRaw) : '';
        const sentAt = raw.SentAt || raw.sentAt || new Date().toISOString();
        const contentRaw = raw.Content ?? raw.content ?? '';
        const content = typeof contentRaw === 'string' ? contentRaw.trim() : '';
        const medias = raw.Medias || raw.medias || [];
        const isRecalledRaw = raw.IsRecalled ?? raw.isRecalled;
        const isRecalled = (typeof isRecalledRaw === 'boolean')
            ? isRecalledRaw
            : (typeof isRecalledRaw === 'string' ? isRecalledRaw.toLowerCase() === 'true' : !!isRecalledRaw);
        const normalizeContentFn = global.ChatCommon && typeof global.ChatCommon.normalizeContent === 'function'
            ? global.ChatCommon.normalizeContent
            : (txt) => (txt || '').trim().replace(/\r\n/g, '\n').replace(/\s+/g, ' ');

        return {
            __normalized: true,
            raw,
            conversationId,
            messageId,
            tempId,
            senderId,
            isOwn: !!(senderId && myId && senderId === myId),
            content,
            normalizedContent: normalizeContentFn(content),
            sentAt,
            medias,
            isRecalled
        };
    }

    function queuePendingSeen(ctx, conversationId, messageId, accountId, memberInfo = null) {
        if (!ctx || !conversationId || !messageId || !accountId) return;

        const convId = toLowerSafe(conversationId);
        const msgId = toLowerSafe(messageId);
        const accId = toLowerSafe(accountId);

        let convMap = ctx.pendingSeenByConv.get(convId);
        if (!convMap) {
            convMap = new Map();
            ctx.pendingSeenByConv.set(convId, convMap);
        }

        let entries = convMap.get(msgId);
        if (!entries) {
            entries = [];
            convMap.set(msgId, entries);
        }

        entries.push({ accountId: accId, memberInfo });
    }

    function applyPendingSeenForMessage(ctx, conversationId, messageId, moveSeenAvatarFn) {
        if (!ctx || !conversationId || !messageId || typeof moveSeenAvatarFn !== 'function') return;
        const convId = toLowerSafe(conversationId);
        const msgId = toLowerSafe(messageId);

        const convMap = ctx.pendingSeenByConv.get(convId);
        if (!convMap) return;

        const entries = convMap.get(msgId);
        if (!entries || entries.length === 0) return;

        convMap.delete(msgId);
        entries.forEach(item => {
            moveSeenAvatarFn(item.accountId, msgId, item.memberInfo);
        });
        if (convMap.size === 0) {
            ctx.pendingSeenByConv.delete(convId);
        }
    }

    function trackBlobUrl(ctx, key, url) {
        if (!ctx || !url) return null;
        const safeKey = key || 'global';
        if (!ctx.blobUrls.has(safeKey)) {
            ctx.blobUrls.set(safeKey, new Set());
        }
        ctx.blobUrls.get(safeKey).add(url);
        return url;
    }

    function revokeBlobUrlIfNeeded(ctx, url) {
        if (!ctx || !url) return;
        try {
            URL.revokeObjectURL(url);
        } catch (err) {
            console.warn('Failed to revoke blob URL:', err);
        }
        ctx.blobUrls.forEach(set => set.delete(url));
    }

    function revokeMediaUrlsForTemp(ctx, tempId) {
        if (!ctx || !tempId) return;
        ctx.retryFiles.delete(tempId);
        const urls = ctx.blobUrls.get(tempId);
        if (urls && urls.size > 0) {
            Array.from(urls).forEach((url) => revokeBlobUrlIfNeeded(ctx, url));
        }
        ctx.blobUrls.delete(tempId);
    }

    function clearOptimisticTempCleanupTimer(bubble) {
        if (!bubble || !bubble.__optimisticTempCleanupTimer) return;
        global.clearTimeout(bubble.__optimisticTempCleanupTimer);
        bubble.__optimisticTempCleanupTimer = null;
    }

    function resetOptimisticBubbleRefs(ctx) {
        if (!ctx) return;
        if (!(ctx.optimisticTempBubbles instanceof Map)) {
            ctx.optimisticTempBubbles = new Map();
        } else {
            ctx.optimisticTempBubbles.forEach((bubble) => clearOptimisticTempCleanupTimer(bubble));
            ctx.optimisticTempBubbles.clear();
        }
    }

    function removeOptimisticBubbleRef(map, key, bubble) {
        if (!(map instanceof Map) || !key) return;
        if (!bubble) {
            map.delete(key);
            return;
        }
        if (map.get(key) === bubble) {
            map.delete(key);
        }
    }

    function hasSeenAvatar(bubble) {
        if (!bubble) return false;
        return !!bubble.querySelector('.msg-seen-row .seen-avatar-wrapper');
    }

    function trackOptimisticBubble(ctx, bubble, refs = {}) {
        if (!ctx || !bubble) return;

        if (!(ctx.optimisticTempBubbles instanceof Map)) {
            ctx.optimisticTempBubbles = new Map();
        }

        const tempId = toStringSafe(refs.tempId || bubble.dataset.tempId || '');
        const previousTempId = toStringSafe(refs.previousTempId || '');
        const cleanupMs = Number.isFinite(refs.cleanupMs) && refs.cleanupMs > 0
            ? Math.max(0, refs.cleanupMs)
            : 0;

        if (previousTempId && previousTempId !== tempId) {
            removeOptimisticBubbleRef(ctx.optimisticTempBubbles, previousTempId, bubble);
        }

        clearOptimisticTempCleanupTimer(bubble);
        if (tempId) {
            ctx.optimisticTempBubbles.set(tempId, bubble);
            if (cleanupMs > 0) {
                bubble.__optimisticTempCleanupTimer = global.setTimeout(() => {
                    if (ctx.optimisticTempBubbles instanceof Map) {
                        removeOptimisticBubbleRef(ctx.optimisticTempBubbles, tempId, bubble);
                    }
                    bubble.__optimisticTempCleanupTimer = null;
                }, cleanupMs);
            }
        }
    }

    function clearOptimisticBubbleRefs(ctx, bubble, refs = {}) {
        if (!ctx || !bubble) return;
        clearOptimisticTempCleanupTimer(bubble);

        if (ctx.optimisticTempBubbles instanceof Map) {
            const tempId = toStringSafe(refs.tempId || bubble.dataset.tempId || '');
            if (tempId) {
                removeOptimisticBubbleRef(ctx.optimisticTempBubbles, tempId, bubble);
            }
            for (const [key, value] of ctx.optimisticTempBubbles.entries()) {
                if (value === bubble) {
                    ctx.optimisticTempBubbles.delete(key);
                }
            }
        }
    }

    function findTrackedOptimisticBubble(ctx, normalizedMsg) {
        if (!ctx || !normalizedMsg) return null;

        const tempId = toStringSafe(normalizedMsg.tempId || normalizedMsg.TempId || '');

        const validateBubble = (bubble) => {
            if (!bubble || !bubble.isConnected) return null;

            const bubbleTempId = toStringSafe(bubble.dataset.tempId || '');

            if (tempId && bubbleTempId && bubbleTempId !== tempId) {
                clearOptimisticBubbleRefs(ctx, bubble, { tempId });
                return null;
            }

            return bubble;
        };

        if (tempId && ctx.optimisticTempBubbles instanceof Map) {
            const bubble = validateBubble(ctx.optimisticTempBubbles.get(tempId));
            if (bubble) return bubble;
            ctx.optimisticTempBubbles.delete(tempId);
        }

        return null;
    }

    function findOptimisticBubble(container, normalizedMsg, myAccountId = '', ctx = null) {
        if (!container || !normalizedMsg) return null;
        if (ctx) {
            const trackedBubble = findTrackedOptimisticBubble(ctx, normalizedMsg);
            if (trackedBubble) return trackedBubble;
        }

        const messageId = toLowerSafe(normalizedMsg.messageId || normalizedMsg.MessageId || '');
        if (messageId) {
            const bubble = container.querySelector(`[data-message-id="${messageId}"]`);
            if (bubble) return bubble;
        }

        const tempId = normalizedMsg.tempId || normalizedMsg.TempId || null;
        if (tempId) {
            const bubble = container.querySelector(`[data-temp-id="${tempId}"]`);
            if (bubble) return bubble;
        }

        return null;
    }

    function replaceOptimisticMediaUrls(ctx, bubble, messagePayload, tempId = null) {
        if (!ctx || !bubble || !messagePayload) return false;
        const medias = messagePayload.Medias || messagePayload.medias || [];
        if (!Array.isArray(medias) || medias.length === 0) return false;

        let replaced = false;
        medias.forEach((m, i) => {
            const mediaUrl = m.MediaUrl || m.mediaUrl;
            const mediaId = toLowerSafe(m.MessageMediaId || m.messageMediaId || '');
            if (!mediaUrl) return;

            const targetItem = bubble.querySelector(`[data-media-index="${i}"]`);
            if (!targetItem) return;

            const img = targetItem.querySelector('img');
            const vid = targetItem.querySelector('video');
            const fileLink = targetItem.querySelector('.msg-file-link');
            if (img) {
                if (img.src?.startsWith('blob:')) revokeBlobUrlIfNeeded(ctx, img.src);
                img.src = mediaUrl;
                replaced = true;
            }
            if (vid) {
                if (vid.src?.startsWith('blob:')) revokeBlobUrlIfNeeded(ctx, vid.src);
                vid.src = mediaUrl;
                replaced = true;
            }
            if (fileLink) {
                const oldHref = fileLink.getAttribute('href') || '';
                if (oldHref.startsWith('blob:')) revokeBlobUrlIfNeeded(ctx, oldHref);
                fileLink.setAttribute('href', mediaUrl);
                if (mediaId) {
                    fileLink.setAttribute('data-message-media-id', mediaId);
                } else {
                    fileLink.removeAttribute('data-message-media-id');
                }
                replaced = true;
            }
        });

        if (replaced && tempId) {
            revokeMediaUrlsForTemp(ctx, tempId);
        }

        // Update data-medias JSON on the grid so previewGridMedia reads the correct URLs
        if (replaced) {
            const grid = bubble.querySelector('.msg-media-grid');
            if (grid && grid.dataset.medias) {
                try {
                    const oldMedias = JSON.parse(grid.dataset.medias);
                    medias.forEach((m, i) => {
                        if (oldMedias[i]) {
                            const url = m.MediaUrl || m.mediaUrl;
                            const mediaId = toLowerSafe(m.MessageMediaId || m.messageMediaId || '');
                            if (url) {
                                oldMedias[i].mediaUrl = url;
                                if (oldMedias[i].MediaUrl) oldMedias[i].MediaUrl = url;
                            }
                            if (mediaId) {
                                oldMedias[i].messageMediaId = mediaId;
                                if (oldMedias[i].MessageMediaId) oldMedias[i].MessageMediaId = mediaId;
                            }
                        }
                    });
                    grid.dataset.medias = JSON.stringify(oldMedias);
                } catch (e) { /* ignore parse errors */ }
            }
        }

        return replaced;
    }

    function escapeHtml(value) {
        return (value || '')
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function replaceOptimisticTextContent(bubble, messagePayload) {
        if (!bubble || !messagePayload) return false;

        const textBubble = bubble.querySelector('.msg-bubble');
        if (!textBubble) return false;

        const rawContent = messagePayload.Content ?? messagePayload.content;
        if (typeof rawContent !== 'string') return false;

        if (global.ChatCommon && typeof global.ChatCommon.renderMessageRichContent === 'function') {
            textBubble.innerHTML = global.ChatCommon.renderMessageRichContent(rawContent);
            return true;
        }

        const normalizedRawContent = rawContent.replace(
            /@\[(?<username>[A-Za-z0-9._]{1,30})\]\((?<accountId>[0-9a-fA-F-]{36})\)/g,
            (_, username) => `@${username}`
        );
        textBubble.innerHTML = escapeHtml(normalizedRawContent);
        return true;
    }

    function buildRetryFormData({ content, tempId, files, receiverId, replyToMessageId }) {
        const formData = new FormData();
        const safeContent = typeof content === 'string' ? content.trim() : '';
        const safeFiles = Array.isArray(files) ? files : [];
        const hasText = safeContent.length > 0;

        if (hasText) formData.append('Content', safeContent);
        if (tempId) formData.append('TempId', tempId);
        safeFiles.forEach(file => formData.append('MediaFiles', file));
        if (receiverId) formData.append('ReceiverId', receiverId);
        if (replyToMessageId) formData.append('ReplyToMessageId', replyToMessageId);

        return {
            formData,
            hasText,
            hasFiles: safeFiles.length > 0
        };
    }

    function applyMessageStatus(ctx, params) {
        const {
            container,
            bubble,
            status,
            content,
            tempId,
            realMessageId,
            messagePayload,
            retryHandler,
            onPendingSeen,
            removePreviousSent
        } = params || {};

        if (!ctx || !container || !bubble) return false;

        const previousTempId = toStringSafe(bubble.dataset.tempId || '');
        bubble.dataset.status = status;

        const normalizedMessageId = realMessageId ? toLowerSafe(realMessageId) : null;
        if (normalizedMessageId) {
            bubble.dataset.messageId = normalizedMessageId;
            const seenRow = bubble.querySelector('.msg-seen-row');
            if (seenRow) {
                seenRow.id = `seen-row-${normalizedMessageId}`;
            }
            if (typeof onPendingSeen === 'function') {
                onPendingSeen(normalizedMessageId);
            }
        }

        const trackedTempId = tempId || bubble.dataset.tempId || '';
        if (status === 'pending') {
            trackOptimisticBubble(ctx, bubble, {
                tempId: trackedTempId,
                previousTempId
            });
        } else if (status === 'sent') {
            if (normalizedMessageId) {
                clearOptimisticBubbleRefs(ctx, bubble, { tempId: trackedTempId });
            } else if (trackedTempId) {
                trackOptimisticBubble(ctx, bubble, {
                    tempId: trackedTempId,
                    previousTempId,
                    cleanupMs: 15000
                });
            }
        } else {
            clearOptimisticBubbleRefs(ctx, bubble, { tempId: trackedTempId });
        }

        if (status === 'sent') {
            const hadBlobMedia = !!bubble.querySelector('img[src^="blob:"], video[src^="blob:"], .msg-file-link[href^="blob:"]');
            const replaced = replaceOptimisticMediaUrls(ctx, bubble, messagePayload, tempId);
            replaceOptimisticTextContent(bubble, messagePayload);
            ctx.retryFiles.delete(tempId);
            if (!hadBlobMedia || replaced) {
                revokeMediaUrlsForTemp(ctx, tempId);
            }

            if (typeof removePreviousSent === 'function') {
                removePreviousSent(bubble);
            } else {
                container.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach((el) => {
                    if (el !== bubble) {
                        el.removeAttribute('data-status');
                        el.querySelector('.msg-status')?.remove();
                    }
                });
            }
        }

        const existingStatus = bubble.querySelector('.msg-status');
        if (existingStatus) existingStatus.remove();

        // once a message has any seen avatar, "Sent" must not render again
        if (status === 'sent' && (bubble.dataset.status !== 'sent' || hasSeenAvatar(bubble))) {
            return true;
        }

        const statusEl = document.createElement('div');
        statusEl.className = 'msg-status';

        if (status === 'pending') {
            statusEl.className += ' msg-status-sending';
            statusEl.innerHTML = '<span class="msg-loading-dots"><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span></span>';
        } else if (status === 'sent') {
            statusEl.className += ' msg-status-sent';
            statusEl.textContent = runtimeT('chat.message.status.sent', 'Sent');
        } else if (status === 'failed') {
            statusEl.className += ' msg-status-failed';
            statusEl.textContent = runtimeT(
                'chat.message.status.failed_retry',
                'Send failed, tap to retry',
            );
            if (typeof retryHandler === 'function') {
                statusEl.onclick = () => retryHandler(tempId, content);
            }
        }

        bubble.appendChild(statusEl);
        return true;
    }

    global.ChatMessageRuntime = {
        createContext,
        normalizeIncomingMessage,
        queuePendingSeen,
        applyPendingSeenForMessage,
        trackBlobUrl,
        revokeBlobUrlIfNeeded,
        revokeMediaUrlsForTemp,
        resetOptimisticBubbleRefs,
        trackOptimisticBubble,
        clearOptimisticBubbleRefs,
        findTrackedOptimisticBubble,
        findOptimisticBubble,
        replaceOptimisticMediaUrls,
        buildRetryFormData,
        applyMessageStatus
    };
})(window);
