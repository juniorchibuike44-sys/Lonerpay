document.addEventListener("DOMContentLoaded", function () {
  const modal = document.getElementById("modal");
  const form = document.getElementById("authForm");
  const passkeyLoginButton = document.getElementById("passkeyLoginButton");
  const passkeyHelp = document.getElementById("passkeyHelp");

  let configPromise;
  let supabaseClientPromise;

  function getConfig() {
    if (!configPromise) {
      configPromise = fetch("/api/config").then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load configuration");
        return data;
      });
    }
    return configPromise;
  }

  async function getSupabaseClient() {
    if (!supabaseClientPromise) {
      supabaseClientPromise = (async () => {
        const config = await getConfig();
        if (!window.supabase || !window.supabase.createClient) {
          throw new Error("Secure biometric login could not be loaded. Please use email and password.");
        }
        return window.supabase.createClient(
          config.supabaseUrl,
          config.supabasePublishableKey,
          {
            auth: {
              experimental: { passkey: true },
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false
            }
          }
        );
      })();
    }
    return supabaseClientPromise;
  }

  function saveSession(session) {
    if (!session || !session.access_token) return false;
    localStorage.setItem("lonerpay_access_token", session.access_token);
    if (session.refresh_token) {
      localStorage.setItem("lonerpay_refresh_token", session.refresh_token);
    }
    return true;
  }

  function updatePasskeyUI(type) {
    const supported = !!window.PublicKeyCredential;
    if (passkeyLoginButton) {
      passkeyLoginButton.style.display = type === "login" && supported ? "block" : "none";
    }
    if (passkeyHelp) {
      passkeyHelp.style.display = type === "login" && supported ? "block" : "none";
    }
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
      if (text) text.textContent = "Enter your email and password, or use your fingerprint / face passkey.";
      if (password) password.autocomplete = "current-password";
    } else {
      if (title) title.textContent = "Create your LonerPay account";
      if (text) text.textContent = "Enter your email address and create a password.";
      if (password) password.autocomplete = "new-password";
    }

    updatePasskeyUI(type);
    if (email) email.focus();
  };

  window.closeModal = function () {
    if (modal) modal.style.display = "none";
  };

  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeModal();
    });
  }

  document.querySelectorAll(".close, .modal-close, [data-close-modal]").forEach(function (button) {
    button.addEventListener("click", closeModal);
  });

  document.querySelectorAll("[data-action='get-started'], .get-started").forEach(function (button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      showModal("signup");
    });
  });

  document.querySelectorAll("[data-action='login'], .login-button").forEach(function (button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      showModal("login");
    });
  });

  if (passkeyLoginButton) {
    passkeyLoginButton.addEventListener("click", async function () {
      const oldText = passkeyLoginButton.textContent;
      passkeyLoginButton.disabled = true;
      passkeyLoginButton.textContent = "Waiting for phone security...";
      try {
        const client = await getSupabaseClient();
        const { data, error } = await client.auth.signInWithPasskey();
        if (error) throw error;
        if (!saveSession(data && data.session)) throw new Error("Passkey login completed but no secure session was returned.");
        window.location.href = "dashboard.html";
      } catch (error) {
        alert(error.message || "Fingerprint / face login was not completed.");
      } finally {
        passkeyLoginButton.disabled = false;
        passkeyLoginButton.textContent = oldText;
      }
    });
  }

  if (!form) return;

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = form.querySelector("input[name='email']").value.trim();
    const password = form.querySelector("input[name='password']").value;
    const mode = modal.dataset.authMode || "signup";
    const submitButton = form.querySelector("button[type='submit']");

    if (!email || !password) {
      alert("Please enter your email and password.");
      return;
    }
    if (password.length < 6) {
      alert("Password must contain at least 6 characters.");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = mode === "login" ? "Logging in..." : "Creating account...";

    try {
      const config = await getConfig();
      const endpoint = mode === "login" ? "/auth/v1/token?grant_type=password" : "/auth/v1/signup";
      const response = await fetch(config.supabaseUrl + endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.supabasePublishableKey
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.msg || data.message || data.error_description || data.error || "Authentication failed");
      }

      if (data.access_token) {
        saveSession(data);

        // A passkey must be registered while the user already has an authenticated session.
        // Offer registration after a normal password login; cancelling does not affect login.
        if (mode === "login" && window.PublicKeyCredential) {
          const wantsPasskey = confirm(
            "Would you like to set up fingerprint / face login on this device for future LonerPay logins?"
          );
          if (wantsPasskey) {
            try {
              const client = await getSupabaseClient();
              const { error: sessionError } = await client.auth.setSession({
                access_token: data.access_token,
                refresh_token: data.refresh_token || ""
              });
              if (sessionError) throw sessionError;
              const { error: passkeyError } = await client.auth.registerPasskey();
              if (passkeyError) throw passkeyError;
              alert("Fingerprint / face login is now set up for this LonerPay account.");
            } catch (passkeyError) {
              alert(
                "Your normal login succeeded, but biometric setup was not completed: " +
                  (passkeyError.message || "Unknown passkey error")
              );
            }
          }
        }

        window.location.href = "dashboard.html";
        return;
      }

      alert("Account created. Check your email and confirm your account, then log in.");
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
    });

  document
    .querySelectorAll(
      "[data-action='get-started'], .get-started"
    )
    .forEach(function (button) {
      button.addEventListener("click", function (event) { 
        event.preventDefault(); 
        showModal("signup");
      });
    });

  document
    .querySelectorAll(
      "[data-action='login'], .login-button"
    )
    .forEach(function (button) {
      button.addEventListener("click", function (event) { 
       event.preventDefault(); 
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
