document.addEventListener("DOMContentLoaded", function () {
  const modal = document.getElementById("modal");
  const form = document.getElementById("authForm");
  const passkeyLoginButton = document.getElementById("passkeyLoginButton");
  const passkeyHelp = document.getElementById("passkeyHelp");
  const signupNameFields = document.getElementById("signupNameFields");
  const signupExtraFields = document.getElementById("signupExtraFields");
  const emailVerificationStep = document.getElementById("emailVerificationStep");
  const verificationEmail = document.getElementById("verificationEmail");
  const verifyEmailButton = document.getElementById("verifyEmailButton");
  const biometricModal = document.getElementById("biometricModal");
  const enableBiometricButton = document.getElementById("enableBiometricButton");
  const skipBiometricButton = document.getElementById("skipBiometricButton");

  let signupStep = 1;
  const DEVICE_KEY = "lonerpay_returning_user_v1";
  let welcomeScreen;
  let passkeyBusy = false;
  let configPromise;
  let supabaseClientPromise;

  function rememberedUser() {
    try {
      return JSON.parse(localStorage.getItem(DEVICE_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function rememberUser(session, passkeyEnabled) {
    const user = session.user;
    if (!user || !user.id) return;

    const previous = rememberedUser();

    try {
      localStorage.setItem(
        DEVICE_KEY,
        JSON.stringify({
          userId: user.id,
          firstName: String(user.user_metadata?.first_name || "").slice(0, 50),
          passkeyEnabled:
            passkeyEnabled === true ||
            (previous?.userId === user.id &&
              previous.passkeyEnabled === true)
        })
      );
    } catch (_) {
      // Remembering the welcome screen is optional.
    }
  }

  function supportsPasskeys() {
    return (
      window.isSecureContext &&
      !!window.PublicKeyCredential &&
      !!navigator.credentials
    );
  }

  function goToDashboard() {
    const passwordInput = form?.querySelector("input[name='password']");
    if (passwordInput) passwordInput.value = "";

    window.location.replace("dashboard.html");
  }

  function showWelcome() {
    if (!welcomeScreen) {
      welcomeScreen = document.createElement("section");
      welcomeScreen.id = "lpWelcomeBack";
      welcomeScreen.setAttribute(
        "aria-label",
        "Welcome back to LonerPay"
      );

      welcomeScreen.style.cssText =
        "position:fixed;inset:0;z-index:20000;background:#f4f7fc;" +
        "overflow:auto;display:flex;align-items:center;" +
        "justify-content:center;padding:24px;box-sizing:border-box;" +
        "font-family:Arial,sans-serif";

      welcomeScreen.innerHTML = `
        <div style="width:100%;max-width:390px;text-align:center;color:#12233e">
          <div style="
            width:68px;height:68px;display:grid;place-items:center;
            margin:0 auto 28px;border-radius:22px;background:#0863d8;
            color:white;font-size:36px;font-weight:bold
          ">L</div>

          <div style="
            font-size:13px;color:#0863d8;font-weight:bold;
            letter-spacing:2px
          ">LONERPAY</div>

          <h1 id="lpWelcomeTitle" style="
            font-size:30px;margin:16px 0 10px
          ">Welcome back</h1>

          <p style="
            color:#62718a;line-height:1.6;margin-bottom:28px
          ">Unlock securely and continue to your dashboard.</p>

          <button id="lpWelcomeUnlock" type="button" style="
            width:100%;border:0;border-radius:15px;
            background:#0863d8;color:white;padding:17px;
            font-size:16px;font-weight:bold
          ">Unlock with phone security</button>

          <p id="lpWelcomeHelp" style="
            color:#62718a;font-size:12px;line-height:1.6
          ">Use fingerprint, face, or your device PIN when your phone offers it.</p>

          <p id="lpWelcomeError" role="status" aria-live="polite" style="
            min-height:22px;color:#b42318;font-size:13px;
            line-height:1.5
          "></p>

          <button id="lpWelcomePassword" type="button" style="
            width:100%;background:white;border:1px solid #d8e2ef;
            border-radius:15px;color:#12233e;padding:15px;
            font-size:14px;font-weight:bold
          ">Use email and password</button>

          <button id="lpWelcomeSwitch" type="button" style="
            border:0;background:transparent;color:#62718a;
            padding:20px;font-size:13px
          ">Use another account</button>
        </div>
      `;

      document.body.appendChild(welcomeScreen);

      welcomeScreen.querySelector("#lpWelcomeUnlock").onclick = () =>
        loginWithPasskey(
          welcomeScreen.querySelector("#lpWelcomeUnlock"),
          welcomeScreen.querySelector("#lpWelcomeError")
        );

      welcomeScreen.querySelector("#lpWelcomePassword").onclick = () => {
        if (passkeyBusy) return;
        showModal("login");
      };

      welcomeScreen.querySelector("#lpWelcomeSwitch").onclick = () => {
        if (passkeyBusy) return;

        localStorage.removeItem(DEVICE_KEY);
        localStorage.removeItem("lonerpay_access_token");
        localStorage.removeItem("lonerpay_refresh_token");

        form?.reset();
        showModal("login");
      };
    }

    const remembered = rememberedUser();

    welcomeScreen.querySelector("#lpWelcomeTitle").textContent =
      remembered?.firstName
        ? "Welcome back, " + remembered.firstName
        : "Welcome back";

    const unlock = welcomeScreen.querySelector("#lpWelcomeUnlock");
    unlock.hidden = !supportsPasskeys();

    welcomeScreen.querySelector("#lpWelcomeHelp").textContent =
      supportsPasskeys()
        ? remembered?.passkeyEnabled
          ? "Use fingerprint, face, or your device PIN when your phone offers it."
          : "If you have not set up phone security for LonerPay, log in with email and password once to enable it."
        : "Phone security is unavailable in this browser. Use email and password.";

    welcomeScreen.style.display = "flex";
    if (modal) modal.style.display = "none";

    (
      supportsPasskeys()
        ? unlock
        : welcomeScreen.querySelector("#lpWelcomePassword")
    ).focus();
  }

  async function loginWithPasskey(button, errorElement) {
    if (passkeyBusy) return;

    passkeyBusy = true;
    const oldText = button.textContent;

    button.disabled = true;
    button.textContent = "Waiting for phone security…";

    if (errorElement) errorElement.textContent = "";

    try {
      if (!supportsPasskeys()) {
        throw new Error("Use email and password in this browser.");
      }

      const client = await getSupabaseClient();

      if (typeof client.auth.signInWithPasskey !== "function") {
        throw new Error(
          "Phone security could not load. Please use email and password."
        );
      }

      const { data, error } = await client.auth.signInWithPasskey();
      if (error) throw error;

      if (!saveSession(data?.session)) {
        throw new Error(
          "No secure login session was returned. Please try again."
        );
      }

      rememberUser(data.session, true);
      goToDashboard();
    } catch (error) {
      const message =
        error.name === "NotAllowedError" ||
        /cancel|aborted/i.test(error.message || "")
          ? "Unlock was cancelled. Try again or use email and password."
          : "Phone-security login was not completed. Try again, or use email and password to set it up.";

      if (errorElement) {
        errorElement.textContent = message;
      } else {
        alert(message);
      }
    } finally {
      passkeyBusy = false;
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function askForBiometricSetup() {
    return new Promise((resolve) => {
      if (
        !biometricModal ||
        !enableBiometricButton ||
        !skipBiometricButton
      ) {
        resolve(false);
        return;
      }

      biometricModal.style.display = "flex";

      enableBiometricButton.onclick = function () {
        biometricModal.style.display = "none";
        resolve(true);
      };

      skipBiometricButton.onclick = function () {
        biometricModal.style.display = "none";
        resolve(false);
      };
    });
  }

  function getConfig() {
    if (!configPromise) {
      configPromise = fetch("/api/config")
        .then(async (response) => {
          const data = await response.json();

          if (!response.ok) {
            throw new Error(
              data.error || "Unable to load configuration"
            );
          }

          return data;
        })
        .catch((error) => {
          configPromise = undefined;
          throw error;
        });
    }

    return configPromise;
  }

  async function getSupabaseClient() {
    if (!supabaseClientPromise) {
      supabaseClientPromise = (async () => {
        const config = await getConfig();

        if (!window.supabase || !window.supabase.createClient) {
          throw new Error(
            "Secure biometric login could not be loaded. Please use email and password."
          );
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
      })().catch((error) => {
        supabaseClientPromise = undefined;
        throw error;
      });
    }

    return supabaseClientPromise;
  }

  function saveSession(session) {
    if (!session || !session.access_token) return false;

    localStorage.setItem(
      "lonerpay_access_token",
      session.access_token
    );

    if (session.refresh_token) {
      localStorage.setItem(
        "lonerpay_refresh_token",
        session.refresh_token
      );
    }

    rememberUser(session);
    return true;
  }

  function updatePasskeyUI(type) {
    const supported = supportsPasskeys();

    if (passkeyLoginButton) {
      passkeyLoginButton.style.display =
        type === "login" && supported ? "block" : "none";
    }

    if (passkeyHelp) {
      passkeyHelp.style.display =
        type === "login" && supported ? "block" : "none";
    }
  }

  window.showModal = function (type) {
    if (!modal || passkeyBusy) return;

    if (welcomeScreen) welcomeScreen.style.display = "none";

    modal.dataset.authMode = type;
    modal.style.display = "flex";

    const title = modal.querySelector("#modalTitle");
    const text = modal.querySelector("#modalText");
    const email = modal.querySelector("input[name='email']");
    const password = modal.querySelector("input[name='password']");

    if (email) email.style.display = "";
    if (password) password.style.display = "";

    const submitButton = form.querySelector("button[type='submit']");

    if (submitButton) {
      submitButton.style.display = "";
      submitButton.disabled = false;
      submitButton.textContent = "Continue";
    }

    if (type === "login") {
      if (title) title.textContent = "Log in to LonerPay";

      if (text) {
        text.textContent =
          "Enter your email and password, or unlock with your phone’s passkey security.";
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

    signupStep = 1;

    if (signupNameFields) {
      signupNameFields.style.display =
        type === "signup" ? "block" : "none";
    }

    if (signupExtraFields) {
      signupExtraFields.style.display = "none";
    }

    if (emailVerificationStep) {
      emailVerificationStep.style.display = "none";
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

  document
    .querySelectorAll(".close, .modal-close, [data-close-modal]")
    .forEach(function (button) {
      button.addEventListener("click", closeModal);
    });

  document
    .querySelectorAll("[data-action='get-started'], .get-started")
    .forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        showModal("signup");
      });
    });

  document
    .querySelectorAll("[data-action='login'], .login-button")
    .forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        showModal("login");
      });
    });

  if (passkeyLoginButton) {
    passkeyLoginButton.textContent = "Unlock with phone security";

    passkeyLoginButton.addEventListener("click", () =>
      loginWithPasskey(passkeyLoginButton)
    );
  }

  if (passkeyHelp) {
    passkeyHelp.textContent =
      "Use a registered passkey with fingerprint, face, or your device PIN when offered by your phone.";
  }

  if (
    rememberedUser() ||
    localStorage.getItem("lonerpay_access_token")
  ) {
    showWelcome();
  }

  if (!form) return;

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = form
      .querySelector("input[name='email']")
      .value.trim();

    const password = form.querySelector(
      "input[name='password']"
    ).value;

    const mode = modal.dataset.authMode || "signup";
    const submitButton = form.querySelector("button[type='submit']");

    if (mode === "signup" && signupStep === 1) {
      const firstName = form
        .querySelector("input[name='firstName']")
        .value.trim();

      const lastName = form
        .querySelector("input[name='lastName']")
        .value.trim();

      if (!firstName || !lastName || !email || !password) {
        alert(
          "Please complete your first name, last name, email and password."
        );
        return;
      }

      if (password.length < 6) {
        alert("Password must contain at least 6 characters.");
        return;
      }

      signupStep = 2;

      if (signupNameFields) {
        signupNameFields.style.display = "none";
      }

      if (signupExtraFields) {
        signupExtraFields.style.display = "block";
      }

      form.querySelector("input[name='email']").style.display = "none";
      form.querySelector("input[name='password']").style.display =
        "none";

      const title = modal.querySelector("#modalTitle");
      const text = modal.querySelector("#modalText");

      if (title) title.textContent = "You're Almost There";

      if (text) {
        text.textContent =
          "Complete your details to finish creating your LonerPay account.";
      }

      submitButton.textContent = "Sign Up";
      return;
    }

    if (mode === "signup" && signupStep === 2) {
      const country = form
        .querySelector("input[name='country']")
        .value.trim();

      const phone = form
        .querySelector("input[name='phone']")
        .value.trim();

      if (!country || !phone) {
        alert("Please enter your country and phone number.");
        return;
      }
    }

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

      const response = await fetch(config.supabaseUrl + endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.supabasePublishableKey
        },
        body: JSON.stringify(
          mode === "signup"
            ? {
                email,
                password,
                data: {
                  first_name: form
                    .querySelector("input[name='firstName']")
                    .value.trim(),
                  last_name: form
                    .querySelector("input[name='lastName']")
                    .value.trim(),
                  country: form
                    .querySelector("input[name='country']")
                    .value.trim(),
                  phone: form
                    .querySelector("input[name='phone']")
                    .value.trim(),
                  referral_code: form
                    .querySelector("input[name='referralCode']")
                    .value.trim()
                }
              }
            : { email, password }
        )
      });

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
        saveSession(data);

        // Register a passkey only after a successful password login.
        if (
          mode === "login" &&
          supportsPasskeys() &&
          !rememberedUser()?.passkeyEnabled
        ) {
          const wantsPasskey = await askForBiometricSetup();

          if (wantsPasskey) {
            try {
              const client = await getSupabaseClient();

              const { error: sessionError } =
                await client.auth.setSession({
                  access_token: data.access_token,
                  refresh_token: data.refresh_token || ""
                });

              if (sessionError) throw sessionError;

              const { error: passkeyError } =
                await client.auth.registerPasskey();

              if (passkeyError) throw passkeyError;

              const { data: active, error: activeError } =
                await client.auth.getSession();

              if (activeError) throw activeError;

              if (!saveSession(active?.session)) {
                throw new Error(
                  "Please log in again to finish setup."
                );
              }

              rememberUser(active.session, true);

              alert(
                "Phone-security login is now set up. Next time, unlock with your registered passkey."
              );
            } catch (passkeyError) {
              alert(
                "Your normal login succeeded, but biometric setup was not completed: " +
                  (passkeyError.message || "Unknown passkey error")
              );
            }
          }
        }

        goToDashboard();
        return;
      }

      if (mode === "signup" && emailVerificationStep) {
        signupStep = 3;

        if (signupNameFields) {
          signupNameFields.style.display = "none";
        }

        if (signupExtraFields) {
          signupExtraFields.style.display = "none";
        }

        form.querySelector("input[name='email']").style.display =
          "none";

        form.querySelector("input[name='password']").style.display =
          "none";

        submitButton.style.display = "none";

        if (verificationEmail) {
          verificationEmail.textContent = email;
        }

        emailVerificationStep.style.display = "block";

        const title = modal.querySelector("#modalTitle");
        const text = modal.querySelector("#modalText");

        if (title) title.textContent = "Verify Your Email";

        if (text) {
          text.textContent =
            "Check your email for the verification message from LonerPay.";
        }

        return;
      }
    } catch (error) {
      alert(error.message);
    } finally {
      submitButton.disabled = false;

      if (signupStep !== 3) {
        submitButton.textContent = "Continue";
      }
    }
  });
}); 
