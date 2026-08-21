document.addEventListener("DOMContentLoaded", function () {
  const modal = document.getElementById("modal");

  // Open the account modal
  window.showModal = function (type) {
    if (!modal) return;

    modal.style.display = "flex";

    const title = modal.querySelector("h2, h3");
    const text = modal.querySelector("p");

    if (type === "login") {
      if (title) title.textContent = "Log in to LonerPay";
      if (text) text.textContent = "Enter your details to continue using LonerPay.";
    } else {
      if (title) title.textContent = "Create your LonerPay account";
      if (text) text.textContent = "Create an account to start using LonerPay.";
    }
  };

  // Close modal
  window.closeModal = function () {
    if (modal) modal.style.display = "none";
  };

  // Close when clicking outside the modal
  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        closeModal();
      }
    });
  }

  // Close buttons
  document.querySelectorAll(
    ".close, .modal-close, [data-close-modal]"
  ).forEach(function (button) {
    button.addEventListener("click", closeModal);
  });

  // Get Started buttons
  document.querySelectorAll(
    "[data-action='get-started'], .get-started"
  ).forEach(function (button) {
    button.addEventListener("click", function () {
      showModal("signup");
    });
  });

  // Login buttons
  document.querySelectorAll(
    "[data-action='login'], .login-button"
  ).forEach(function (button) {
    button.addEventListener("click", function () {
      showModal("login");
    });
  });

  // Prevent demo forms from refreshing the page
  document.querySelectorAll("form").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();

      const phone = form.querySelector(
        "input[type='tel'], input[name='phone']"
      );

      const password = form.querySelector(
        "input[type='password'], input[name='password']"
      );

      if (phone && phone.value.trim() === "") {
        alert("Please enter your phone number.");
        phone.focus();
        return;
      }

      if (password && password.value.trim() === "") {
        alert("Please enter your password.");
        password.focus();
        return;
      }
window.location.href = "dashboard.html";
      
    });
  });
});
