package app.otama.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Patterns;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * OTAMA for Android — a focused WebView shell that opens the hosted OTAMA
 * server DIRECTLY. No address screen, no LAN pairing, no router setup: the
 * app works on any internet connection (Wi-Fi or mobile data) because all
 * streaming happens on the hosted server; the app renders the exact same UI
 * as the browser.
 *
 * Self-hosters can still point the app at their own domain via
 * "Use another server" on the connection-error screen — but the hosted
 * server is always the default and only visible destination.
 */
public class MainActivity extends Activity {

    private static final int ACCENT = 0xFFE879F9;
    private static final int BG = 0xFF09090B;
    private static final int ZINC_800 = 0xFF27272A;
    private static final int ZINC_400 = 0xFFA1A1AA;

    /** Direct host: the hosted OTAMA instance (web UI + torrent engine,
     *  fully live). Reachable from any network — this is where the app
     *  opens, always, with zero configuration. */
    private static final String DEFAULT_SERVER_URL = "https://otama.space-z.ai";

    private SharedPreferences prefs;
    private FrameLayout root;
    private FrameLayout contentBox;
    private LinearLayout splashView;
    private LinearLayout errorOverlay;
    private LinearLayout serverOverlay;
    private WebView webView;
    private String connectedUrl = "";
    private boolean firstPageDone = false;

    // fullscreen <video> support
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    private String serverHost = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("otama", MODE_PRIVATE);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        setContentView(root);

        // Content box: everything except fullscreen video lives here and is
        // padded by the real system-bar/cutout/keyboard insets, so the UI is
        // never covered by the status bar, navigation bar, notch or keyboard.
        contentBox = new FrameLayout(this);
        contentBox.setBackgroundColor(BG);
        root.addView(contentBox, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        buildSplash();
        buildWebView();
        applyEdgeToEdge();

        enterWebView(resolveTargetUrl());
    }

