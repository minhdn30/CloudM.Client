const POST_DETAIL_MODAL_ID = "postDetailModal";
let currentPostId = null;

// Open Modal
async function openPostDetail(postId) {
    currentPostId = postId;
    
    // 1. Check if modal exists, if not load it
    let modal = document.getElementById(POST_DETAIL_MODAL_ID);
    if (!modal) {
        await loadPostDetailHTML();
        modal = document.getElementById(POST_DETAIL_MODAL_ID);
        if (!modal) {
            console.error("Failed to inject modal");
            return;
        }
    }

    resetPostDetailView();
    modal.classList.add("show");
    document.body.style.overflow = "hidden"; // Prevent background scroll

    try {
        const res = await apiFetch(`/Posts/${postId}`);
        if (!res.ok) throw new Error("Failed to load post");
        
        const data = await res.json();
        renderPostDetail(data);        
    } catch (err) {
        console.error(err);
        if(window.toastError) toastError("Could not load post details");
        closePostDetailModal();
    }
}

// Dynamic HTML Loader
async function loadPostDetailHTML() {
    try {
        const response = await fetch('pages/post-detail.html');
        if (!response.ok) throw new Error("Failed to load template");
        const html = await response.text();
        document.body.insertAdjacentHTML('beforeend', html);
        
        // Initialize icons for the new content
        if(window.lucide) lucide.createIcons();
    } catch (error) {
        console.error("Error loading post detail template:", error);
    }
}

// Close Modal
function closePostDetailModal() {
    const modal = document.getElementById(POST_DETAIL_MODAL_ID);
    if (modal) {
        modal.classList.remove("show");
        document.body.style.overflow = "";
        
        // Stop videos
        const videos = modal.querySelectorAll("video");
        videos.forEach(v => v.pause());
        
        // Optional: remove from DOM to save memory? 
        // Better to keep it for caching.
    }
}

// Reset View
function resetPostDetailView() {
    document.getElementById("detailAvatar").src = APP_CONFIG.DEFAULT_AVATAR;
    document.getElementById("detailUsername").textContent = "";
    document.getElementById("detailSliderWrapper").innerHTML = "";
    document.getElementById("detailCaptionText").textContent = "";
    document.getElementById("detailCommentsList").innerHTML = "";
    // Hide media container initially
    document.getElementById("detailMediaContainer").style.display = "flex"; 
}

// Render Post
function renderPostDetail(post) {
    // 1. Header Info
    const avatar = document.getElementById("detailAvatar");
    const username = document.getElementById("detailUsername");
    const location = document.getElementById("detailLocation"); // Not in API, placeholder

    avatar.src = post.owner.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
    username.textContent = post.owner.fullName || post.owner.username;
    
    // Header Options Button
    const moreBtn = document.querySelector("#postDetailModal .more-options-btn");
    if (moreBtn) {
        moreBtn.onclick = () => {
             const isOwner = post.isOwner !== undefined ? post.isOwner : (post.owner.accountId === APP_CONFIG.CURRENT_USER_ID); 
             // Note: APP_CONFIG.CURRENT_USER_ID might not be avail, fallback false. 
             // Better: post.isOwner is standard in this app's DTOs.
             
             const isFollowed = post.owner?.isFollowedByCurrentUser || false;
             
             if (window.showPostOptions) {
                 showPostOptions(post.postId, post.owner.accountId, isOwner, isFollowed);
             } else {
                 console.error("showPostOptions not found");
             }
        };
    }
    
    // 2. Caption
    const captionItem = document.getElementById("detailCaptionItem");
    const captionText = document.getElementById("detailCaptionText");
    const captionUsername = document.getElementById("detailCaptionUsername");
    const captionAvatar = document.getElementById("detailCaptionAvatar");
    const captionTime = document.getElementById("detailTime");

    if (!post.content) {
        captionItem.style.display = "none";
    } else {
        captionItem.style.display = "flex";
        captionUsername.textContent = post.owner.username;
        captionAvatar.src = post.owner.avatarUrl || APP_CONFIG.DEFAULT_AVATAR;
        captionText.textContent = post.content; // Should escape html?
        // escapeHtml is global? Yes from newfeed.js context or app.js
        if(typeof escapeHtml === 'function') {
            captionText.innerHTML = escapeHtml(post.content);
        }
        captionTime.textContent = timeAgo(post.createdAt);
    }

    // 3. Media Layout
    const mediaContainer = document.getElementById("detailMediaContainer");
    const sliderWrapper = document.getElementById("detailSliderWrapper");
    
    mediaContainer.className = "detail-media-container custom-scrollbar"; // Reset classes

    if (!post.medias || post.medias.length === 0) {
        mediaContainer.style.display = "none";
        // Card width will shrink to info container width
    } else {
        mediaContainer.style.display = "flex";
        
        // Aspect Ratio Logic
        // 0: Original (Square container, contain)
        // 1: 1:1 (Square container, cover)
        // 2: 16:9 (Square container, contain) (User logic)
        // 3: 4:5 (Portrait container, cover)
        
        const ratio = post.feedAspectRatio;
        let objectFitClass = "contain"; // Default
        
        if (ratio === 2) { // 2 = Portrait 4:5
            mediaContainer.classList.add("ratio-portrait");
            objectFitClass = "cover";
        } else {
            mediaContainer.classList.add("ratio-square");
            if (ratio === 1) objectFitClass = "cover";
        }

        // Render Medias
        post.medias.forEach(media => {
            const item = document.createElement("div");
            item.className = `detail-media-item ${objectFitClass}`;
            
            if (media.type === 1) { // Video
                 item.innerHTML = `<video src="${media.mediaUrl}" controls></video>`;
            } else { // Image
                const img = document.createElement("img");
                img.src = media.mediaUrl;
                item.appendChild(img);
                
                // Dominant Color BG if contain
                if (objectFitClass === "contain" && window.extractDominantColor) {
                    // Async
                    extractDominantColor(media.mediaUrl).then(color => {
                        item.style.background = `linear-gradient(135deg, ${color}, #1a1a1a)`;
                    });
                }
            }
            sliderWrapper.appendChild(item);
        });
        
        initDetailSlider(post.medias.length);
    }

    // 4. Footer Actions
    const likeBtn = document.getElementById("detailLikeBtn");
    const likeIcon = document.getElementById("detailLikeIcon");
    const likeCount = document.getElementById("detailLikeCount");
    const commentCount = document.getElementById("detailCommentCount");
    const dateEl = document.getElementById("detailDate");

    likeBtn.onclick = () => handleLikePost(post.postId, likeBtn, likeIcon, likeCount);
    
    // Set initial state
    if (post.isReactedByCurrentUser) {
        likeIcon.classList.add("reacted");
    } else {
        likeIcon.classList.remove("reacted");
    }
    
    likeCount.textContent = post.totalReacts || 0;
    commentCount.textContent = post.totalComments || post.commentCount || 0;
    
    const d = new Date(post.createdAt);
    dateEl.textContent = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    
    // Lucide icons
    if(window.lucide) lucide.createIcons();
}

