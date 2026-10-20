package com.lonerpay.app;

import android.net.Uri;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** Only the owned HTTPS login page can be used as the native entry point. */
public final class WebActivity extends LauncherActivity {
    @Override protected Uri getLaunchingUrl() {
        return Uri.parse("https://lonerpay.com/index.html");
    }
}
