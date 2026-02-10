/**
 * Chat Page Module
 * Logic for the full-screen /messages page.
 * Note: The conversation list is handled by the global ChatSidebar.
 */
const ChatPage = {
    currentChatId: null,
    page: 1,
    isLoading: false,
    hasMore: true,
    pageSize: window.APP_CONFIG?.CHATPAGE_MESSAGES_PAGE_SIZE || 20,
    currentMetaData: null,
    pendingFiles: [], // Store files before sending

    async init() {
        // Cleanup old group if exists (prevent leaks across re-initializations)
        if (this.currentChatId) {
            this.leaveCurrentConversation();
        }
        
        console.log("ChatPage initialized");
        this.currentChatId = null; 
        this.page = 1;
        this.hasMore = true;
        this.isLoading = false;
        this.pendingFiles = []; 
        
        this.cacheElements();
        this.attachEventListeners();
        this.initScrollListener();
        this.handleUrlNavigation();
        this.listenForMessages();
    },

    cacheElements() {
        this.mainArea = document.getElementById('chat-main-area');
        this.chatView = document.getElementById('chat-view');
    },

    attachEventListeners() {
        const input = document.getElementById('chat-message-input');
        if (input) {
            // Set max length from config
            const maxLen = window.APP_CONFIG?.MAX_CHAT_MESSAGE_LENGTH || 1000;
            input.setAttribute('maxlength', maxLen);

            input.addEventListener('input', () => {
                input.style.height = 'auto';
                input.style.height = (input.scrollHeight) + 'px';
                
                const container = document.querySelector('.chat-view-input-container');
                const hasText = input.value.trim().length > 0;
                const hasFiles = this.pendingFiles.length > 0;
                const hasContent = hasText || hasFiles;
                
                if (container) {
                    container.classList.toggle('has-content', hasContent);
                }
                
                const sendBtn = document.getElementById('chat-page-send-btn');
                if (sendBtn) sendBtn.disabled = !hasContent;
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        const sendBtn = document.getElementById('chat-page-send-btn');
        if (sendBtn) {
            sendBtn.onclick = () => this.sendMessage();
        }

        // Toggle actions menu on click (+)
        const toggleBtn = document.querySelector('.chat-toggle-actions');
        const expansion = document.querySelector('.chat-input-expansion');
        if (toggleBtn && expansion) {
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                expansion.classList.toggle('is-show');
            };

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!expansion.contains(e.target)) {
                    expansion.classList.remove('is-show');
                }
            });
        }

        // --- NEW ACTION BUTTONS ---

        // Emoji button
        const emojiBtn = document.getElementById('chat-emoji-btn');
        const emojiContainer = document.getElementById('chat-emoji-picker-container');
        if (emojiBtn && emojiContainer) {
            emojiBtn.onclick = (e) => {
                e.stopPropagation();
                window.EmojiUtils?.togglePicker(emojiContainer, (emoji) => {
                    const input = document.getElementById('chat-message-input');
                    window.EmojiUtils.insertAtCursor(input, emoji.native);
                });
            };
            // Setup click outside to close
            window.EmojiUtils?.setupClickOutsideHandler('#chat-emoji-picker-container', '#chat-emoji-btn');
        }

        // Upload media button
        const uploadBtn = document.getElementById('chat-upload-btn');
        const fileInput = document.getElementById('chat-file-input');
        if (uploadBtn && fileInput) {
            uploadBtn.onclick = (e) => {
                e.stopPropagation();
                fileInput.click();
            };
            fileInput.onchange = () => {
                const files = fileInput.files;
                if (files.length > 0) {
                    this.handleMediaUpload(files);
                    fileInput.value = ''; // Reset
                }
            };
        }

        // Attachment button (coming soon)
        const attachBtn = document.getElementById('chat-attachment-btn');
        if (attachBtn) {
            attachBtn.onclick = (e) => {
                e.stopPropagation();
                if (window.toastInfo) window.toastInfo("Feature coming soon");
            };
        }
    },

    initScrollListener() {
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;

        msgContainer.onscroll = () => {
            if (this.isLoading || !this.hasMore) return;
            
            // If scrolled to top (threshold 50px)
            if (msgContainer.scrollTop <= 50) {
                this.loadMessages(this.currentChatId, true);
            }
        };
    },

    listenForMessages() {
        // Stop duplicate listeners if any
        if (window.chatHubConnection) {
            window.chatHubConnection.off('ReceiveNewMessage');
            window.chatHubConnection.on('ReceiveNewMessage', (msg) => {
                const convId = msg.conversationId;
                if (this.currentChatId === convId) {
                    // 1. Check if message already exists in DOM (by real ID)
                    if (msg.messageId && document.querySelector(`[data-message-id="${msg.messageId}"]`)) {
                        return;
                    }

                    // 2. Try to merge with an optimistic bubble if it's our own message
                    const myId = localStorage.getItem('accountId');
                    if (msg.sender?.accountId === myId) {
                        // Find a pending/sent bubble with same content
                        const optimisticMsg = document.querySelector(`.msg-bubble-wrapper.sent[data-status="pending"], .msg-bubble-wrapper.sent[data-status="sent"]`);
                        if (optimisticMsg) {
                            const content = optimisticMsg.querySelector('.msg-bubble')?.innerText.trim();
                            if (content === msg.content?.trim()) {
                                // Found match! Merge real data into optimistic bubble
                                optimisticMsg.dataset.messageId = msg.messageId;
                                delete optimisticMsg.dataset.status;
                                optimisticMsg.querySelector('.msg-status')?.remove();
                                return;
                            }
                        }
                    }

                    this.appendMessage(msg);
                    
                    // Also notify Sidebar to update last message/unread
                    if (window.ChatSidebar && typeof window.ChatSidebar.loadConversations === 'function') {
                        window.ChatSidebar.loadConversations();
                    }
                } else {
                    // Message from other conversation -> Refresh sidebar to show unread badge
                    if (window.ChatSidebar && typeof window.ChatSidebar.loadConversations === 'function') {
                        window.ChatSidebar.loadConversations();
                    }
                }
            });
        } else {
            // Retry if hub not started yet
            setTimeout(() => this.listenForMessages(), 1000);
        }
    },

    handleUrlNavigation() {
        const hash = window.location.hash;
        if (hash.includes('?id=')) {
            const id = hash.split('?id=')[1].split('&')[0];
            if (id) this.selectConversation(id);
        }
    },

    leaveCurrentConversation() {
        if (this.currentChatId) {
            const oldId = this.currentChatId;
            
            if (window.chatHubConnection && window.chatHubConnection.state === signalR.HubConnectionState.Connected) {
                // Only leave if not open in any floating ChatWindow
                const isOpenInWindow = window.ChatWindow && window.ChatWindow.openChats && window.ChatWindow.openChats.has(oldId);
                
                if (!isOpenInWindow) {
                    window.chatHubConnection.invoke("LeaveConversation", oldId)
                        .then(() => console.log(`👋 Left Conv-${oldId} group`))
                        .catch(err => console.error("Error leaving conversation group:", err));
                }
            }
            this.currentChatId = null;
        }
    },

    async selectConversation(id) {
        if (!id) return;
        
        // If switching to a DIFFERENT conversation, leave the old group first
        if (this.currentChatId && this.currentChatId !== id) {
            this.leaveCurrentConversation();
        }

        // Reset state for new chat
        if (this.currentChatId !== id) {
            this.currentChatId = id;
            this.page = 1;
            this.hasMore = true;
            this.isLoading = false;
        }

        // Visual update in Sidebar anyway
        if (window.ChatSidebar) {
            window.ChatSidebar.updateActiveId(id);
        }

        await this.loadMessages(id, false);

        // Join the SignalR group for this conversation
        if (window.chatHubConnection && window.chatHubConnection.state === signalR.HubConnectionState.Connected) {
            // Validate if ID is a real GUID before joining (prevent server errors for "new-" or profile IDs)
            const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
            if (isGuid) {
                window.chatHubConnection.invoke("JoinConversation", id)
                    .then(() => console.log(`✅ Joined Conv-${id} group`))
                    .catch(err => console.error("Error joining conversation group:", err));
            } else {
                console.log(`ℹ️ Skip JoinConversation for non-GUID ID: ${id}`);
            }
        }
    },

    renderHeader(meta) {
        if (!meta) return;

        const img = document.getElementById('chat-view-img');
        const nameEl = document.getElementById('chat-view-name');
        const statusText = document.getElementById('chat-view-status-text');
        const statusDot = document.getElementById('chat-view-status-dot');

        if (img) {
            const avatarUrl = ChatCommon.getAvatar(meta);
            img.src = avatarUrl;
            // Ensure image is visible or use default if load fails
            img.onerror = () => { img.src = window.APP_CONFIG?.DEFAULT_AVATAR; };
        }
        if (nameEl) nameEl.innerText = ChatCommon.getDisplayName(meta) || 'Chat';
        
        if (statusText) {
            if (!meta.isGroup && meta.otherMember) {
                statusText.innerText = meta.otherMember.isActive ? 'Active now' : 'Offline';
                if (statusDot) statusDot.classList.toggle('hidden', !meta.otherMember.isActive);
            } else {
                statusText.innerText = 'Group chat';
                if (statusDot) statusDot.classList.add('hidden');
            }
        }
    },

    async loadMessages(id, isLoadMore = false) {
        if (this.isLoading) return;
        if (isLoadMore && !this.hasMore) return;

        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;
        
        this.isLoading = true;
        const oldScrollHeight = msgContainer.scrollHeight;

        if (!isLoadMore) {
            msgContainer.innerHTML = '<div class="chat-messages-loader"><div class="spinner spinner-large"></div></div>';
        }

        try {
            const res = await window.API.Conversations.getMessages(id, this.page, this.pageSize);
            if (res.ok) {
                const data = await res.json();
                
                if (data.metaData) {
                    this.currentMetaData = data.metaData;
                    this.renderHeader(data.metaData);
                }

                const messages = data.messages.items || [];
                if (!isLoadMore) msgContainer.innerHTML = '';
                
                if (messages.length < this.pageSize) {
                    this.hasMore = false;
                }

                // API returns newest first, we want oldest first for display
                const chatItems = [...messages].reverse();
                
                // Determine if we need a separator between the prepend-batch and existing messages
                // or between messages within the batch.
                const html = this.renderMessageList(chatItems, isLoadMore);
                
                if (isLoadMore) {
                    msgContainer.insertAdjacentHTML('afterbegin', html);
                    requestAnimationFrame(() => {
                        msgContainer.scrollTop = msgContainer.scrollHeight - oldScrollHeight;
                    });
                } else {
                    msgContainer.innerHTML = html;
                    requestAnimationFrame(() => {
                        msgContainer.scrollTop = msgContainer.scrollHeight;
                    });
                }

                this.page++;
            }
        } catch (error) {
            console.error("Failed to load messages:", error);
            if (!isLoadMore) msgContainer.innerHTML = '<div style="text-align:center; padding:20px;">Error loading messages</div>';
        } finally {
            this.isLoading = false;
        }
    },

    renderMessageList(messages, isPrepend = false) {
        if (!messages.length) return '';
        
        const isGroup = !!this.currentMetaData?.isGroup;
        const myId = localStorage.getItem('accountId');
        let html = '';
        let lastTime = null;

        messages.forEach((m, idx) => {
            // Support both camelCase and PascalCase for medias
            if (!m.medias && m.Medias) m.medias = m.Medias;
            
            const currentTime = new Date(m.sentAt);
            const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
            if (!lastTime || (currentTime - lastTime > gap)) {
                html += ChatCommon.renderChatSeparator(m.sentAt);
            }

            m.isOwn = m.sender?.accountId === myId;

            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
            const groupPos = ChatCommon.getGroupPosition(m, prevMsg, nextMsg);

            const senderAvatar = !m.isOwn ? (m.sender?.avatarUrl || '') : '';
            const authorName = isGroup && !m.isOwn
                ? (m.sender?.nickname || m.sender?.fullName || m.sender?.username || '')
                : '';

            html += ChatCommon.renderMessageBubble(m, {
                isGroup,
                groupPos,
                senderAvatar,
                authorName
            });

            lastTime = currentTime;
        });

        return html;
    },

    appendMessage(msg) {
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;

        const isGroup = !!this.currentMetaData?.isGroup;
        const myId = localStorage.getItem('accountId');
        const isOwn = msg.sender?.accountId === myId || msg.isOwn;
        msg.isOwn = isOwn;

        // Time separator
        const lastMsgEl = msgContainer.querySelector('.msg-bubble-wrapper:last-of-type');
        const lastTime = lastMsgEl ? new Date(lastMsgEl.dataset.sentAt) : null;
        const currentTime = new Date(msg.sentAt);
        const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
        if (!lastTime || (currentTime - lastTime > gap)) {
            msgContainer.insertAdjacentHTML('beforeend', ChatCommon.renderChatSeparator(msg.sentAt));
        }

        // Determine grouping with the previous message in DOM
        let prevSenderId = lastMsgEl ? lastMsgEl.dataset.senderId : null;
        let prevTime = lastTime;
        const groupGap = window.APP_CONFIG?.CHAT_GROUPING_GAP || 2 * 60 * 1000;
        const sameSender = prevSenderId && prevSenderId === (msg.sender?.accountId || myId);
        const closeTime = prevTime && (currentTime - prevTime < groupGap);
        const groupedWithPrev = sameSender && closeTime;

        // New message is always 'last' or 'single' in its group (nothing comes after)
        const groupPos = groupedWithPrev ? 'last' : 'single';

        // Update previous message's groupPos if we're grouping with it
        if (groupedWithPrev && lastMsgEl) {
            if (lastMsgEl.classList.contains('msg-group-single')) {
                lastMsgEl.classList.replace('msg-group-single', 'msg-group-first');
            } else if (lastMsgEl.classList.contains('msg-group-last')) {
                lastMsgEl.classList.replace('msg-group-last', 'msg-group-middle');
            }
            // Update avatar visibility on previous message
            const prevAvatar = lastMsgEl.querySelector('.msg-avatar');
            if (prevAvatar && !prevAvatar.classList.contains('msg-avatar-spacer')) {
                prevAvatar.classList.add('msg-avatar-spacer');
                prevAvatar.innerHTML = '';
            }
        }

        const senderAvatar = !isOwn ? (msg.sender?.avatarUrl || '') : '';
        const authorName = isGroup && !isOwn
            ? (msg.sender?.nickname || msg.sender?.fullName || msg.sender?.username || '')
            : '';
        if (!msg.sender?.accountId) msg.senderId = myId;

        const div = document.createElement('div');
        div.innerHTML = ChatCommon.renderMessageBubble(msg, {
            isGroup,
            groupPos,
            senderAvatar,
            authorName
        });

        const bubble = div.firstElementChild;
        bubble.dataset.sentAt = msg.sentAt;
        bubble.dataset.senderId = msg.sender?.accountId || myId;
        
        // track temp id and status for optimistic UI
        if (msg.tempId) {
            bubble.dataset.tempId = msg.tempId;
        }
        if (msg.status) {
            bubble.dataset.status = msg.status;
            
            // render initial status immediately
            const statusEl = document.createElement('div');
            statusEl.className = 'msg-status';
            
            if (msg.status === 'pending') {
                statusEl.className += ' msg-status-sending';
                statusEl.innerHTML = '<span class="msg-loading-dots"><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span></span>';
            } else if (msg.status === 'sent') {
                statusEl.className += ' msg-status-sent';
                statusEl.textContent = 'Sent';
            } else if (msg.status === 'failed') {
                statusEl.className += ' msg-status-failed';
                statusEl.textContent = 'Failed to send. Click to retry.';
            }
            
            bubble.appendChild(statusEl);
        }
        
        msgContainer.appendChild(bubble);
        msgContainer.scrollTop = msgContainer.scrollHeight;
    },

    async sendMessage() {
        const input = document.getElementById('chat-message-input');
        const content = input.value.trim();
        if ((!content && this.pendingFiles.length === 0) || !this.currentChatId) return;

        // generate temp message id
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Prepare local preview URLs for optimistic UI if there are files
        const medias = this.pendingFiles.map(file => ({
            mediaUrl: URL.createObjectURL(file), // Local preview link
            mediaType: file.type.startsWith('video/') ? 1 : 0
        }));

        // optimistic ui - show message immediately with pending state
        this.appendMessage({ 
            tempId,
            content, 
            medias: medias.length > 0 ? medias : null,
            sentAt: new Date(), 
            isOwn: true,
            status: 'pending'
        });
        
        // Prepare data for real upload
        const filesToSend = [...this.pendingFiles];

        // Clear input and pending state immediately
        input.value = '';
        input.style.height = 'auto';
        this.pendingFiles = [];
        this.updateAttachmentPreview();
        this.updateInputState();

        const formData = new FormData();
        if (content) formData.append('Content', content);
        filesToSend.forEach(file => {
            formData.append('MediaFiles', file);
        });

        try {
            let res;
            
            if (this.currentMetaData && this.currentMetaData.isGroup) {
                // group chat - use group API
                res = await window.API.Messages.sendGroup(this.currentChatId, formData);
            } else if (this.currentMetaData && this.currentMetaData.otherMember) {
                // private chat - use private API with receiverId
                formData.append('ReceiverId', this.currentMetaData.otherMember.accountId);
                res = await window.API.Messages.sendPrivate(formData);
            } else {
                console.error("Cannot determine chat type or missing metadata");
                this.updateMessageStatus(tempId, 'failed', content);
                return;
            }
            
            if (res.ok) {
                const msg = await res.json();
                this.updateMessageStatus(tempId, 'sent', content, msg.messageId);
            } else {
                this.updateMessageStatus(tempId, 'failed', content);
            }
        } catch (error) {
            console.error("Failed to send message:", error);
            this.updateMessageStatus(tempId, 'failed', content);
        }
    },

    updateInputState() {
        const input = document.getElementById('chat-message-input');
        const container = document.querySelector('.chat-view-input-container');
        const sendBtn = document.getElementById('chat-page-send-btn');
        
        const hasText = input?.value.trim().length > 0;
        const hasFiles = this.pendingFiles.length > 0;
        const hasContent = hasText || hasFiles;

        if (container) container.classList.toggle('has-content', hasContent);
        if (sendBtn) sendBtn.disabled = !hasContent;
    },

    async handleMediaUpload(files) {
        if (!files || files.length === 0 || !this.currentChatId) return;

        const maxFiles = window.APP_CONFIG?.MAX_CHAT_MEDIA_FILES || 5;
        const maxSizeMB = window.APP_CONFIG?.MAX_CHAT_FILE_SIZE_MB || 10;
        const currentCount = this.pendingFiles.length;
        
        if (currentCount + files.length > maxFiles) {
            if (window.toastError) window.toastError(`Maximum ${maxFiles} files allowed`);
            return;
        }

        const validFiles = [];
        for (let file of files) {
            if (file.size > maxSizeMB * 1024 * 1024) {
                if (window.toastError) window.toastError(`File "${file.name}" is too large (Max ${maxSizeMB}MB)`);
                continue;
            }
            validFiles.push(file);
        }

        if (validFiles.length === 0) return;

        // Add to pending list instead of sending
        this.pendingFiles.push(...validFiles);
        this.updateAttachmentPreview();
        this.updateInputState();
    },

    updateAttachmentPreview() {
        const previewEl = document.getElementById('chat-attachment-preview');
        if (!previewEl) return;

        previewEl.innerHTML = '';
        
        this.pendingFiles.forEach((file, index) => {
            const isVideo = file.type.startsWith('video/');
            const url = URL.createObjectURL(file);

            const item = document.createElement('div');
            item.className = 'chat-preview-item';
            
            if (isVideo) {
                item.innerHTML = `
                    <video src="${url}"></video>
                    <div class="chat-preview-remove" onclick="ChatPage.removeAttachment(${index})">
                        <i data-lucide="x"></i>
                    </div>
                `;
            } else {
                item.innerHTML = `
                    <img src="${url}" alt="preview">
                    <div class="chat-preview-remove" onclick="ChatPage.removeAttachment(${index})">
                        <i data-lucide="x"></i>
                    </div>
                `;
            }
            previewEl.appendChild(item);
        });

        // Add the "+" button like Facebook Messenger if under limit
        const maxFiles = window.APP_CONFIG?.MAX_CHAT_MEDIA_FILES || 10;
        if (this.pendingFiles.length > 0 && this.pendingFiles.length < maxFiles) {
            const addBtn = document.createElement('div');
            addBtn.className = 'chat-preview-add-btn';
            addBtn.innerHTML = '<i data-lucide="plus"></i>';
            addBtn.onclick = () => document.getElementById('chat-file-input').click();
            previewEl.appendChild(addBtn);
        }

        if (window.lucide) lucide.createIcons();
    },

    removeAttachment(index) {
        this.pendingFiles.splice(index, 1);
        this.updateAttachmentPreview();
        this.updateInputState();
    },

    updateMessageStatus(tempId, status, content, realMessageId = null) {
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;
        
        const msgEl = msgContainer.querySelector(`[data-temp-id="${tempId}"]`);
        if (!msgEl) return;
        
        msgEl.dataset.status = status;
        
        if (realMessageId) {
            msgEl.dataset.messageId = realMessageId;
        }
        
        // remove any existing status
        const existingStatus = msgEl.querySelector('.msg-status');
        if (existingStatus) existingStatus.remove();
        
        // create status element below bubble
        const statusEl = document.createElement('div');
        statusEl.className = 'msg-status';
        
        if (status === 'pending') {
            statusEl.className += ' msg-status-sending';
            statusEl.innerHTML = '<span class="msg-loading-dots"><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span><span class="msg-loading-dot"></span></span>';
        } else if (status === 'sent') {
            statusEl.className += ' msg-status-sent';
            statusEl.textContent = 'Sent';
        } else if (status === 'failed') {
            statusEl.className += ' msg-status-failed';
            statusEl.textContent = 'Failed to send. Click to retry.';
            statusEl.onclick = () => this.retryMessage(tempId, content);
        }
        
        msgEl.appendChild(statusEl);
    },

    async retryMessage(tempId, content) {
        const msgContainer = document.getElementById('chat-view-messages');
        if (!msgContainer) return;
        
        const msgEl = msgContainer.querySelector(`[data-temp-id="${tempId}"]`);
        if (!msgEl) return;
        
        // update to pending
        this.updateMessageStatus(tempId, 'pending', content);
        
        const formData = new FormData();
        formData.append('Content', content);
        
        try {
            let res;
            
            if (this.currentMetaData && this.currentMetaData.isGroup) {
                res = await window.API.Messages.sendGroup(this.currentChatId, formData);
            } else if (this.currentMetaData && this.currentMetaData.otherMember) {
                formData.append('ReceiverId', this.currentMetaData.otherMember.accountId);
                res = await window.API.Messages.sendPrivate(formData);
            } else {
                this.updateMessageStatus(tempId, 'failed', content);
                return;
            }
            
            if (res.ok) {
                const msg = await res.json();
                this.updateMessageStatus(tempId, 'sent', content, msg.messageId);
            } else {
                this.updateMessageStatus(tempId, 'failed', content);
            }
        } catch (error) {
            console.error("Failed to retry message:", error);
            this.updateMessageStatus(tempId, 'failed', content);
        }
    }
};

window.initChatPage = () => ChatPage.init();
window.ChatPage = ChatPage;
