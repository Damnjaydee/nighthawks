// Time-Based Background
const hour = new Date().getHours();
let background = "";

if (hour >= 5 && hour < 8) {
  background = "bg-sunrise.jpg";
} else if (hour >= 8 && hour < 16) {
  background = "bg-morning.jpg";
} else if (hour >= 16 && hour < 19) {
  background = "bg-sunset.jpg";
} else if (hour >= 19 && hour < 21) {
  background = "bg-night.jpg";
} else {
  background = "bg-night-sky.jpg";
}

document.body.style.backgroundImage = `url('assets/${background}')`;
document.body.style.backgroundSize = "cover";
document.body.style.backgroundRepeat = "no-repeat";
document.body.style.backgroundPosition = "center";

// Wait for DOM to load
document.addEventListener("DOMContentLoaded", function () {
  // Headshot Image Preview
  const fileInput = document.getElementById("headshot");
  const previewCircle = document.querySelector(".headshot-preview");

  if (fileInput && previewCircle) {
    fileInput.addEventListener("change", function () {
      const file = fileInput.files[0];
      if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = function (e) {
          previewCircle.style.backgroundImage = `url('${e.target.result}')`;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Login Handler
  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();

      const username = document.getElementById("username").value.trim();
      const password = document.getElementById("password").value.trim();

      // TEMP MOCK LOGIN
      if (username === "admin" && password === "1234") {
        window.location.href = "dashboard.html";
      } else {
        alert("Invalid login. Please try again.");
      }
    });
  }
});
