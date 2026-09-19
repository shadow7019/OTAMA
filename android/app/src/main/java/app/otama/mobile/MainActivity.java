package app.otama.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Patterns;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
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
import android.widget.TextView;
import android.widget.Toast;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.ConnectException;
import java.net.SocketTimeoutException;

/**
 * OTAMA for Android — a focused WebView shell that connects to a running
 * OTAMA server (the Next.js web UI + torrent engine). All streaming happens
 * on the server machine; the app renders the exact same UI as the browser.
 */
public class MainActivity extends Activity {

    private static final int AMBER = 0xFFF59E0B;
    private static final int BG = 0xFF09090B;
    private static final int ZINC_800 = 0xFF27272A;
    private static final int ZINC_400 = 0xFFA1A1AA;

    private SharedPreferences prefs;
    private FrameLayout root;
    private LinearLayout setupView;
    private LinearLayout errorOverlay;
    private WebView webView;
    private EditText urlInput;
    private TextView testStatus;
    private Button connectBtn;
    private Button anywayBtn;
    private String connectedUrl = "";
    private String pendingUrl = "";
    private boolean testing = false;

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

        buildSetupView();
        buildWebView();

        String saved = prefs.getString("server_url", null);
        if (saved != null && !saved.isEmpty()) {
            enterWebView(saved);
        } else {
            showSetup();
        }
    }

    /* ----------------------------- setup screen ----------------------------- */

    private void buildSetupView() {
        setupView = new LinearLayout(this);
        setupView.setOrientation(LinearLayout.VERTICAL);
        setupView.setBackgroundColor(BG);
        setupView.setPadding(dp(28), dp(64), dp(28), dp(28));
        setupView.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView logo = new TextView(this);
        logo.setText("OTAMA");
        logo.setTextSize(30);
        logo.setTypeface(null, android.graphics.Typeface.BOLD);
        logo.setTextColor(0xFFFAFAFA);
        logo.setLetterSpacing(0.35f);
        logo.setGravity(Gravity.CENTER);
        setupView.addView(logo);

        TextView tag = new TextView(this);
        tag.setText("torrent streaming, everywhere");
        tag.setTextSize(13);
        tag.setTextColor(ZINC_400);
        tag.setGravity(Gravity.CENTER);
        tag.setPadding(0, dp(6), 0, dp(36));
        setupView.addView(tag);

        TextView label = new TextView(this);
        label.setText("OTAMA server address");
        label.setTextSize(14);
        label.setTextColor(0xFFFAFAFA);
        label.setPadding(0, 0, 0, dp(8));
        setupView.addView(label);
        urlInput = new EditText(this);
        urlInput.setHint("http://192.168.1.50:3000");
        urlInput.setText(prefs.getString("last_server_url", ""));
        urlInput.setTextSize(15);
        urlInput.setTextColor(0xFFFAFAFA);
        urlInput.setHintTextColor(0xFF71717A);
        urlInput.setBackgroundColor(ZINC_800);
        urlInput.setPadding(dp(14), dp(12), dp(14), dp(12));
        urlInput.setSingleLine(true);
        urlInput.setInputType(android.text.InputType.TYPE_TEXT_VARIATION_URI);
        urlInput.setImeOptions(EditorInfo.IME_ACTION_GO);
        urlInput.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO) { connect(); return true; }
            return false;
        });
        setupView.addView(urlInput, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button connect = new Button(this);
        connect.setText("Connect");
        connect.setTextSize(15);
        connect.setTextColor(0xFF09090B);
        connect.getBackground().setColorFilter(AMBER, android.graphics.PorterDuff.Mode.SRC_IN);
        connect.setOnClickListener(v -> connect());
        connectBtn = connect;
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        bp.topMargin = dp(16);
        setupView.addView(connect, bp);

        // Diagnosis shown when the pre-connect test does not find a healthy
        // OTAMA server at the address ("unexpected token"-style confusion
        // should never reach the web UI).
        testStatus = new TextView(this);
        testStatus.setTextSize(12);
        testStatus.setTextColor(0xFFF87171);
        testStatus.setPadding(dp(4), dp(14), dp(4), 0);
        testStatus.setVisibility(View.GONE);
        setupView.addView(testStatus, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        anywayBtn = new Button(this);
        anywayBtn.setText("Connect anyway");
        anywayBtn.setTextSize(14);
        anywayBtn.setTextColor(0xFFFAFAFA);
        anywayBtn.getBackground().setColorFilter(ZINC_800, android.graphics.PorterDuff.Mode.SRC_IN);
        anywayBtn.setVisibility(View.GONE);
        anywayBtn.setOnClickListener(v -> {
            if (pendingUrl.isEmpty()) return;
            prefs.edit().putString("server_url", pendingUrl).putString("last_server_url", pendingUrl).apply();
            enterWebView(pendingUrl);
        });
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(44));
        ap.topMargin = dp(10);
        setupView.addView(anywayBtn, ap);

        TextView help = new TextView(this);
        help.setText("OTAMA streams from a server running on your computer —\n"
                + "the phone app is a remote control + player.\n\n"
                + "1.  Open OTAMA on your computer (Windows / macOS)\n"
                + "2.  Press Alt in OTAMA → click \"LAN access: ON\"\n"
                + "      → OTAMA restarts and shows an address like\n"
                + "      http://192.168.1.50:3000\n"
                + "3.  Type that address here (same Wi-Fi on both devices)");
        help.setTextSize(12);
        help.setTextColor(ZINC_400);
        help.setPadding(0, dp(24), 0, 0);
        help.setGravity(Gravity.CENTER);
        setupView.addView(help);

        root.addView(setupView);
    }

    private void connect() {
        if (testing) return;
        String raw = urlInput.getText().toString().trim();
        if (raw.isEmpty()) {
            toast("Enter your OTAMA server address");
            return;
        }
        if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
            raw = "http://" + raw;
        }
        try {
            URI uri = URI.create(raw);
            String host = uri.getHost();
            if (host == null || host.isEmpty() || !Patterns.DOMAIN_NAME.matcher(host).matches() && !isIpLike(host)) {
                toast("That address doesn't look right");
                return;
            }
        } catch (Exception e) {
            toast("That address doesn't look right");
            return;
        }
        if (!raw.endsWith("/")) raw += "/";
        final String candidate = raw;

        // Pre-flight check: prove the OTAMA API actually answers here before
        // dropping the user into a half-broken WebView session.
        testing = true;
        connectBtn.setText("Testing…");
        connectBtn.setEnabled(false);
        testStatus.setVisibility(View.GONE);
        anywayBtn.setVisibility(View.GONE);
        new Thread(() -> {
            final String verdict = testOtamaServer(candidate); // null = healthy OTAMA
            runOnUiThread(() -> {
                testing = false;
                connectBtn.setText("Connect");
                connectBtn.setEnabled(true);
                if (verdict == null) {
                    prefs.edit().putString("server_url", candidate).putString("last_server_url", candidate).apply();
                    enterWebView(candidate);
                } else {
                    pendingUrl = candidate;
                    testStatus.setText(verdict);
                    testStatus.setVisibility(View.VISIBLE);
                    anywayBtn.setVisibility(View.VISIBLE);
                }
            });
        }, "otama-connect-test").start();
    }

    /**
     * GET <base>api/catalog — a JSON answer proves the OTAMA API is live at
     * this address (even a provider-failure JSON 502 is proof enough). Returns
     * null when healthy, otherwise a human diagnosis of what went wrong.
     */
    private static String testOtamaServer(String base) {
        HttpURLConnection conn = null;
        try {
            URL u = new URL(base + "api/catalog?type=movie&skip=0&sort=top");
            conn = (HttpURLConnection) u.openConnection();
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(12000);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "OTAMA-Android");
            int code = conn.getResponseCode();
            String ctype = conn.getContentType() == null ? "" : conn.getContentType().toLowerCase();

            if (ctype.contains("json")) return null; // it IS OTAMA

            if (code == 200 && ctype.contains("html")) {
                return "That address serves a web page, but not the OTAMA API.\n"
                        + "Wrong port? The OTAMA desktop app shows the exact\n"
                        + "address to type (menu: OTAMA → LAN access).";
            }
            if (code == 404) {
                return "A server answered but it has no OTAMA API (HTTP 404).\n"
                        + "Is the OTAMA desktop app (v1.1.2 or newer) running there?";
            }
            if (code >= 500) {
                return "The server answered with HTTP " + code + " — OTAMA may still\n"
                        + "be starting up. Try again in a few seconds.";
            }
            if (looksLikeOtama(base)) return null; // very old build — allow
            return "Unexpected answer (HTTP " + code + ", "
                    + (ctype.isEmpty() ? "unknown type" : ctype) + ").";
        } catch (SocketTimeoutException | ConnectException e) {
            return "Nothing answered at that address (timed out).\n"
                    + "• Is OTAMA running on the computer with LAN access ON (Alt → \"LAN access\")?\n"
                    + "• Both devices on the same Wi-Fi?\n"
                    + "• Windows Firewall: allow OTAMA on Private networks.";
        } catch (Exception e) {
            return "Could not connect (" + e.getClass().getSimpleName() + "). Check the address.";
        } finally {
            if (conn != null) try { conn.disconnect(); } catch (Exception ignored) { }
        }
    }

    /** Fallback: does the root page at least mention OTAMA somewhere? */
    private static boolean looksLikeOtama(String base) {
        HttpURLConnection c = null;
        try {
            URL u = new URL(base);
            c = (HttpURLConnection) u.openConnection();
            c.setConnectTimeout(6000);
            c.setReadTimeout(12000);
            InputStream is = c.getInputStream();
            byte[] buf = new byte[8192];
            int n = is.read(buf);
            try { is.close(); } catch (Exception ignored) { }
            String head = n > 0 ? new String(buf, 0, n, "UTF-8") : "";
            return head.toLowerCase().contains("otama");
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) try { c.disconnect(); } catch (Exception ignored) { }
        }
    }

    private static boolean isIpLike(String h) {
        return h.matches("(?i)^\\[?[0-9a-f:.]+\\]?$");
    }

    /* ----------------------------- webview ----------------------------- */

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
        s.setUserAgentString(ua + " OTAMA-Android/1.1.3");

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
            public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request.isForMainFrame()) {
                    runOnUiThread(() -> showErrorOverlay());
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
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                root.removeView(customView);
                customView = null;
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                    customViewCallback = null;
                }
                webView.setVisibility(View.VISIBLE);
            }
        });

        root.addView(webView, new FrameLayout.LayoutParams(
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
        setupView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(url);
    }

    private void showSetup() {
        hideErrorOverlay();
        webView.setVisibility(View.GONE);
        setupView.setVisibility(View.VISIBLE);
    }

    /* --------------------------- connection error --------------------------- */

    /** Shown when the saved/entered server cannot be reached — without this,
     *  a stale address (DHCP change, server off) would brick the app on an
     *  error page with no way back to the address form. */
    private void showErrorOverlay() {
        if (errorOverlay != null) return;
        errorOverlay = new LinearLayout(this);
        errorOverlay.setOrientation(LinearLayout.VERTICAL);
        errorOverlay.setBackgroundColor(BG);
        errorOverlay.setGravity(Gravity.CENTER);
        errorOverlay.setPadding(dp(28), dp(28), dp(28), dp(28));

        TextView title = new TextView(this);
        title.setText("Can't reach the OTAMA server");
        title.setTextSize(18);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        title.setTextColor(0xFFFAFAFA);
        title.setGravity(Gravity.CENTER);
        errorOverlay.addView(title);

        TextView detail = new TextView(this);
        detail.setText(connectedUrl + "\n\nMake sure OTAMA is running on your computer\n"
                + "with LAN access ON (Alt in OTAMA → \"LAN access\")\n"
                + "and that both devices are on the same Wi-Fi.");
        detail.setTextSize(13);
        detail.setTextColor(ZINC_400);
        detail.setGravity(Gravity.CENTER);
        detail.setPadding(0, dp(14), 0, 0);
        errorOverlay.addView(detail);

        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setTextColor(0xFF09090B);
        retry.getBackground().setColorFilter(AMBER, android.graphics.PorterDuff.Mode.SRC_IN);
        retry.setOnClickListener(v -> {
            hideErrorOverlay();
            webView.reload();
        });
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        rp.topMargin = dp(28);
        errorOverlay.addView(retry, rp);

        Button edit = new Button(this);
        edit.setText("Edit server address");
        edit.setTextColor(0xFFFAFAFA);
        edit.getBackground().setColorFilter(ZINC_800, android.graphics.PorterDuff.Mode.SRC_IN);
        edit.setOnClickListener(v -> {
            prefs.edit().remove("server_url").apply();
            showSetup();
        });
        LinearLayout.LayoutParams ep = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        ep.topMargin = dp(10);
        errorOverlay.addView(edit, ep);

        root.addView(errorOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void hideErrorOverlay() {
        if (errorOverlay != null) {
            root.removeView(errorOverlay);
            errorOverlay = null;
        }
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
            if (customView != null) { // leave fullscreen video first
                onHideCustomViewSafe();
                return true;
            }
            if (webView.getVisibility() == View.VISIBLE && webView.canGoBack()) {
                webView.goBack();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    private void onHideCustomViewSafe() {
        if (customView == null) return;
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
