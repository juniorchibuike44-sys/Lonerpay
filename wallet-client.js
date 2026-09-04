async function refreshSecureWallet() {
  const balanceElement = document.querySelector(".balance h2");
  let accessToken = localStorage.getItem("lonerpay_access_token");
const refreshToken = localStorage.getItem("lonerpay_refresh_token"); 

  const demoButton = Array.from(document.querySelectorAll("button")).find(
    button => button.textContent.includes("Add Demo Funds")
  );

  if (demoButton) {
    demoButton.style.display = "none";
  }

  window.addDemoFunds = function () {
    alert("Demo wallet funding has been disabled.");
  };

  localStorage.removeItem("lonerpay_balance");

  if (!accessToken) {
    window.location.href = "index.html";
    return;
  }

  if (balanceElement) {
    balanceElement.textContent = "Loading...";
  }

  try {
    const response = await fetch("/api/wallet", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });

    const data = await response.json();

    if (response.status === 401) {
    if (!refreshToken) {
        localStorage.removeItem("lonerpay_access_token");
        localStorage.removeItem("lonerpay_refresh_token");
        window.location.href = "index.html";
        return;
    }

    const configResponse = await fetch("/api/config", {
        cache: "no-store"
    });
    const config = await configResponse.json();

    const refreshResponse = await fetch(
        `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: config.supabasePublishableKey
            },
            body: JSON.stringify({
                refresh_token: refreshToken
            })
        }
    );

    const refreshed = await refreshResponse.json();

    if (!refreshResponse.ok || !refreshed.access_token) {
        localStorage.removeItem("lonerpay_access_token");
        localStorage.removeItem("lonerpay_refresh_token");
        window.location.href = "index.html";
        return;
    }

    localStorage.setItem(
        "lonerpay_access_token",
        refreshed.access_token
    );

    if (refreshed.refresh_token) {
        localStorage.setItem(
            "lonerpay_refresh_token",
            refreshed.refresh_token
        );
    }

    return refreshSecureWallet();
    } 

    if (!response.ok) {
      throw new Error(data.error || "Could not load wallet");
    }

    const secureBalance = Number(data.balance);

    if (!Number.isFinite(secureBalance)) {
      throw new Error("Invalid wallet balance");
    }

    if (typeof walletBalance !== "undefined") {
      walletBalance = secureBalance;
    }

    if (balanceElement) {
      balanceElement.textContent = `₦${secureBalance.toFixed(2)}`;
    }
  } catch (error) {
    console.error("Secure wallet error:", error);

    if (balanceElement) {
      balanceElement.textContent = "Unavailable";
    }
  }
}

window.refreshSecureWallet = refreshSecureWallet;
refreshSecureWallet();
function removeDemoFundsControl() {
  document
    .querySelectorAll("button, a, [role='button']")
    .forEach(element => {
      if (element.textContent.includes("Add Demo Funds")) {
        element.remove();
      }
    });
}

removeDemoFundsControl();
setTimeout(removeDemoFundsControl, 500); 
