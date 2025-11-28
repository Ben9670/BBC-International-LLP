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


(function () {
    const viewport = document.querySelector(".xy-gallery-viewport");
    const canvas = document.querySelector(".xy-gallery-canvas");

    if (!viewport || !canvas) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    // For keeping track of offset between drags
    let lastX = 0;
    let lastY = 0;

    // Helper: clamp value between min & max
    const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

    // Compute movement limits based on sizes
    function getBounds() {
      const vpRect = viewport.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();

      // How much bigger canvas is than viewport
      const maxOffsetX = (canvasRect.width - vpRect.width) / 2;
      const maxOffsetY = (canvasRect.height - vpRect.height) / 2;

      return {
        minX: -maxOffsetX,
        maxX: maxOffsetX,
        minY: -maxOffsetY,
        maxY: maxOffsetY,
      };
    }

    function startDrag(e) {
      isDragging = true;
      canvas.style.transition = "none";

      const event = e.type.startsWith("touch") ? e.touches[0] : e;
      startX = event.clientX;
      startY = event.clientY;

      // keep lastX/lastY as base
      document.body.style.cursor = "grabbing";
    }

    function onDrag(e) {
      if (!isDragging) return;

      const event = e.type.startsWith("touch") ? e.touches[0] : e;

      const dx = event.clientX - startX;
      const dy = event.clientY - startY;

      const { minX, maxX, minY, maxY } = getBounds();

      currentX = clamp(lastX + dx, minX, maxX);
      currentY = clamp(lastY + dy, minY, maxY);

      canvas.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    }

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      lastX = currentX;
      lastY = currentY;
      canvas.style.transition = "transform 0.15s ease-out";
      document.body.style.cursor = "default";
    }

    // Mouse events
    viewport.addEventListener("mousedown", startDrag);
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", endDrag);

    // Touch events (mobile)
    viewport.addEventListener("touchstart", startDrag, { passive: false });
    window.addEventListener("touchmove", onDrag, { passive: false });
    window.addEventListener("touchend", endDrag);

    // Optional: center canvas initially
    window.addEventListener("load", () => {
      // Recalculate bounds after load
      const { minX, maxX, minY, maxY } = getBounds();
      currentX = lastX = (minX + maxX) / 2;
      currentY = lastY = (minY + maxY) / 2;
      canvas.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
    });
  })();


// Elements
const popup = document.getElementById("audio-consent-popup");
const audio = document.getElementById("ambient-audio");
const enableBtn = document.getElementById("enable-sound");
const muteBtn = document.getElementById("mute-sound");

// Check saved preference
const savedChoice = localStorage.getItem("audioConsent");

if (savedChoice === "enabled") {
    playAudioSmooth();
    popup.style.display = "none";
} else if (savedChoice === "muted") {
    popup.style.display = "none";
}

// Smooth fade-in audio
function playAudioSmooth() {
    audio.volume = 0;
    audio.play();

    let vol = 0;
    const fade = setInterval(() => {
        if (vol < 0.5) {
            vol += 0.02;
            audio.volume = vol;
        } else {
            clearInterval(fade);
        }
    }, 120);
}

// On button clicks
enableBtn.onclick = () => {
    localStorage.setItem("audioConsent", "enabled");
    playAudioSmooth();
    popup.remove();
};

muteBtn.onclick = () => {
    localStorage.setItem("audioConsent", "muted");
    popup.remove();
};



/* ==========================
   FULLSCREEN IMAGE VIEWER
========================== */

const tiles = document.querySelectorAll(".tile-container img");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const closeBtn = document.querySelector(".lightbox-close");

// Open viewer
tiles.forEach(tile => {
  tile.addEventListener("click", () => {
    lightboxImg.src = tile.src;
    lightbox.classList.add("show");
  });
});

// Close viewer
closeBtn.addEventListener("click", () => {
  lightbox.classList.remove("show");
});

// Close when clicking outside image
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) {
    lightbox.classList.remove("show");
  }
});



const intro = document.getElementById("gallery-intro");
const full = document.getElementById("gallery-full");

// CLICK INTRO → OPEN FULL GALLERY
intro.addEventListener("click", () => {
    intro.classList.add("hidden");
    full.classList.remove("hidden");

    window.scrollTo({ top: 0, behavior: "smooth" });
});
