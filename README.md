# CloudM Client

[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/docs/Web/JavaScript)
[![HTML5](https://img.shields.io/badge/HTML5-Structured-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-Modular-1572B6?logo=css3&logoColor=white)](https://developer.mozilla.org/docs/Web/CSS)
[![SignalR](https://img.shields.io/badge/Realtime-SignalR-F47C20)](https://learn.microsoft.com/aspnet/core/signalr/introduction)

CloudM Client is a framework-free frontend for a social networking platform built with plain JavaScript, HTML, and CSS. It supports authentication, feed, profile, stories, notifications, and realtime messaging while keeping the codebase modular enough to scale beyond a small prototype.

This repository is meant to demonstrate frontend engineering discipline without relying on React, Vue, or a heavy build pipeline. The value is in the structure: route-driven UI composition, modular feature boundaries, shared UI primitives, realtime resilience, and a small dependency surface.

## Table of Contents

- [Overview](#overview)
- [Product Scope](#product-scope)
- [Frontend Architecture](#frontend-architecture)
- [Runtime Flow](#runtime-flow)
- [Realtime and Session Handling](#realtime-and-session-handling)
- [Repository Structure](#repository-structure)
- [Key Entry Points](#key-entry-points)
- [Configuration](#configuration)
- [Local Development](#local-development)
- [Dependency Model](#dependency-model)
- [Engineering Notes](#engineering-notes)

## Overview

The client is organized around feature domains instead of one large script bundle. The project uses:

- a custom hash router
- page-specific feature modules
- shared configuration through `window.APP_CONFIG`
- centralized API access and refresh-token-aware session recovery
- shared UI utilities for theme, loading, toasts, media, and interaction handling
- SignalR clients for realtime chat and social activity flows

This architecture makes the frontend easier to extend even without a framework abstraction layer.

## Product Scope

The repository currently covers the following user-facing areas:

| Area | Scope |
| --- | --- |
| Authentication | Sign in, sign up, email verification, forgot password, Google login |
| Feed | Feed rendering, post detail, comments, reactions, saves, post tagging |
| Profile | Profile page, profile preview, follow flows, account settings |
| Stories | Story feed, story viewer, story media editor, highlights |
| Messaging | Private chat, group chat, reactions, pinned messages, floating chat windows |
| Notifications | Notification panel and related realtime updates |
| Shared UX | Theme handling, toasts, loading states, media previewing, mention picker, auth store |

## Frontend Architecture

The application is intentionally built without a SPA framework. Instead, it uses a structured vanilla approach:

### Configuration Layer

- `js/config/config.js`
  global client-side configuration, page sizes, limits, API/hub defaults
- `js/config/configAPI.js`
  centralized API client, auth refresh behavior, API base probing, request helpers
- `js/config/router.js`
  route parsing, route helpers, path matching, route normalization

### Core Shell

- `index.html` loads the main app shell
- `js/core/app.js` coordinates route-driven rendering and page composition
- `pages/` contains HTML fragments for screen-level or modal-level UI blocks
- `css/core/` and `css/shared/` provide reusable visual foundations

### Feature Domains

The codebase is split by product concerns:

- `js/auth/`
- `js/chat/`
- `js/feed/`
- `js/notification/`
- `js/post/`
- `js/profile/`
- `js/realtime/`
- `js/shared/`
- `js/story/`

This keeps the repository understandable even though the product surface spans multiple domains.

## Runtime Flow

At runtime, the application generally works like this:

1. `index.html` or `auth.html` loads the static shell and shared scripts.
2. Configuration is initialized through `window.APP_CONFIG`.
3. The router resolves the current hash route.
4. `js/core/app.js` composes the screen from page fragments and feature modules.
5. `js/config/configAPI.js` manages API requests, credentials, and token refresh logic.
6. Realtime modules keep chat, post, and user-related UI in sync with backend events.

This explicit flow is one of the strengths of the repository. The behavior is easy to trace without a framework runtime hiding it.

## Realtime and Session Handling

The client includes a few implementation details that are especially relevant in a real product:

- `js/shared/auth-store.js`
  maintains access token state in session storage and supports legacy migration
- `js/config/configAPI.js`
  retries API calls after refresh-token recovery and keeps auth state synchronized
- `js/realtime/signalr.js`
  handles SignalR startup, reconnect logic, and connection lifecycle
- `js/realtime/chat-hub.js`, `post-hub.js`, and `user-hub.js`
  coordinate feature-specific realtime behavior

This is not just a static frontend. It is a client built to operate against a realtime backend with authenticated sessions.

## Repository Structure

```text
CloudM.Client/
|-- assets/
|-- css/
|   |-- auth/
|   |-- chat/
|   |-- core/
|   |-- feed/
|   |-- notification/
|   |-- post/
|   |-- profile/
|   |-- shared/
|   `-- story/
|-- js/
|   |-- auth/
|   |-- chat/
|   |-- config/
|   |-- core/
|   |-- feed/
|   |-- notification/
|   |-- post/
|   |-- profile/
|   |-- realtime/
|   |-- shared/
|   `-- story/
|-- pages/
|-- auth.html
|-- index.html
`-- package.json
```

Current repository scale:

- 57 JavaScript files
- 37 CSS files
- 14 HTML page or partial files

That size is intentional. The repository shows how a non-framework frontend can stay organized as the application grows.

## Key Entry Points

- `index.html`
  main application entry point
- `auth.html`
  authentication entry point
- `js/core/app.js`
  route-driven bootstrap and UI composition
- `js/config/config.js`
  global config and UI/runtime constants
- `js/config/configAPI.js`
  API orchestration and refresh-token-aware request flow
- `js/realtime/signalr.js`
  SignalR connection bootstrap and reconnect lifecycle

## Configuration

Most runtime configuration lives in:

- `js/config/config.js`
- `js/config/configAPI.js`

Typical values to adjust:

- `API_BASE`
- `API_BASE_CANDIDATES`
- `HUB_BASE`
- `HUB_BASE_CANDIDATES`
- `GOOGLE_CLIENT_ID`
- page-size limits
- upload limits
- chat-related client-side constraints

The current client is optimized for local loopback development and can probe common backend endpoints such as:

- `https://localhost:5000`
- `http://localhost:5270`
- `https://127.0.0.1:5000`
- `http://127.0.0.1:5270`

## Local Development

### Prerequisites

- a local static file server
- the CloudM backend API running locally

Examples of static servers:

- VS Code Live Server
- `npx serve`
- any equivalent static host

### Run

Serve the repository root through a local web server, then open:

- `auth.html` for auth flows
- `index.html` for the main application shell

Do not open the files directly from the file system. Running behind a local server is required for routing, fetch, cookies, and browser security behavior.

## Dependency Model

The dependency surface is intentionally small:

- SignalR client
- Lucide icons
- html2canvas
- Axios

The application is primarily delivered as static assets, which keeps local setup light and deployment straightforward.

## Engineering Notes

This repository is designed to highlight a few specific frontend strengths:

- building a broad product surface without framework lock-in
- keeping realtime UX stable across reconnect and token refresh scenarios
- organizing plain JavaScript into maintainable feature boundaries
- sharing behavior consistently across feed, chat, story, profile, and notification interfaces
- using the browser platform directly while still maintaining codebase discipline

If you are reviewing this repository as part of my work, the strongest signal is the architecture: a structured vanilla frontend that handles routing, session state, realtime behavior, shared UI systems, and multi-domain product complexity without collapsing into script chaos.
