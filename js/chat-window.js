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
        this.listenForMessages();
    },

    listenForMessages() {
        if (window.chatHubConnection) {
            window.chatHubConnection.on('ReceiveNewMessage', (msg) => {
                const convId = msg.conversationId;
                if (this.openChats.has(convId)) {
                    // De-duplication check
                    if (msg.messageId && document.querySelector(`#chat-messages-${convId} [data-message-id="${msg.messageId}"]`)) {
                        return;
                    }

                    // Try to merge with optimistic bubble
                    const myId = (localStorage.getItem('accountId') || '').toLowerCase();
                    const senderId = (msg.sender?.accountId || '').toLowerCase();
                    if (senderId === myId) {
                        const msgContainer = document.getElementById(`chat-messages-${convId}`);
                        const optimisticMsg = msgContainer?.querySelector(`.msg-bubble-wrapper.sent[data-status="pending"], .msg-bubble-wrapper.sent[data-status="sent"]`);
                        if (optimisticMsg) {
                            const content = optimisticMsg.querySelector('.msg-bubble')?.innerText.trim();
                            if (content === msg.content?.trim()) {
                                optimisticMsg.dataset.messageId = msg.messageId;
                                delete optimisticMsg.dataset.status;
                                optimisticMsg.querySelector('.msg-status')?.remove();
                                if (window.ChatSidebar && typeof window.ChatSidebar.incrementUnread === 'function') {
                                    window.ChatSidebar.incrementUnread(convId, msg);
                                }
                                return;
                            }
                        }
                    }

                    this.appendMessage(convId, msg);
                    
                    // DO NOT mark as seen immediately. Only when focused/clicked.
                    // However, if the window IS already focused, we can seen it.
                    const chatBox = document.getElementById(`chat-box-${convId}`);
                    if (chatBox && chatBox.classList.contains('is-focused')) {
                        this.markConversationSeen(convId, msg.messageId);
                    }
                }
            });

            // 2. Member Seen Status Update
            window.chatHubConnection.on('MemberSeen', (data) => {
                const convId = data.ConversationId || data.conversationId;
                const accId = data.AccountId || data.accountId;
                const msgId = data.LastSeenMessageId || data.lastSeenMessageId;

                if (this.openChats.has(convId)) {
                    this.moveSeenAvatar(convId, accId, msgId);
                }
            });
        } else {
            setTimeout(() => this.listenForMessages(), 1000);
        }
    },

    /**
     * Mark a conversation as seen (read).
     */
    markConversationSeen(conversationId, messageId) {
        if (!conversationId || !messageId) return;
        const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversationId);
        if (!isGuid) return;

        if (window.chatHubConnection && window.chatHubConnection.state === signalR.HubConnectionState.Connected) {
            window.chatHubConnection.invoke('SeenConversation', conversationId, messageId)
                .then(() => {
                    if (window.ChatSidebar) {
                        const conv = window.ChatSidebar.conversations.find(c => c.conversationId === conversationId);
                        const wasUnread = conv && conv.unreadCount > 0;
                        window.ChatSidebar.clearUnread(conversationId);
                        if (wasUnread && typeof updateGlobalMessageBadge === 'function') {
                            updateGlobalMessageBadge(-1);
                        }
                    }
                })
                .catch(err => console.error('SeenConversation error:', err));
        }
    },

    /**
     * Get the last message ID from a chat window's message container.
     */
    getLastMessageId(conversationId) {
        const msgContainer = document.getElementById(`chat-messages-${conversationId}`);
        if (!msgContainer) return null;
        const allMsgs = msgContainer.querySelectorAll('[data-message-id]');
        if (allMsgs.length === 0) return null;
        return allMsgs[allMsgs.length - 1].dataset.messageId;
    },

    scrollToBottom(conversationId) {
        const msgContainer = document.getElementById(`chat-messages-${conversationId}`);
        if (!msgContainer) return;

        const doScroll = () => {
            msgContainer.scrollTop = msgContainer.scrollHeight;
        };

        doScroll();
        requestAnimationFrame(doScroll);
        setTimeout(doScroll, 100);
    },

    /**
     * Move (or create) a member's seen avatar to a specific message's seen row in a chat window
     */
    moveSeenAvatar(conversationId, accountId, messageId, memberInfo = null) {
        const msgContainer = document.getElementById(`chat-messages-${conversationId}`);
        if (!msgContainer) return;

        // Resolve info from metadata if missing (realtime event)
        if (!memberInfo) {
            const chatObj = this.openChats.get(conversationId);
            if (chatObj?.metaData?.memberSeenStatuses) {
                const member = chatObj.metaData.memberSeenStatuses.find(m => m.accountId === accountId);
                if (member) {
                    memberInfo = {
                        avatar: member.avatarUrl,
                        name: member.displayName
                    };
                }
            }
        }

        // 1. Remove existing if any in this window
        const existing = msgContainer.querySelector(`.seen-avatar[data-account-id="${accountId}"]`);
        if (existing) {
            existing.remove();
        }

        // 2. Find target seen-row
        const targetRow = msgContainer.querySelector(`#seen-row-${messageId}`);
        if (!targetRow) return;

        // 2.5 Logic Fix: Only show Member X's avatar under messages NOT sent by Member X
        const bubbleWrapper = targetRow.closest('.msg-bubble-wrapper');
        const messageSenderId = bubbleWrapper?.dataset.senderId;
        if (messageSenderId === accountId) {
            return;
        }

        // 3. Create or reconstruct avatar
        const avatarUrl = memberInfo?.avatar || existing?.src || APP_CONFIG.DEFAULT_AVATAR;
        const displayName = memberInfo?.name || existing?.title || 'User';

        const img = document.createElement('img');
        img.src = avatarUrl;
        img.className = 'seen-avatar';
        img.dataset.accountId = accountId;
        img.title = displayName;
        img.onerror = () => img.src = APP_CONFIG.DEFAULT_AVATAR;

        targetRow.appendChild(img);
    },

    /**
     * Initial render for all members' seen indicators in a chat window
     */
    updateMemberSeenStatuses(conversationId, meta) {
        if (!meta || !meta.memberSeenStatuses) return;
        const myId = localStorage.getItem('accountId');

        meta.memberSeenStatuses.forEach(member => {
            if (member.accountId === myId) return;
            if (!member.lastSeenMessageId) return;
            
            this.moveSeenAvatar(conversationId, member.accountId, member.lastSeenMessageId, {
                avatar: member.avatarUrl,
                name: member.displayName
            });
        });
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

        if (window.chatHubConnection && window.chatHubConnection.state === signalR.HubConnectionState.Connected) {
            // Validate if convId is a real GUID before joining
            const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(convId);
            if (isGuid) {
                window.chatHubConnection.invoke("JoinConversation", convId)
                    .then(() => console.log(`✅ Joined Conv-${convId} group`))
                    .catch(err => console.error("Error joining conversation group:", err));
            }
        }
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
        chatBox.onclick = () => {
            if (!chatBox.classList.contains('is-focused')) {
                // Focus this window
                document.querySelectorAll('.chat-box').forEach(b => b.classList.remove('is-focused'));
                chatBox.classList.add('is-focused');
                
                // Mark as seen on focus
                const lastId = this.getLastMessageId(conv.conversationId);
                if (lastId) this.markConversationSeen(conv.conversationId, lastId);
            }
        };

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
            // Leave the SignalR group
            if (window.chatHubConnection && window.chatHubConnection.state === signalR.HubConnectionState.Connected) {
                // Only leave if not open in ChatPage
                const isOpenInPage = window.ChatPage && window.ChatPage.currentChatId === id;
                if (!isOpenInPage) {
                    window.chatHubConnection.invoke("LeaveConversation", id)
                        .then(() => console.log(`👋 Left Conv-${id} group`))
                        .catch(err => console.error("Error leaving conversation group:", err));
                }
            }

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
                    const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
                    if (!lastTime || (currentTime - lastTime > gap)) {
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

                // Scroll to bottom
                this.scrollToBottom(id);

                // DO NOT mark as seen immediately on load. 
                // Wait for interaction.

                // Initial render for seen indicators
                if (data.metaData) {
                    setTimeout(() => this.updateMemberSeenStatuses(id, data.metaData), 50);
                }
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
                    const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
                    if (!lastTime || (currentTime - lastTime > gap)) {
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
        const gap = window.APP_CONFIG?.CHAT_TIME_SEPARATOR_GAP || 15 * 60 * 1000;
        if (!prevTime || (currentTime - prevTime > gap)) {
            msgContainer.insertAdjacentHTML('beforeend', ChatCommon.renderChatSeparator(msg.sentAt));
        }

        // Determine grouping with the last message in the container
        const prevSenderId = lastMsgEl ? lastMsgEl.dataset.senderId : null;
        const groupGap = window.APP_CONFIG?.CHAT_GROUPING_GAP || 2 * 60 * 1000;
        const sameSender = prevSenderId && prevSenderId === (msg.sender?.accountId || myId);
        const closeTime = prevTime && (currentTime - prevTime < groupGap);
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

    async sendMessage(id) {
        const chat = this.openChats.get(id);
        if (!chat) return;
        
        const inputField = chat.element.querySelector('.chat-input-field');
        const content = inputField.innerText.trim();
        
        if (!content) return;

        // generate temp message id for tracking
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // optimistic ui - show message immediately with pending state
        this.appendMessage(id, { 
            tempId,
            content, 
            sentAt: new Date(), 
            isOwn: true,
            status: 'pending'  // pending, sent, failed
        });
        
        // Update Sidebar immediately
        if (window.ChatSidebar && typeof window.ChatSidebar.incrementUnread === 'function') {
            window.ChatSidebar.incrementUnread(id, {
                content,
                sender: { accountId: (localStorage.getItem('accountId') || '') },
                sentAt: new Date()
            });
        }
        
        inputField.innerText = '';
        inputField.focus();
        
        const sendBtn = document.getElementById(`send-btn-${id}`);
        if (sendBtn) sendBtn.disabled = true;

        const formData = new FormData();
        formData.append('Content', content);

        try {
            let res;
            
            if (chat.data.isGroup) {
                // group chat - use group API with conversationId
                res = await window.API.Messages.sendGroup(id, formData);
            } else {
                // private chat (1:1) - use private API with receiverId
                if (id.startsWith('new-')) {
                    // new conversation - extract receiverId from temp ID
                    const receiverId = id.replace('new-', '');
                    formData.append('ReceiverId', receiverId);
                } else if (chat.data.otherMember) {
                    // existing conversation - use otherMember's accountId
                    formData.append('ReceiverId', chat.data.otherMember.accountId);
                } else {
                    console.error("Cannot determine receiverId for private chat");
                    this.updateMessageStatus(id, tempId, 'failed', content);
                    return;
                }
                res = await window.API.Messages.sendPrivate(formData);
            }
            
            if (res.ok) {
                const msg = await res.json();
                
                // update message to sent status
                this.updateMessageStatus(id, tempId, 'sent', content, msg.messageId);
                
                // if it was a 'new-' chat, update to real conversationId
                if (id.startsWith('new-')) {
                    const realId = msg.conversationId;
                    
                    // update mapping
                    this.openChats.delete(id);
                    chat.data.conversationId = realId;
                    this.openChats.set(realId, chat);
                    
                    // update DOM
                    chat.element.id = `chat-box-${realId}`;
                    const msgContainer = chat.element.querySelector('.chat-messages');
                    if (msgContainer) msgContainer.id = `chat-messages-${realId}`;
                    
                    if (sendBtn) sendBtn.id = `send-btn-${realId}`;
                    
                    // update handlers
                    chat.element.querySelector('.chat-box-header').onclick = () => this.toggleMinimize(realId);
                    chat.element.querySelector('.chat-input-field').onkeydown = (e) => this.handleKeyDown(e, realId);
                    chat.element.querySelector('.chat-input-field').oninput = (e) => this.handleInput(e, realId);
                    chat.element.querySelector('.chat-send-btn').onclick = () => this.sendMessage(realId);

                    // Join the SignalR group for the newly created conversation
                    if (window.chatHubConnection && window.chatHubConnection.state === signalR.HubConnectionState.Connected) {
                        window.chatHubConnection.invoke("JoinConversation", realId)
                            .then(() => console.log(`✅ Joined Conv-${realId} group`))
                            .catch(err => console.error("Error joining conversation group:", err));
                    }
                }
            } else {
                // failed to send
                this.updateMessageStatus(id, tempId, 'failed', content);
            }
        } catch (error) {
            console.error("Failed to send message from window:", error);
            this.updateMessageStatus(id, tempId, 'failed', content);
        }
    },

    updateMessageStatus(chatId, tempId, status, content, realMessageId = null) {
        const msgContainer = document.getElementById(`chat-messages-${chatId}`);
        if (!msgContainer) return;
        
        const msgEl = msgContainer.querySelector(`[data-temp-id="${tempId}"]`);
        if (!msgEl) return;
        
        msgEl.dataset.status = status;
        
        if (realMessageId) {
            msgEl.dataset.messageId = realMessageId;
        }
        
        // Remove existing status indicators from THIS bubble
        const existingStatus = msgEl.querySelector('.msg-status');
        if (existingStatus) existingStatus.remove();

        // If this message is being marked as SENT, remove "Sent" status from all PREVIOUS messages in this window
        if (status === 'sent') {
            msgContainer.querySelectorAll('.msg-bubble-wrapper.sent[data-status="sent"]').forEach(el => {
                if (el !== msgEl) {
                    el.removeAttribute('data-status');
                    el.querySelector('.msg-status')?.remove();
                }
            });
        }
        
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
            statusEl.onclick = () => this.retryMessage(chatId, tempId, content);
        }
        
        msgEl.appendChild(statusEl);
    },

    async retryMessage(chatId, tempId, content) {
        const msgContainer = document.getElementById(`chat-messages-${chatId}`);
        if (!msgContainer) return;
        
        const msgEl = msgContainer.querySelector(`[data-temp-id="${tempId}"]`);
        if (!msgEl) return;
        
        // update to pending
        this.updateMessageStatus(chatId, tempId, 'pending', content);
        
        // retry sending
        const chat = this.openChats.get(chatId);
        if (!chat) return;
        
        const formData = new FormData();
        formData.append('Content', content);
        
        try {
            let res;
            
            if (chat.data.isGroup) {
                res = await window.API.Messages.sendGroup(chatId, formData);
            } else {
                if (chatId.startsWith('new-')) {
                    const receiverId = chatId.replace('new-', '');
                    formData.append('ReceiverId', receiverId);
                } else if (chat.data.otherMember) {
                    formData.append('ReceiverId', chat.data.otherMember.accountId);
                } else {
                    this.updateMessageStatus(chatId, tempId, 'failed', content);
                    return;
                }
                res = await window.API.Messages.sendPrivate(formData);
            }
            
            if (res.ok) {
                const msg = await res.json();
                this.updateMessageStatus(chatId, tempId, 'sent', content, msg.messageId);
            } else {
                this.updateMessageStatus(chatId, tempId, 'failed', content);
            }
        } catch (error) {
            console.error("Failed to retry message:", error);
            this.updateMessageStatus(chatId, tempId, 'failed', content);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => ChatWindow.init());
window.ChatWindow = ChatWindow;
window.ChatMessenger = ChatWindow;