// Slider Logic
let currentSlide = 0;
function initDetailSlider(total) {
    const wrapper = document.getElementById("detailSliderWrapper");
    const prev = document.getElementById("detailNavPrev");
    const next = document.getElementById("detailNavNext");
    const dots = document.getElementById("detailSliderDots");
    
    currentSlide = 0;
    wrapper.style.transform = `translateX(0)`;
    dots.innerHTML = "";

    if (total <= 1) {
        prev.style.display = "none";
        next.style.display = "none";
        return;
    }
    
    prev.style.display = "flex";
    next.style.display = "flex";

    // Create dots
    for (let i = 0; i < total; i++) {
        const dot = document.createElement("span");
        dot.className = i === 0 ? "active" : "";
        dot.onclick = () => goToSlide(i);
        dots.appendChild(dot);
    }

    prev.onclick = () => goToSlide((currentSlide - 1 + total) % total);
    next.onclick = () => goToSlide((currentSlide + 1) % total);
}

function goToSlide(index) {
    const wrapper = document.getElementById("detailSliderWrapper");
    const dots = document.getElementById("detailSliderDots").children;
    const total = dots.length;
    
    currentSlide = index;
    wrapper.style.transform = `translateX(-${index * 100}%)`;
    
    Array.from(dots).forEach((dot, i) => {
        dot.classList.toggle("active", i === index);
    });
}

// Like Logic (Reused/Adapted)
async function handleLikePost(postId, btn, iconRef, countEl) {
    // Update icon reference because Lucide replaced the element
    const icon = btn.querySelector('.react-icon') || btn.querySelector('svg') || iconRef;

    // Toggle UI optimistcally
    const isLiked = icon.classList.contains("reacted");
    const currentCount = parseInt(countEl.textContent || "0");
    
    icon.classList.toggle("reacted");
    if (isLiked) {
         countEl.textContent = currentCount > 0 ? currentCount - 1 : 0;
    } else {
         countEl.textContent = currentCount + 1;
    }

    try {
        const res = await apiFetch(`/Posts/${postId}/react`, { method: "POST" });
        if (!res.ok) throw new Error("React failed");
        // Update with real data if needed
    } catch (err) {
        // Revert
        icon.classList.toggle("reacted");
        // ... revert logic ...
    }
}

// Emoji Logic
async function toggleDetailEmojiPicker(event) {
    const container = document.getElementById("detailEmojiPicker");
    const input = document.getElementById("detailCommentInput");
    
    if (window.EmojiUtils) {
        await EmojiUtils.togglePicker(container, (emoji) => {
            EmojiUtils.insertAtCursor(input, emoji.native);
        });
    }
}

// Comment focus
function focusCommentInput() {
    document.getElementById("detailCommentInput").focus();
}

// Global Exports
window.openPostDetail = openPostDetail;
window.closePostDetailModal = closePostDetailModal;
window.toggleDetailEmojiPicker = toggleDetailEmojiPicker;
window.focusCommentInput = focusCommentInput;
