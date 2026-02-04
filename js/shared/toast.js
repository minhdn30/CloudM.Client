let toastTimeout;

function showToast(message, type = "info", duration = 3000, isHtml = false) {
  let toast = document.querySelector(".toast-notification");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast-notification";
    document.body.appendChild(toast);
  }

  toast.className = "toast-notification";
  toast.classList.add(type);

  if (isHtml) {
    toast.innerHTML = message;
  } else {
    toast.textContent = message;
  }

  toast.offsetHeight;

  toast.classList.add("show");

  clearTimeout(toastTimeout);
  if (duration > 0) {
    toastTimeout = setTimeout(() => {
      toast.classList.remove("show");
    }, duration);
  }
}

window.closeToast = () => {
    const toast = document.querySelector(".toast-notification");
    if (toast) toast.classList.remove("show");
};

window.toastSuccess = (msg) => showToast(msg, "success");
window.toastError = (msg) => showToast(msg, "error");
window.toastInfo = (msg) => showToast(msg, "info");
