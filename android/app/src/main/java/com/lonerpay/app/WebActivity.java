package com.lonerpay.app;

import android.net.Uri;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** Only the owned HTTPS login page can be used as the native entry point. */
public final class WebActivity extends LauncherActivity {
    static final String OPEN_SAVED_SESSION = "com.lonerpay.app.OPEN_SAVED_SESSION";
    @Override protected Uri getLaunchingUrl() {
        return Uri.parse(getIntent().getBooleanExtra(OPEN_SAVED_SESSION,false)
            ? "https://lonerpay.com/dashboard.html" : "https://lonerpay.com/index.html");
    }
}
