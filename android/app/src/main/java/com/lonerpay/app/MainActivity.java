package com.lonerpay.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

/** Local biometric unlock opens an existing browser session; it never creates a login session. */
public final class MainActivity extends FragmentActivity {
    private TextView message;
    private Button unlock;
    private BiometricPrompt prompt;
    private SharedPreferences preferences;
    private boolean authenticating;
    private static final String ENABLED = "biometric_unlock_enabled";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        preferences = getSharedPreferences("lonerpay_local_unlock", MODE_PRIVATE);
        LinearLayout screen = new LinearLayout(this);
        screen.setOrientation(LinearLayout.VERTICAL);
        screen.setGravity(Gravity.CENTER);
        screen.setPadding(dp(28), dp(32), dp(28), dp(32));
        screen.setBackgroundColor(Color.rgb(250,248,242));
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.app_logo);
        logo.setContentDescription("LonerPay");
        screen.addView(logo, new LinearLayout.LayoutParams(dp(110),dp(110)));
        TextView title = new TextView(this);
        title.setText("Welcome back"); title.setTextSize(30);
        title.setTextColor(Color.rgb(40,37,30)); title.setGravity(Gravity.CENTER);
        screen.addView(title);
        message = new TextView(this);
        message.setText("Unlock the LonerPay account already signed in on this phone. If your session has expired, sign in again.");
        message.setTextSize(16); message.setGravity(Gravity.CENTER);
        message.setPadding(0,dp(18),0,dp(24)); screen.addView(message);
        unlock = new Button(this);
        unlock.setText(preferences.getBoolean(ENABLED,false) ? "Unlock with biometrics" : "Enable fingerprint unlock");
        unlock.setOnClickListener(v -> authenticate()); screen.addView(unlock);
        Button signIn = new Button(this); signIn.setText("Sign in or use another account");
        signIn.setOnClickListener(v -> launch(false)); screen.addView(signIn);
        addLink(screen,"Help & support","https://lonerpay.com/contact.html");
        addLink(screen,"Privacy policy","https://lonerpay.com/privacy.html");
        setContentView(screen);

        prompt = new BiometricPrompt(this, ContextCompat.getMainExecutor(this),
            new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                    super.onAuthenticationSucceeded(result);
                    authenticating=false; unlock.setEnabled(true);
                    preferences.edit().putBoolean(ENABLED,true).apply();
                    unlock.setText("Unlock with biometrics");
                    launch(true);
                }
                @Override public void onAuthenticationError(int code, @NonNull CharSequence error) {
                    super.onAuthenticationError(code,error);
                    authenticating=false; unlock.setEnabled(true);
                    message.setText("Unlock cancelled or unavailable. Try again, or sign in to your account.");
                    if(code==BiometricPrompt.ERROR_NEGATIVE_BUTTON) launch(false);
                }
                @Override public void onAuthenticationFailed() {
                    super.onAuthenticationFailed();
                    message.setText("Not recognised. Try your phone’s biometric sensor again.");
                }
            });
        if(state==null && preferences.getBoolean(ENABLED,false)) authenticate();
    }

    private void authenticate() {
        if(authenticating)return;
        int available=BiometricManager.from(this).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        if(available!=BiometricManager.BIOMETRIC_SUCCESS) {
            message.setText("Secure biometrics are unavailable. Set up fingerprint unlock in your phone settings, or sign in to LonerPay.");
            return;
        }
        authenticating=true; unlock.setEnabled(false);
        prompt.authenticate(new BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock LonerPay")
            .setSubtitle("Verify with your phone’s biometric sensor")
            .setDescription("Opens your saved LonerPay session. No email selection is needed while that session remains valid.")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButtonText("Sign in instead")
            .build());
    }

    private void launch(boolean verified) {
        ConnectivityManager cm=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
        NetworkCapabilities cap=cm==null?null:cm.getNetworkCapabilities(cm.getActiveNetwork());
        if(cap==null || !cap.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
            message.setText("You’re offline. Connect to Wi-Fi or mobile data, then try again."); return;
        }
        Intent launch=new Intent(this,WebActivity.class);
        // WebActivity is non-exported. Only a successful local biometric callback sets this flag.
        launch.putExtra(WebActivity.OPEN_SAVED_SESSION,verified);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { startActivity(launch); }
        catch(ActivityNotFoundException e) { message.setText("Install or enable a compatible browser, then try again."); }
    }
    private void addLink(LinearLayout screen,String title,String url) {
        Button b=new Button(this); b.setText(title);
        b.setOnClickListener(v -> {
            try { startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url))); }
            catch(ActivityNotFoundException e) { Toast.makeText(this,"Enable a web browser to continue.",Toast.LENGTH_LONG).show(); }
        }); screen.addView(b);
    }
    private int dp(int value) { return Math.round(value*getResources().getDisplayMetrics().density); }
}
