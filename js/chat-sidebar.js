/**
 * Chat Sidebar Component (formerly ChatPanel)
 * Handles the conversation list sidebar
 */
const ChatSidebar = {
    isOpen: false,
    conversations: [],
    currentFilter: null, // null = All, true = Private, false = Group
    searchTimeout: null,
    searchTerm: '',
    page: 1,
    isLoading: false,
    hasMore: true,
    pageSize: window.APP_CONFIG?.CONVERSATIONS_PAGE_SIZE || 20,
    currentActiveId: null, // ID of the currently active chat (for highlighting)

    async init() {
        if (!document.getElementById('chat-panel')) {
            const panel = document.createElement('div');
            panel.id = 'chat-panel';
            panel.className = 'chat-sidebar-panel'; // Renamed class for clarity
            document.body.appendChild(panel);
            this.renderLayout();
            this.initScrollListener();
        }

        document.addEventListener('click', (e) => {
            const isMessagesPage = window.location.hash.startsWith('#/messages');
            if (isMessagesPage) return; 
            
            const panel = document.getElementById('chat-panel');
            if (this.isOpen && 
                !panel.contains(e.target) && 
                !e.target.closest('[data-route="/messages"]')) {
                this.close();
            }
        });

        if (window.location.hash.startsWith('#/messages')) {
            this.open();
        }

        // Auto-highlight based on URL change
        window.addEventListener('hashchange', () => {
            if (window.location.hash.includes('?id=')) {
                const id = window.location.hash.split('?id=')[1].split('&')[0];
                this.updateActiveId(id);
            } else if (!window.location.hash.startsWith('#/messages')) {
                // Clear active if we left chat area
                this.updateActiveId(null);
            }
        });
    },

    renderLayout() {
        const panel = document.getElementById('chat-panel');
        const username = localStorage.getItem('username') || 'User';

        panel.innerHTML = `
            <div class="chat-sidebar-header">
                <h2>${username} <i data-lucide="chevron-down" size="18"></i></h2>
                <div class="chat-header-actions">
                    <button class="chat-icon-btn" title="New Message">
                        <i data-lucide="square-pen" size="22"></i>
                    </button>
                </div>
            </div>
            
            <div class="chat-search-container">
                <div class="chat-search-wrapper">
                    <i data-lucide="search"></i>
                    <input type="text" placeholder="Search" id="chat-search-input">
                </div>
            </div>

            <div class="chat-tabs">
                <div class="chat-tab ${this.currentFilter === null ? 'active' : ''}" data-filter="null">All</div>
                <div class="chat-tab ${this.currentFilter === true ? 'active' : ''}" data-filter="true">Private</div>
                <div class="chat-tab ${this.currentFilter === false ? 'active' : ''}" data-filter="false">Group</div>
            </div>

            <div class="chat-list" id="chat-conversation-list">
                <div class="loading-conversations" style="padding: 20px; text-align: center; color: var(--text-tertiary);">
                    Loading...
                </div>
            </div>
        `;
        
        this.initTabs();
        this.initSearch();
        lucide.createIcons();
    },

    initTabs() {
        const tabs = document.querySelectorAll('.chat-tab');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const filterVal = tab.dataset.filter;
                this.currentFilter = filterVal === 'null' ? null : filterVal === 'true';
                this.page = 1;
                this.hasMore = true;
                this.loadConversations(false);
            };
        });
    },

    initSearch() {
        const searchInput = document.getElementById('chat-search-input');
        if (!searchInput) return;

        searchInput.oninput = (e) => {
            this.searchTerm = e.target.value.trim();
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.page = 1;
                this.hasMore = true;
                this.loadConversations(false);
            }, 500);
        };
    },

    initScrollListener() {
        const listContainer = document.getElementById('chat-conversation-list');
        if (!listContainer) return;

        listContainer.onscroll = () => {
            if (this.isLoading || !this.hasMore) return;
            
            const { scrollTop, scrollHeight, clientHeight } = listContainer;
            if (scrollTop + clientHeight >= scrollHeight - 50) {
                this.loadConversations(true);
            }
        };
    },

    async toggle() {
        this.isOpen ? this.close() : await this.open();
    },

    async open() {
        const panel = document.getElementById('chat-panel');
        panel.classList.add('show');
        this.isOpen = true;
        document.body.classList.add('chat-sidebar-open');
        
        document.querySelectorAll('.sidebar .menu-item').forEach(item => {
            if (item.dataset.route === '/messages') item.classList.add('active');
        });

        await this.loadConversations();
    },

    close() {
        if (window.location.hash.startsWith('#/messages')) return;

        const panel = document.getElementById('chat-panel');
        panel.classList.remove('show');
        this.isOpen = false;
        document.body.classList.remove('chat-sidebar-open');
        
        if (window.setActiveSidebar) window.setActiveSidebar();
    },

    async loadConversations(isLoadMore = false) {
        if (this.isLoading || (!isLoadMore && !this.page === 1)) return;
        if (isLoadMore && !this.hasMore) return;

        const listContainer = document.getElementById('chat-conversation-list');
        this.isLoading = true;

        if (!isLoadMore) {
            this.page = 1;
            this.hasMore = true;
            // Show skeleton or loader for fresh load
            listContainer.innerHTML = '<div class="loading-conversations" style="padding: 20px; text-align: center; color: var(--text-tertiary);">Loading...</div>';
        }

        try {
            const res = await window.API.Conversations.getConversations(this.currentFilter, this.searchTerm, this.page, this.pageSize);
            
            if (res.ok) {
                const data = await res.json();
                const items = data.items || [];
                
                if (isLoadMore) {
                    this.conversations = [...this.conversations, ...items];
                } else {
                    this.conversations = items;
                    listContainer.innerHTML = ''; // Clear loader
                }

                if (items.length < this.pageSize) {
                    this.hasMore = false;
                }

                this.renderConversations(items, isLoadMore);
                this.page++;
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
            if (!isLoadMore) {
                listContainer.innerHTML = '<div style="padding:20px; text-align:center;">Error loading messages</div>';
            }
        } finally {
            this.isLoading = false;
        }
    },

    renderConversations(items, isAppend = false) {
        const listContainer = document.getElementById('chat-conversation-list');
        
        if (!isAppend && items.length === 0) {
            listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-tertiary);">No messages yet</div>';
            return;
        }

        const html = items.map(conv => {
            const avatar = ChatCommon.getAvatar(conv);
            const name = escapeHtml(ChatCommon.getDisplayName(conv));
            const lastMsg = escapeHtml(ChatCommon.getLastMsgPreview(conv));
            const time = conv.lastMessageSentAt ? PostUtils.timeAgo(conv.lastMessageSentAt, true) : '';
            const unread = conv.unreadCount > 0;
            const isOnline = !conv.isGroup && conv.otherMember && conv.otherMember.isActive;
            
            // Only highlight if on the Messages Page
            const isChatPage = window.location.hash.startsWith('#/messages');
            const isActive = isChatPage && conv.conversationId === this.currentActiveId;

            return `
                <div class="chat-item ${unread ? 'unread' : ''} ${isActive ? 'active' : ''}" 
                     onclick="ChatSidebar.openConversation('${conv.conversationId}')">
                    <div class="chat-avatar-wrapper">
                        <img src="${avatar}" alt="${name}" class="chat-avatar" onerror="this.src='${APP_CONFIG.DEFAULT_AVATAR}'">
                        ${isOnline ? '<div class="chat-status-dot"></div>' : ''}
                    </div>
                    <div class="chat-info">
                        <div class="chat-name-row">
                            <span class="chat-name">${name}</span>
                        </div>
                        <div class="chat-msg-row">
                            <span class="chat-last-msg">${lastMsg}</span>
                            ${time ? `<span class="chat-msg-dot">·</span><span class="chat-meta">${time}</span>` : ''}
                        </div>
                    </div>
                    ${unread ? `<div class="chat-unread-badge">${conv.unreadCount > 9 ? '9+' : conv.unreadCount}</div>` : ''}
                </div>
            `;
        }).join('');
        
        if (isAppend) {
            listContainer.insertAdjacentHTML('beforeend', html);
        } else {
            listContainer.innerHTML = html;
        }
        
        lucide.createIcons();
    },

    openConversation(id) {
        const targetHash = `#/messages?id=${id}`;
        if (window.location.hash !== targetHash) {
            window.location.hash = targetHash;
            // The router (app.js) will handle the navigation/update
        } else {
            // Already on this specific conversation hash, just ensure UI is updated
            if (window.ChatPage && typeof window.ChatPage.selectConversation === 'function') {
                window.ChatPage.selectConversation(id);
            }
            this.updateActiveId(id);
        }
    },

    updateActiveId(id, retryCount = 0) {
        this.currentActiveId = id;
        
        // Update UI immediately if sidebar is rendered
        const items = document.querySelectorAll('.chat-item');
        
        // If sidebar content hasn't fully loaded yet, retry a few times
        if (items.length === 0 && retryCount < 5 && window.location.hash.startsWith('#/messages')) {
            setTimeout(() => this.updateActiveId(id, retryCount + 1), 200);
            return;
        }

        if (items.length > 0) {
            const isChatPage = window.location.hash.startsWith('#/messages');
            items.forEach(item => {
                const isTarget = isChatPage && id && item.getAttribute('onclick')?.includes(id);
                item.classList.toggle('active', !!isTarget);
            });
        }
    }
};

document.addEventListener('DOMContentLoaded', () => ChatSidebar.init());

window.toggleChatSidebar = () => ChatSidebar.toggle();
window.closeChatSidebar = () => ChatSidebar.close();
window.ChatSidebar = ChatSidebar;

// For backward compatibility during migration
window.toggleChatPanel = window.toggleChatSidebar;
window.closeChatPanel = window.closeChatSidebar;
