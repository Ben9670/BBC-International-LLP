// Fade-in on page load
document.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => {
    document.body.classList.add("fade-in");
  });
});

// Fade-out on link click
document.querySelectorAll("a").forEach(link => {
  const href = link.getAttribute("href");

  if (!href || href.startsWith("#") || href.includes("javascript")) return;

  link.addEventListener("click", (e) => {
    e.preventDefault();

    document.body.classList.remove("fade-in");
    document.body.classList.add("fade-out");

    setTimeout(() => {
      window.location.href = href;
    }, 500); // Match CSS transition
  });
});

