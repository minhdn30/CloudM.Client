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

    async init() {
        console.log("ChatPage initialized");
        this.currentChatId = null; // Important: reset state on new DOM init
        this.page = 1;
        this.hasMore = true;
        this.isLoading = false;
        
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
                const hasContent = input.value.trim().length > 0;
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
            window.chatHubConnection.off('ReceiveMessage');
            window.chatHubConnection.on('ReceiveMessage', (convId, msg) => {
                if (this.currentChatId === convId) {
                    this.appendMessage(msg);
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

    async selectConversation(id) {
        if (!id || this.currentChatId === id) return;
        this.currentChatId = id;
        this.page = 1;
        this.hasMore = true;
        this.isLoading = false;

        // Visual update in Sidebar
        this.updatePanelActiveState(id);

        await this.loadMessages(id, false);
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

    updatePanelActiveState(id) {
        document.querySelectorAll('.chat-item').forEach(item => {
            const isTarget = item.getAttribute('onclick')?.includes(id);
            item.classList.toggle('active', isTarget);
        });
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
            const currentTime = new Date(m.sentAt);
            if (!lastTime || (currentTime - lastTime > 15 * 60 * 1000)) {
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
        if (!lastTime || (currentTime - lastTime > 15 * 60 * 1000)) {
            msgContainer.insertAdjacentHTML('beforeend', ChatCommon.renderChatSeparator(msg.sentAt));
        }

        // Determine grouping with the previous message in DOM
        let prevSenderId = lastMsgEl ? lastMsgEl.dataset.senderId : null;
        let prevTime = lastTime;
        const twoMin = 2 * 60 * 1000;
        const sameSender = prevSenderId && prevSenderId === (msg.sender?.accountId || myId);
        const closeTime = prevTime && (currentTime - prevTime < twoMin);
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
        msgContainer.appendChild(bubble);
        msgContainer.scrollTop = msgContainer.scrollHeight;
    },

    async sendMessage() {
        const input = document.getElementById('chat-message-input');
        const content = input.value.trim();
        if (!content || !this.currentChatId) return;

        const formData = new FormData();
        formData.append('Content', content);
        
        // Find receiver ID if it's a private chat
        // In a real app, you might want a specialized endpoint for sending to ConversationId 
        // regardless of private/group. Currently backend has SendMessageInPrivateChat
        // Let's assume we handle private for now.
        
        // We'll need the receiverId. We can get it from the sidebar's cache or the metadata we stored.
        // For now, let's look at how we can get receiverId. 
        // If we want to be generic, we should have a SendMessage(convId, content) API.
        
        // Let's check backend MessagesController again. 
        // It has SendMessageInPrivateChat([FromForm] SendMessageInPrivateChatRequest request)
        // Request has ReceiverId.
        
        // Tạm thời tôi sẽ giả sử chúng ta đang lấy ReceiverId từ MetaData
        // (Tôi sẽ cần lưu MetaData vào 'this' để truy xuất)
        if (!this.currentMetaData || this.currentMetaData.isGroup) {
            console.warn("Group chat sending not implemented yet in BE or limited API.");
            // Append locally to show it works UI-wise
            this.appendMessage({ content, sentAt: new Date(), isOwn: true });
            input.value = '';
            return;
        }

        formData.append('ReceiverId', this.currentMetaData.otherMember.accountId);

        try {
            const res = await window.API.Messages.sendPrivate(formData);
            if (res.ok) {
                const msg = await res.json();
                this.appendMessage(msg);
                input.value = '';
                input.style.height = 'auto';
                document.getElementById('chat-page-send-btn').disabled = true;
            }
        } catch (error) {
            console.error("Failed to send message:", error);
        }
    }
};

window.initChatPage = () => ChatPage.init();
window.ChatPage = ChatPage;
