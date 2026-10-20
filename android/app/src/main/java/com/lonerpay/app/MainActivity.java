package com.lonerpay.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
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

/** Browser-owned HTTPS sessions preserve the existing login and payment flows. */
public final class MainActivity extends Activity {
    private TextView message;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout screen = new LinearLayout(this);
        screen.setOrientation(LinearLayout.VERTICAL);
        screen.setGravity(Gravity.CENTER);
        screen.setPadding(dp(28), dp(32), dp(28), dp(32));
        screen.setBackgroundColor(Color.rgb(250,248,242));
        ImageView logo = new ImageView(this);
        logo.setImageResource(com.lonerpay.app.R.drawable.app_logo);
        logo.setContentDescription("LonerPay");
        screen.addView(logo, new LinearLayout.LayoutParams(dp(144),dp(144)));
        TextView title = new TextView(this);
        title.setText("LonerPay"); title.setTextSize(30); title.setTextColor(Color.rgb(40,37,30));
        title.setGravity(Gravity.CENTER); screen.addView(title);
        message = new TextView(this);
        message.setText("One app. Everyday payments."); message.setTextSize(16);
        message.setGravity(Gravity.CENTER); message.setPadding(0,dp(14),0,dp(24));
        screen.addView(message);
        Button retry = new Button(this); retry.setText("Open LonerPay");
        retry.setOnClickListener(v -> openApp()); screen.addView(retry);
        addLink(screen,"Help & support","https://lonerpay.com/contact.html");
        addLink(screen,"Privacy policy","https://lonerpay.com/privacy.html");
        addLink(screen,"Delete account & data","https://lonerpay.com/delete-account.html");
        setContentView(screen);
        if(state == null) openApp();
    }
    private void addLink(LinearLayout screen,String title,String url) {
        Button b = new Button(this); b.setText(title);
        b.setOnClickListener(v -> {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch(ActivityNotFoundException e) { Toast.makeText(this,"Install or enable a web browser to continue.",Toast.LENGTH_LONG).show(); }
        }); screen.addView(b);
    }
    private void openApp() {
        ConnectivityManager cm = (ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
        NetworkCapabilities cap = cm == null ? null : cm.getNetworkCapabilities(cm.getActiveNetwork());
        if(cap == null || !cap.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
            message.setText("You’re offline. Connect to Wi-Fi or mobile data, then tap Open LonerPay. Payments need an internet connection.");
            return;
        }
        // LauncherActivity requires NEW_TASK. Supplying it here avoids its internal
        // restart while the first launcher instance is still alive.
        Intent launch = new Intent(this, WebActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { startActivity(launch); }
        catch(ActivityNotFoundException e) { message.setText("Install or enable a compatible browser, then try again."); }
    }
    private int dp(int value) { return Math.round(value*getResources().getDisplayMetrics().density); }
}
