document.addEventListener("DOMContentLoaded", function () {
  const modal = document.getElementById("modal");
  const form = document.getElementById("authForm");

  let configPromise;

  function getConfig() {
    if (!configPromise) {
      configPromise = fetch("/api/config").then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load configuration");
        }

        return data;
      });
    }

    return configPromise;
  }

  window.showModal = function (type) {
    if (!modal) return;

    modal.dataset.authMode = type;
    modal.style.display = "flex";

    const title = modal.querySelector("#modalTitle");
    const text = modal.querySelector("#modalText");
    const email = modal.querySelector("input[name='email']");
    const password = modal.querySelector("input[name='password']");

    if (type === "login") {
      if (title) title.textContent = "Log in to LonerPay";
      if (text) {
        text.textContent =
          "Enter your email address and password.";
      }
      if (password) password.autocomplete = "current-password";
    } else {
      if (title) title.textContent = "Create your LonerPay account";
      if (text) {
        text.textContent =
          "Enter your email address and create a password.";
      }
      if (password) password.autocomplete = "new-password";
    }

    if (email) email.focus();
  };

  window.closeModal = function () {
    if (modal) modal.style.display = "none";
  };

  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) {
        closeModal();
      }
    });
  }

  document
    .querySelectorAll(".close, .modal-close, [data-close-modal]")
    .forEach(function (button) {
      button.addEventListener("click", closeModal);
    });

  document
    .querySelectorAll(
      "[data-action='get-started'], .get-started"
    )
    .forEach(function (button) {
      button.addEventListener("click", function () {
        showModal("signup");
      });
    });

  document
    .querySelectorAll(
      "[data-action='login'], .login-button"
    )
    .forEach(function (button) {
      button.addEventListener("click", function () {
        showModal("login");
      });
    });

  if (!form) return;

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = form
      .querySelector("input[name='email']")
      .value.trim();

    const password = form
      .querySelector("input[name='password']")
      .value;

    const mode = modal.dataset.authMode || "signup";
    const submitButton = form.querySelector(
      "button[type='submit']"
    );

    if (!email || !password) {
      alert("Please enter your email and password.");
      return;
    }

    if (password.length < 6) {
      alert("Password must contain at least 6 characters.");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent =
      mode === "login" ? "Logging in..." : "Creating account...";

    try {
      const config = await getConfig();

      const endpoint =
        mode === "login"
          ? "/auth/v1/token?grant_type=password"
          : "/auth/v1/signup";

      const response = await fetch(
        config.supabaseUrl + endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: config.supabasePublishableKey
          },
          body: JSON.stringify({ email, password })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.msg ||
          data.message ||
          data.error_description ||
          data.error ||
          "Authentication failed"
        );
      }

      if (data.access_token) {
        localStorage.setItem(
          "lonerpay_access_token",
          data.access_token
        );

        if (data.refresh_token) {
          localStorage.setItem(
            "lonerpay_refresh_token",
            data.refresh_token
          );
        }

        window.location.href = "dashboard.html";
        return;
      }

      alert(
        "Account created. Check your email and confirm your account, then log in."
      );

      form.reset();
      closeModal();
    } catch (error) {
      alert(error.message);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Continue";
    }
  });
}); 
