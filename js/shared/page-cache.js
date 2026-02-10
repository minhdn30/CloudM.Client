/**
 * PageCache.js
 */

const PageCache = (function() {
    const _caches = new Map();
    let _lastScrollY = 0;
    let _snapshotScrollY = null;

    // Track scroll position continuously to avoid losing it during navigation/hashreset
    const _getScrollContainer = () => document.querySelector('.main-content');
    const _trackScroll = () => {
        const mc = _getScrollContainer();
        if (!mc) return;
        // Only track if not locked by a modal
        if (mc.style.overflow !== "hidden") {
            _lastScrollY = mc.scrollTop;
        }
    };
    const _trackScrollPassive = () => {
        const mc = _getScrollContainer();
        if (!mc) return;
        if (mc.style.overflow !== "hidden") {
            _snapshotScrollY = mc ? mc.scrollTop : 0;
        }
    };
    // Attach to .main-content once DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
        const mc = _getScrollContainer();
        if (mc) mc.addEventListener('scroll', _trackScroll, { passive: true });
    });

    function snapshot() {
        const mc = _getScrollContainer();
        if (mc && mc.style.overflow !== "hidden") {
            _snapshotScrollY = mc ? mc.scrollTop : 0;
        }
    }

    function clear(key) {
        if (_caches.has(key)) {
            _caches.delete(key);
            console.log(`[PageCache] Cleared: ${key}`);
        }
    }

    function clearAll() {
        _caches.clear();
        console.log(`[PageCache] All caches cleared`);
    }

    function save(key, container, data = null) {
        if (!container) return;

        const fragment = document.createDocumentFragment();
        while (container.firstChild) {
            fragment.appendChild(container.firstChild);
        }

        // Use snapshot if available, otherwise last tracked
        // This failsafe protects against browser auto-scroll-to-top during hashchange
        let finalScroll = _lastScrollY;
        if (_snapshotScrollY !== null) {
            finalScroll = _snapshotScrollY;
            _snapshotScrollY = null; // Consume snapshot
        }

        const state = {
            fragment: fragment,
            scrollY: finalScroll, 
            data: data,
            timestamp: Date.now()
        };

        _caches.set(key, state);
        console.log(`[PageCache] Saved: ${key} (Scroll: ${state.scrollY})`);
    }

    function get(key) {
        return _caches.get(key);
    }

    function has(key) {
        return _caches.has(key);
    }

    function restore(key, container) {
        const state = _caches.get(key);
        if (!state || !container) return false;

        container.innerHTML = "";
        container.appendChild(state.fragment);

        // Restore scroll position
        requestAnimationFrame(() => {
            const mc = _getScrollContainer();
            if (mc) {
                mc.scrollTop = state.scrollY;
                _lastScrollY = state.scrollY;
            }
        });

        console.log(`[PageCache] Restored: ${key} (Scroll: ${state.scrollY})`);
        return true;
    }

    function getKeys() {
        return Array.from(_caches.keys());
    }

    return {
        save,
        get,
        restore,
        has,
        clear,
        clearAll,
        getKeys,
        snapshot
    };
})();

window.PageCache = PageCache;
