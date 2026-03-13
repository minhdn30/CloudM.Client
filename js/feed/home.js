let activeHomeLoadToken = 0;

function isHomeSurfaceRoute() {
  const routeHelper = window.RouteHelper;
  const currentHash =
    window.location.hash ||
    (routeHelper?.buildHash ? routeHelper.buildHash("/") : "#/");
  const currentPath = routeHelper?.parseHash
    ? routeHelper.parseHash(currentHash).path
    : "";
  const paths = routeHelper?.PATHS || {};
  const storiesPath = paths.STORIES || "/stories";
  const storyPath = paths.STORY || "/story";
  const isHome = routeHelper?.isHomePath
    ? routeHelper.isHomePath(currentPath)
    : currentPath === "/" || currentPath === "/home";

  return (
    isHome ||
    currentPath === storiesPath ||
    currentPath.startsWith(`${storiesPath}/`) ||
    currentPath === storyPath ||
    currentPath.startsWith(`${storyPath}/`)
  );
}

function isActiveHomeLoad(loadToken) {
  return loadToken === activeHomeLoadToken && isHomeSurfaceRoute();
}

async function loadPartial(id, page, featureFolder = "feed") {
  const res = await fetch(`pages/${featureFolder}/${page}.html`);
  if (!res.ok) return false;

  const html = await res.text();
  const mount = document.getElementById(id);
  if (!mount) return false;

  mount.innerHTML = html;
  if (window.lucide) {
    lucide.createIcons();
  }
  return true;
}

async function loadHome() {
  const loadToken = ++activeHomeLoadToken;

  await loadPage("feed/home");
  if (!isActiveHomeLoad(loadToken)) return;

  await Promise.all([
    loadPartial("story-section", "story", "story"),
    loadPartial("feed-section", "newfeed", "feed"),
  ]);
  if (!isActiveHomeLoad(loadToken)) return;

  const initTasks = [];

  if (window.initStoryFeed) {
    initTasks.push(
      Promise.resolve().then(() => {
        if (!isActiveHomeLoad(loadToken)) return;
        return window.initStoryFeed();
      }),
    );
  }

  if (window.initFeed && isActiveHomeLoad(loadToken)) {
    window.initFeed();
  }

  if (window.FollowSuggestionsModule?.initHomeRail) {
    initTasks.push(
      Promise.resolve().then(() => {
        if (!isActiveHomeLoad(loadToken)) return;
        return window.FollowSuggestionsModule.initHomeRail();
      }),
    );
  }

  if (initTasks.length > 0) {
    await Promise.allSettled(initTasks);
  }
}
