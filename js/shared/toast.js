let toastTimeout;

function showToast(message, type = "info", duration = 3000) {
  let toast = document.querySelector(".toast-notification");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast-notification";
    document.body.appendChild(toast);
  }

  toast.className = "toast-notification";
  toast.classList.add(type);

  toast.textContent = message;

  toast.offsetHeight;

  toast.classList.add("show");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

window.toastSuccess = (msg) => showToast(msg, "success");
window.toastError = (msg) => showToast(msg, "error");
window.toastInfo = (msg) => showToast(msg, "info");