    /** Draw edge-to-edge on EVERY Android version (targetSdk 35 enforces it
     *  on Android 15; older versions get the same behavior explicitly), then
     *  pad the content box by the real insets. One uniform code path. */
    private void applyEdgeToEdge() {
        if (Build.VERSION.SDK_INT < 35) {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int t, b, l, r;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(
                        WindowInsets.Type.systemBars()
                                | WindowInsets.Type.displayCutout()
                                | WindowInsets.Type.ime());
                t = i.top; b = i.bottom; l = i.left; r = i.right;
            } else {
                t = insets.getSystemWindowInsetTop();
                b = insets.getSystemWindowInsetBottom();
                l = insets.getSystemWindowInsetLeft();
                r = insets.getSystemWindowInsetRight();
            }
            contentBox.setPadding(l, t, r, b);
            return insets;
        });
    }

    /** Hide system bars while a video plays fullscreen. */
    private void enterImmersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                c.hide(WindowInsets.Type.systemBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    private void exitImmersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) c.show(WindowInsets.Type.systemBars());
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    /**
     * The hosted server is the default (and only visible) destination.
     * A previously saved CUSTOM address is honored only if it is a public
     * host — stale LAN/IP entries from older app versions are dropped once
     * so the app can never cold-start trying to reach a PC that isn't there.
     */
    private String resolveTargetUrl() {
        String saved = prefs.getString("server_url", null);
        if (saved == null || saved.isEmpty()) return DEFAULT_SERVER_URL;
        boolean validHost = false;
        try {
            String h = URI.create(saved).getHost();
            validHost = h != null && !h.isEmpty();
        } catch (Exception e) {
            validHost = false;
        }
        if (!validHost || isPrivateHost(saved)) {
            prefs.edit().remove("server_url").apply(); // one-time cleanup
            return DEFAULT_SERVER_URL;
        }
        return saved;
    }

    /* ------------------------------- splash ------------------------------- */

    /** Brand splash shown while the first page loads (and a touch barrier). */
    private void buildSplash() {
        splashView = new LinearLayout(this);
        splashView.setOrientation(LinearLayout.VERTICAL);
        splashView.setBackgroundColor(BG);
        splashView.setGravity(Gravity.CENTER);
        splashView.setClickable(true);
        splashView.setFocusable(true);

        TextView logo = new TextView(this);
        logo.setText("OTAMA");
        logo.setTextSize(30);
        logo.setTypeface(null, android.graphics.Typeface.BOLD);
        logo.setTextColor(0xFFFAFAFA);
        logo.setLetterSpacing(0.35f);
        logo.setGravity(Gravity.CENTER);
        splashView.addView(logo);

        TextView tag = new TextView(this);
        tag.setText("torrent streaming, everywhere");
        tag.setTextSize(13);
        tag.setTextColor(ZINC_400);
        tag.setGravity(Gravity.CENTER);
        tag.setPadding(0, dp(6), 0, dp(36));
        splashView.addView(tag);

        ProgressBar bar = new ProgressBar(this);
        bar.getIndeterminateDrawable().setColorFilter(ACCENT, android.graphics.PorterDuff.Mode.SRC_IN);
        splashView.addView(bar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        contentBox.addView(splashView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void hideSplash() {
        firstPageDone = true;
        if (splashView != null) splashView.setVisibility(View.GONE);
        if (webView != null && customView == null) webView.setVisibility(View.VISIBLE);
    }

    /* ------------------------------- webview ------------------------------ */

    @SuppressLint("SetJavaScriptEnabled")
    private void buildWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(BG);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setTextZoom(100);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        String ua = s.getUserAgentString();
        s.setUserAgentString(ua + " OTAMA-Android/1.4.0");

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme();
                if (scheme.equals("http") || scheme.equals("https")) {
                    String host = uri.getHost();
                    if (host != null && !host.equals(serverHost)) {
                        // external links (TMDB, provider sites…) open in the browser
                        try {
                            startActivity(new Intent(Intent.ACTION_VIEW, uri));
                        } catch (Exception ignored) { }
                        return true;
                    }
                    return false;
                }
                if (scheme.equals("magnet")) {
                    toast("Add magnets from your OTAMA server UI");
                    return true;
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                hideSplash();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) {
                    runOnUiThread(() -> {
                        hideSplash();
                        showErrorOverlay();
                    });
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customViewCallback = callback;
                webView.setVisibility(View.GONE);
                root.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                enterImmersive();
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                exitImmersive();
                root.removeView(customView);
                customView = null;
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
                webView.setVisibility(View.VISIBLE);
            }
        });

        contentBox.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setVisibility(View.GONE);
    }

    private void enterWebView(String url) {
        try {
            serverHost = URI.create(url).getHost() == null ? "" : URI.create(url).getHost();
        } catch (Exception e) {
            serverHost = "";
        }
        connectedUrl = url;
        hideErrorOverlay();
        if (firstPageDone) {
            webView.setVisibility(View.VISIBLE);
        } else {
            splashView.setVisibility(View.VISIBLE);
            webView.setVisibility(View.GONE);
        }
        webView.loadUrl(url);
    }

    /* --------------------------- connection error --------------------------- */

    /** Shown when the hosted (or custom) server cannot be reached — without
     *  this, a network hiccup would brick the app on a dead error page. */
    private void showErrorOverlay() {
        if (errorOverlay != null) return;
        errorOverlay = new LinearLayout(this);
        errorOverlay.setOrientation(LinearLayout.VERTICAL);
        errorOverlay.setBackgroundColor(BG);
        errorOverlay.setGravity(Gravity.CENTER);
        errorOverlay.setPadding(dp(28), dp(28), dp(28), dp(28));

        TextView title = new TextView(this);
        title.setText("Can't reach OTAMA");
        title.setTextSize(18);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setTextColor(0xFFFAFAFA);
        title.setGravity(Gravity.CENTER);
        errorOverlay.addView(title);

        TextView detail = new TextView(this);
        detail.setText(connectedUrl + "\n\n"
                + "OTAMA streams from a hosted server that should be\n"
                + "reachable on ANY internet connection — Wi-Fi or\n"
                + "mobile data, no setup needed.\n"
                + "Check that your internet is on, then Try again.\n\n"
                + "Running your own OTAMA server on a domain?\n"
                + "Tap \"Use another server\" to point the app at it.");
        detail.setTextSize(13);
        detail.setTextColor(ZINC_400);
        detail.setGravity(Gravity.CENTER);
        detail.setPadding(0, dp(14), 0, 0);
        errorOverlay.addView(detail);

        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setTextColor(0xFF09090B);
        retry.getBackground().setColorFilter(ACCENT, android.graphics.PorterDuff.Mode.SRC_IN);
        retry.setOnClickListener(v -> {
            hideErrorOverlay();
            webView.reload();
        });
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        rp.topMargin = dp(28);
        errorOverlay.addView(retry, rp);

        Button other = new Button(this);
        other.setText("Use another server");
        other.setTextSize(14);
        other.setTextColor(0xFFFAFAFA);
        other.getBackground().setColorFilter(ZINC_800, android.graphics.PorterDuff.Mode.SRC_IN);
        other.setOnClickListener(v -> showServerOverlay());
        LinearLayout.LayoutParams op = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(44));
        op.topMargin = dp(10);
        errorOverlay.addView(other, op);

        contentBox.addView(errorOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void hideErrorOverlay() {
        if (errorOverlay != null) {
            root.removeView(errorOverlay);
            errorOverlay = null;
        }
    }

    /* ------------------------- advanced: custom server ------------------------- */

    /** Out-of-the-way advanced escape hatch for self-hosters. The hosted
     *  server stays the default; anything typed here is only remembered
     *  when it is a public host (private LAN entries are dropped on the
     *  next cold start so the app can never get stuck reaching for a PC). */
    private void showServerOverlay() {
        if (serverOverlay != null) return;
        serverOverlay = new LinearLayout(this);
        serverOverlay.setOrientation(LinearLayout.VERTICAL);
        serverOverlay.setBackgroundColor(BG);
        serverOverlay.setGravity(Gravity.CENTER);
        serverOverlay.setPadding(dp(24), dp(24), dp(24), dp(24));
        serverOverlay.setClickable(true);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackgroundColor(ZINC_800);
        card.setPadding(dp(20), dp(20), dp(20), dp(20));

        TextView title = new TextView(this);
        title.setText("OTAMA server address");
        title.setTextSize(16);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setTextColor(0xFFFAFAFA);
        card.addView(title);

        TextView note = new TextView(this);
        note.setText("Leave empty to always use the hosted server\n"
                + "(otama.space-z.ai) — recommended.");
        note.setTextSize(12);
        note.setTextColor(ZINC_400);
        note.setPadding(0, dp(8), 0, dp(12));
        card.addView(note);

        final EditText input = new EditText(this);
        input.setHint(DEFAULT_SERVER_URL);
        String current = prefs.getString("server_url", "");
        if (current.isEmpty()) current = connectedUrl;
        input.setText(DEFAULT_SERVER_URL.equals(current) ? "" : current);
        input.setTextSize(15);
        input.setTextColor(0xFFFAFAFA);
        input.setHintTextColor(0xFF71717A);
        input.setBackgroundColor(BG);
        input.setPadding(dp(14), dp(12), dp(14), dp(12));
        input.setSingleLine(true);
        input.setInputType(android.text.InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_GO);
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO) { applyServerInput(input); return true; }
            return false;
        });
        card.addView(input, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button save = new Button(this);
        save.setText("Save");
        save.setTextColor(0xFF09090B);
        save.getBackground().setColorFilter(ACCENT, android.graphics.PorterDuff.Mode.SRC_IN);
        save.setOnClickListener(v -> applyServerInput(input));
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(46));
        sp.topMargin = dp(16);
        card.addView(save, sp);

        Button hosted = new Button(this);
        hosted.setText("Use hosted server");
        hosted.setTextColor(0xFFFAFAFA);
        hosted.getBackground().setColorFilter(BG, android.graphics.PorterDuff.Mode.SRC_IN);
        hosted.setOnClickListener(v -> {
            prefs.edit().remove("server_url").apply();
            hideServerOverlay();
            toast("Using the hosted OTAMA server");
            enterWebView(DEFAULT_SERVER_URL);
        });
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(44));
        hp.topMargin = dp(8);
        card.addView(hosted, hp);

        Button cancel = new Button(this);
        cancel.setText("Cancel");
        cancel.setTextSize(13);
        cancel.setTextColor(ZINC_400);
        cancel.getBackground().setColorFilter(ZINC_800, android.graphics.PorterDuff.Mode.SRC_IN);
        cancel.setOnClickListener(v -> hideServerOverlay());
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(40));
        cp.topMargin = dp(4);
        card.addView(cancel, cp);

        serverOverlay.addView(card, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        contentBox.addView(serverOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void applyServerInput(EditText input) {
        String raw = input.getText().toString().trim();
        if (raw.isEmpty()) {
            // empty = reset to the hosted server
            prefs.edit().remove("server_url").apply();
            hideServerOverlay();
            toast("Using the hosted OTAMA server");
            enterWebView(DEFAULT_SERVER_URL);
            return;
        }
        if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
            raw = "https://" + raw;
        }
        URI uri;
        try {
            uri = URI.create(raw);
        } catch (Exception e) {
            toast("That address doesn't look right");
            return;
        }
        String host = uri.getHost();
        if (host == null || host.isEmpty()
                || !Patterns.DOMAIN_NAME.matcher(host).matches() && !host.matches("(?i)^\\[?[0-9a-f:.]+\\]?$")) {
            toast("That address doesn't look right");
            return;
        }
        if (!raw.endsWith("/")) raw += "/";
        prefs.edit().putString("server_url", raw).apply();
        hideServerOverlay();
        toast("Server saved");
        enterWebView(raw);
    }

    private void hideServerOverlay() {
        if (serverOverlay != null) {
            root.removeView(serverOverlay);
            serverOverlay = null;
        }
    }

    /** Private/LAN hosts are never honored on cold start — the app is a
     *  direct-host client of the hosted server, not a same-WiFi remote. */
    private static boolean isPrivateHost(String url) {
        String host;
        try {
            host = URI.create(url).getHost();
        } catch (Exception e) {
            return false;
        }
        if (host == null) return false;
        String h = host.toLowerCase();
        if (h.equals("localhost") || h.equals("127.0.0.1")
                || h.endsWith(".local") || h.endsWith(".lan")) return true;
        Matcher m = Pattern.compile("^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$").matcher(h);
        if (m.matches()) {
            int a = Integer.parseInt(m.group(1));
            int b = Integer.parseInt(m.group(2));
            if (a == 10 || a == 127 || a == 0) return true;
            if (a == 192 && b == 168) return true;
            if (a == 172 && b >= 16 && b <= 31) return true;
            if (a == 169 && b == 254) return true;
        }
        return false;
    }

    /* ----------------------------- lifecycle ----------------------------- */

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (serverOverlay != null) { // close the advanced dialog first
                hideServerOverlay();
                return true;
            }
            if (customView != null) { // leave fullscreen video first
                onHideCustomViewSafe();
                return true;
            }
            if (webView.getVisibility() == View.VISIBLE && webView.canGoBack()) {
                webView.goBack();
                return true;
            }
            // Nothing in the WebView history — let the PAGE walk out of its
            // overlays (player → details → sheets), one layer per press.
            // The app itself only closes when the page has nothing to undo.
            dispatchPageBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /**
     * Ask the page to close its topmost overlay. The page reports whether
     * anything was open (window.__otamaOverlayOpen in v1.3.1+, DOM
     * heuristics as fallback for older builds) and an Escape keypress does
     * the actual closing — the same path the desktop uses. Only when the
     * page reports "nothing open" does the back press close the app.
     */
    private void dispatchPageBack() {
        final String probe =
            "(function(){"
            + "function anyOpen(){"
            + "try{if(window.__otamaOverlayOpen&&window.__otamaOverlayOpen())return true}catch(e){}"
            + "if(document.querySelector('[data-otama-overlay]'))return true;"
            + "if(document.querySelector('[role=\"dialog\"][data-state=\"open\"]'))return true;"
            + "if(document.querySelector('div.fixed.inset-0.z-50')||document.querySelector('div.fixed.inset-0.z-40'))return true;"
            + "return false}"
            + "var open=anyOpen();"
            + "if(open){try{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true}))}catch(e){}}"
            + "return open?'handled':'exit'})()";
        webView.evaluateJavascript(probe, value -> {
            if (value == null || !value.contains("handled")) {
                finish();
            }
        });
    }

    private void onHideCustomViewSafe() {
        if (customView == null) return;
        exitImmersive();
        root.removeView(customView);
        customView = null;
        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
            customViewCallback = null;
        }
        webView.setVisibility(View.VISIBLE);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
        }
        super.onDestroy();
    }

    /* ----------------------------- helpers ----------------------------- */

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
