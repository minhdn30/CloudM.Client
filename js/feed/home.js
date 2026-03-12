async function loadPartial(id, page, featureFolder = "feed") {
  const res = await fetch(`pages/${featureFolder}/${page}.html`);
  document.getElementById(id).innerHTML = await res.text();
  lucide.createIcons();
}

async function loadHome() {
  await loadPage("feed/home");
  await Promise.all([
    loadPartial("story-section", "story", "story"),
    loadPartial("feed-section", "newfeed", "feed"),
  ]);

  const initTasks = [];

  if (window.initStoryFeed) {
    initTasks.push(window.initStoryFeed());
  }

  if (window.initFeed) {
    window.initFeed();
  }

  if (window.FollowSuggestionsModule?.initHomeRail) {
    initTasks.push(window.FollowSuggestionsModule.initHomeRail());
  }

  if (initTasks.length > 0) {
    await Promise.allSettled(initTasks);
  }
}
