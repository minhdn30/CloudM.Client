/**
 * Chat Window Module (formerly ChatMessenger)
 * Handles floating chat windows for quick conversations.
 */
const ChatWindow = {
    openChats: new Map(), // conversationId -> DOM elements
    
    init() {
        if (!document.getElementById('chat-container')) {
            const container = document.createElement('div');
            container.id = 'chat-container';
            container.className = 'chat-window-container'; // Better class name
            document.body.appendChild(container);
        }
    },

    openChat(conv) {
        if (!conv) return;
        const convId = conv.conversationId;

        if (this.openChats.has(convId)) {
            const chatBox = this.openChats.get(convId).element;
            chatBox.classList.add('show');
            chatBox.classList.remove('minimized');
            return;
        }

        if (this.openChats.size >= 3) {
            const firstId = this.openChats.keys().next().value;
            this.closeChat(firstId);
        }

        this.renderChatBox(conv);
        this.loadInitialMessages(convId);
    },

    async openByAccountId(accountId) {
        if (!accountId) return;
        
        // Find if already open
        for (const [id, chat] of this.openChats) {
            if (chat.data.otherMember?.accountId === accountId) {
                this.openChat(chat.data);
                return;
            }
        }

        try {
            const res = await window.API.Conversations.getPrivateWithMessages(accountId);
            if (res.ok) {
                const data = await res.json();
                const chatData = data.metaData;
                
                // If it's a new chat, we need a temp ID for the UI
                if (data.isNew || !chatData.conversationId || chatData.conversationId === '00000000-0000-0000-0000-000000000000') {
                    chatData.conversationId = `new-${accountId}`;
                }
                
                this.openChat(chatData);
            }
        } catch (error) {
            console.error("Failed to open chat by account ID:", error);
        }
    },

    renderChatBox(conv) {
        const container = document.getElementById('chat-container');
        const avatar = ChatCommon.getAvatar(conv);
        const name = escapeHtml(ChatCommon.getDisplayName(conv));
        const subtext = conv.isGroup ? 'Group Chat' : (conv.otherMember?.isActive ? 'Online' : 'Offline');

        const chatBox = document.createElement('div');
        chatBox.className = 'chat-box';
        chatBox.id = `chat-box-${conv.conversationId}`;
        chatBox.innerHTML = `
            <div class="chat-box-header" onclick="ChatWindow.toggleMinimize('${conv.conversationId}')">
                <div class="chat-header-info">
                    <div class="chat-header-avatar">
                        <img src="${avatar}" alt="${name}" onerror="this.src='${APP_CONFIG.DEFAULT_AVATAR}'">
                        ${!conv.isGroup && conv.otherMember?.isActive ? '<div class="chat-header-status"></div>' : ''}
                    </div>
                    <div class="chat-header-text">
                        <div class="chat-header-name" title="${name}">${name}</div>
                        <div class="chat-header-subtext">${subtext}</div>
                    </div>
                </div>
                <div class="chat-header-actions">
                    <button class="chat-btn" onclick="event.stopPropagation(); ChatWindow.toggleMinimize('${conv.conversationId}')">
                        <i data-lucide="minus"></i>
                    </button>
                    <button class="chat-btn close" onclick="event.stopPropagation(); ChatWindow.closeChat('${conv.conversationId}')">
                        <i data-lucide="x"></i>
                    </button>
                </div>
            </div>
            <div class="chat-messages" id="chat-messages-${conv.conversationId}">
                <div style="flex:1; display:flex; align-items:center; justify-content:center; color:var(--text-tertiary); font-size:12px;">
                    Starting chat...
                </div>
            </div>
            <div class="chat-input-area">
                <div class="chat-input-wrapper">
                    <button class="chat-add-media-btn"><i data-lucide="plus"></i></button>
                    <div class="chat-input-field" contenteditable="true" placeholder="Type a message..." 
                         oninput="ChatWindow.handleInput(this, '${conv.conversationId}')"
                         onkeydown="ChatWindow.handleKeyDown(event, '${conv.conversationId}')"></div>
                    <div class="chat-input-actions-end">
                        <button class="chat-emoji-btn"><i data-lucide="smile"></i></button>
                        <button class="chat-send-btn" id="send-btn-${conv.conversationId}" disabled onclick="ChatWindow.sendMessage('${conv.conversationId}')">
                            <i data-lucide="send"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        container.appendChild(chatBox);
        setTimeout(() => chatBox.classList.add('show'), 10);

        this.openChats.set(conv.conversationId, {
            element: chatBox,
            data: conv,
            page: 1,
            hasMore: true,
            isLoading: false
        });
        lucide.createIcons();
        this.loadInitialMessages(conv.conversationId);
    },

    toggleMinimize(id) {
        const chat = this.openChats.get(id);
        if (chat) chat.element.classList.toggle('minimized');
    },

    closeChat(id) {
        const chat = this.openChats.get(id);
        if (chat) {
            chat.element.classList.remove('show');
            setTimeout(() => {
                chat.element.remove();
                this.openChats.delete(id);
            }, 300);
        }
    },

    handleInput(field, id) {
        const sendBtn = document.getElementById(`send-btn-${id}`);
        sendBtn.disabled = field.innerText.trim().length === 0;
        
        // Toggle 'expanded' class based on field height
        const wrapper = field.closest('.chat-input-wrapper');
        if (wrapper) {
            // If field height > 32px (single line), it's expanded
            wrapper.classList.toggle('expanded', field.scrollHeight > 32);
        }
    },

    handleKeyDown(event, id) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage(id);
        }
    },

    async loadInitialMessages(id) {
        const msgContainer = document.getElementById(`chat-messages-${id}`);
        if (!msgContainer) return;

        if (id.startsWith('new-')) {
            msgContainer.innerHTML = '<div style="padding:20px; font-size:12px; text-align:center; color:var(--text-tertiary);">Say hello!</div>';
            return;
        }

        const pageSize = window.APP_CONFIG?.CHATWINDOW_MESSAGES_PAGE_SIZE || 10;
        const chat = this.openChats.get(id);
        const isGroup = chat?.data?.isGroup || false;
        const myId = localStorage.getItem('accountId');

        try {
            const res = await window.API.Conversations.getMessages(id, 1, pageSize);
            if (res.ok) {
                const data = await res.json();
                msgContainer.innerHTML = '';
                const messages = (data.messages?.items || []).reverse();

                let lastTime = null;

                messages.forEach((m, idx) => {
                    m.isOwn = m.sender?.accountId === myId;

                    // Time separator (same logic as chat-page: 15 min gap)
                    const currentTime = new Date(m.sentAt);
                    if (!lastTime || (currentTime - lastTime > 15 * 60 * 1000)) {
                        msgContainer.insertAdjacentHTML('beforeend', ChatCommon.renderChatSeparator(m.sentAt));
                    }
                    lastTime = currentTime;

                    const prevMsg = idx > 0 ? messages[idx - 1] : null;
                    const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
                    const groupPos = ChatCommon.getGroupPosition(m, prevMsg, nextMsg);

                    const senderAvatar = !m.isOwn ? (m.sender?.avatarUrl || '') : '';
                    const authorName = isGroup && !m.isOwn
                        ? (m.sender?.nickname || m.sender?.fullName || m.sender?.username || '')
                        : '';

                    const html = ChatCommon.renderMessageBubble(m, {
                        isGroup,
                        groupPos,
                        senderAvatar,
                        authorName
                    });

                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = html;
                    const bubble = tempDiv.firstElementChild;
                    bubble.dataset.sentAt = m.sentAt;
                    bubble.dataset.senderId = m.sender?.accountId || myId;
                    msgContainer.appendChild(bubble);
                });

                requestAnimationFrame(() => {
                    msgContainer.scrollTop = msgContainer.scrollHeight;
                });

                // Update pagination state
                const pageSize = window.APP_CONFIG?.CHATWINDOW_MESSAGES_PAGE_SIZE || 10;
                chat.page = 2;
                chat.hasMore = messages.length >= pageSize;

                // Attach scroll listener for load-more
                this.initScrollListener(id);
            }
        } catch (error) {
            console.error("Failed to load chat window messages:", error);
            msgContainer.innerHTML = '<div style="padding:10px; font-size:11px; text-align:center;">Error loading messages</div>';
        }
    },

    initScrollListener(id) {
        const msgContainer = document.getElementById(`chat-messages-${id}`);
        if (!msgContainer) return;

        msgContainer.onscroll = () => {
            const chat = this.openChats.get(id);
            if (!chat || chat.isLoading || !chat.hasMore) return;

            // If scrolled near top (threshold 30px for compact window)
            if (msgContainer.scrollTop <= 30) {
                this.loadMoreMessages(id);
            }
        };
    },

    async loadMoreMessages(id) {
        const chat = this.openChats.get(id);
        const msgContainer = document.getElementById(`chat-messages-${id}`);
        if (!chat || !msgContainer || chat.isLoading || !chat.hasMore) return;

        chat.isLoading = true;
        const pageSize = window.APP_CONFIG?.CHATWINDOW_MESSAGES_PAGE_SIZE || 10;
        const isGroup = chat.data?.isGroup || false;
        const myId = localStorage.getItem('accountId');
        const oldScrollHeight = msgContainer.scrollHeight;

        try {
            const res = await window.API.Conversations.getMessages(id, chat.page, pageSize);
            if (res.ok) {
                const data = await res.json();
                const messages = (data.messages?.items || []).reverse();

                if (messages.length < pageSize) {
                    chat.hasMore = false;
                }

                // Build HTML to prepend
                let html = '';
                let lastTime = null;

                messages.forEach((m, idx) => {
                    m.isOwn = m.sender?.accountId === myId;

                    const currentTime = new Date(m.sentAt);
                    if (!lastTime || (currentTime - lastTime > 15 * 60 * 1000)) {
                        html += ChatCommon.renderChatSeparator(m.sentAt);
                    }
                    lastTime = currentTime;

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
                });

                msgContainer.insertAdjacentHTML('afterbegin', html);

                // Maintain scroll position
                requestAnimationFrame(() => {
                    msgContainer.scrollTop = msgContainer.scrollHeight - oldScrollHeight;
                });

                chat.page++;
            }
        } catch (error) {
            console.error("Failed to load more messages:", error);
        } finally {
            chat.isLoading = false;
        }
    },

    appendMessage(id, msg) {
        const chat = this.openChats.get(id);
        const msgContainer = document.getElementById(`chat-messages-${id}`);
        if (!msgContainer || !chat) return;

        const isGroup = chat.data.isGroup;
        const myId = localStorage.getItem('accountId');
        if (msg.isOwn === undefined) {
            msg.isOwn = msg.sender?.accountId === myId;
        }

        // Time separator
        const lastMsgEl = msgContainer.querySelector('.msg-bubble-wrapper:last-of-type');
        const prevTime = lastMsgEl ? new Date(lastMsgEl.dataset.sentAt) : null;
        const currentTime = new Date(msg.sentAt);
        if (!prevTime || (currentTime - prevTime > 15 * 60 * 1000)) {
            msgContainer.insertAdjacentHTML('beforeend', ChatCommon.renderChatSeparator(msg.sentAt));
        }

        // Determine grouping with the last message in the container
        const prevSenderId = lastMsgEl ? lastMsgEl.dataset.senderId : null;
        const twoMin = 2 * 60 * 1000;
        const sameSender = prevSenderId && prevSenderId === (msg.sender?.accountId || myId);
        const closeTime = prevTime && (currentTime - prevTime < twoMin);
        const groupedWithPrev = sameSender && closeTime;

        const groupPos = groupedWithPrev ? 'last' : 'single';

        // Update previous message
        if (groupedWithPrev && lastMsgEl) {
            if (lastMsgEl.classList.contains('msg-group-single')) {
                lastMsgEl.classList.replace('msg-group-single', 'msg-group-first');
            } else if (lastMsgEl.classList.contains('msg-group-last')) {
                lastMsgEl.classList.replace('msg-group-last', 'msg-group-middle');
            }
            const prevAvatar = lastMsgEl.querySelector('.msg-avatar');
            if (prevAvatar && !prevAvatar.classList.contains('msg-avatar-spacer')) {
                prevAvatar.classList.add('msg-avatar-spacer');
                prevAvatar.innerHTML = '';
            }
        }

        const senderAvatar = !msg.isOwn ? (msg.sender?.avatarUrl || '') : '';
        const authorName = isGroup && !msg.isOwn
            ? (msg.sender?.nickname || msg.sender?.fullName || msg.sender?.username || '')
            : '';
        if (!msg.sender?.accountId) msg.senderId = myId;

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = ChatCommon.renderMessageBubble(msg, {
            isGroup,
            groupPos,
            senderAvatar,
            authorName
        });

        const bubble = tempDiv.firstElementChild;
        bubble.dataset.sentAt = msg.sentAt;
        bubble.dataset.senderId = msg.sender?.accountId || myId;
        msgContainer.appendChild(bubble);
        msgContainer.scrollTop = msgContainer.scrollHeight;
    },

    async sendMessage(id) {
        const chat = this.openChats.get(id);
        if (!chat) return;
        
        const inputField = chat.element.querySelector('.chat-input-field');
        const content = inputField.innerText.trim();
        
        if (!content) return;

        // Local UI feedback
        this.appendMessage(id, { content, sentAt: new Date(), isOwn: true });
        inputField.innerText = '';
        inputField.focus();
        
        const sendBtn = document.getElementById(`send-btn-${id}`);
        if (sendBtn) sendBtn.disabled = true;

        const formData = new FormData();
        formData.append('Content', content);

        if (id.startsWith('new-')) {
            const receiverId = id.replace('new-', '');
            formData.append('ReceiverId', receiverId);
        } else if (!chat.data.isGroup && chat.data.otherMember) {
            formData.append('ReceiverId', chat.data.otherMember.accountId);
        } else {
            console.warn("Sending to group from window not yet fully supported or missing receiverId.");
            return;
        }

        try {
            const res = await window.API.Messages.sendPrivate(formData);
            if (res.ok) {
                const msg = await res.json();
                
                // If it was a 'new-' chat, we now have a real conversationId
                if (id.startsWith('new-')) {
                    const realId = msg.conversationId;
                    
                    // Update mapping
                    this.openChats.delete(id);
                    chat.data.conversationId = realId;
                    this.openChats.set(realId, chat);
                    
                    // Update DOM
                    chat.element.id = `chat-box-${realId}`;
                    const msgContainer = chat.element.querySelector('.chat-messages');
                    if (msgContainer) msgContainer.id = `chat-messages-${realId}`;
                    
                    if (sendBtn) sendBtn.id = `send-btn-${realId}`;
                    
                    // Update handlers
                    chat.element.querySelector('.chat-box-header').onclick = () => this.toggleMinimize(realId);
                    chat.element.querySelector('.chat-input-field').onkeydown = (e) => this.handleKeyDown(e, realId);
                    chat.element.querySelector('.chat-input-field').oninput = (e) => this.handleInput(e, realId);
                    chat.element.querySelector('.chat-send-btn').onclick = () => this.sendMessage(realId);

                    // Re-render header to remove any temp state if needed (though metadata should be same)
                }
            }
        } catch (error) {
            console.error("Failed to send message from window:", error);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => ChatWindow.init());
window.ChatWindow = ChatWindow;
window.ChatMessenger = ChatWindow;
