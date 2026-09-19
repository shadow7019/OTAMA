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

import java.net.URI;

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
    private WebView webView;
    private EditText urlInput;

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
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(48));
        bp.topMargin = dp(16);
        setupView.addView(connect, bp);

        TextView help = new TextView(this);
        help.setText("Runs against an OTAMA server — start the OTAMA desktop app\n"
                + "on your computer (app menu → LAN access) or host the web app,\n"
                + "then enter its address here. Your server keeps favorites,\n"
                + "history and does all torrent downloading.");
        help.setTextSize(12);
        help.setTextColor(ZINC_400);
        help.setPadding(0, dp(28), 0, 0);
        help.setGravity(Gravity.CENTER);
        setupView.addView(help);

        root.addView(setupView);
    }

    private void connect() {
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
        prefs.edit().putString("server_url", raw).putString("last_server_url", raw).apply();
        enterWebView(raw);
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
        s.setUserAgentString(ua + " OTAMA-Android/1.1.0");

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
        setupView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(url);
    }

    private void showSetup() {
        webView.setVisibility(View.GONE);
        setupView.setVisibility(View.VISIBLE);
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
