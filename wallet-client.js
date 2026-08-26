(async function loadSecureWallet() {
  const balanceElement = document.querySelector(".balance h2");
  const accessToken = localStorage.getItem("lonerpay_access_token");

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
      localStorage.removeItem("lonerpay_access_token");
      localStorage.removeItem("lonerpay_refresh_token");
      window.location.href = "index.html";
      return;
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
})();
