package com.novasearch.browser;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.os.Message;
import android.content.ActivityNotFoundException;

/**
 * NovaSearch V2 — Android WebView Shell
 *
 * All normal http/https navigation stays INSIDE this app.
 * External browser is ONLY opened via the "Open externally" menu inside the NovaSearch web UI.
 * The Android back button navigates WebView history before closing.
 */
public class MainActivity extends Activity {

    private static final String NOVA_HOME = "http://localhost:3000/browser";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);

        // ── WebView Settings ────────────────────────────────────────────────
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);          // no local file access
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "NovaSearch/2.0 Mobile Safari/537.36"
        );

        webView.addJavascriptInterface(new NovaAndroidBridge(), "NovaAndroid");

        // ── WebViewClient: keep all http/https inside the app ───────────────
        webView.setWebViewClient(new WebViewClient() {

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();

                // Allow only safe schemes inside the WebView
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    // Stay inside NovaSearch — let WebView handle it
                    return false;
                }

                // geo: URI — open maps app
                if ("geo".equals(scheme)) {
                    try {
                        Intent mapIntent = new Intent(Intent.ACTION_VIEW, uri);
                        if (mapIntent.resolveActivity(getPackageManager()) != null) {
                            startActivity(mapIntent);
                        }
                    } catch (Exception e) { /* no maps app */ }
                    return true;
                }

                // intent:// or market:// or other external — block by default
                // The user can choose "Open externally" inside NovaSearch to get a share dialog
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request,
                                        WebResourceError error) {
                if (request.isForMainFrame()) {
                    // Show NovaSearch's own error page rather than the generic WebView error
                    view.loadUrl("javascript:void(0)");
                    String errPage =
                        "<html><body style='font-family:sans-serif;text-align:center;padding:40px'>" +
                        "<h2>⚠️ Could not load page</h2>" +
                        "<p style='color:#666'>" + request.getUrl() + "</p>" +
                        "<p><a href='" + NOVA_HOME + "'>← Back to NovaSearch</a></p>" +
                        "</body></html>";
                    view.loadData(errPage, "text/html", "UTF-8");
                }
            }
        });

        // ── WebChromeClient: route target=_blank into NovaSearch tabs ───────
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, Message resultMsg) {
                WebView newWebView = new WebView(MainActivity.this);
                WebSettings child = newWebView.getSettings();
                child.setJavaScriptEnabled(true);
                child.setDomStorageEnabled(true);
                child.setSupportMultipleWindows(true);
                child.setJavaScriptCanOpenWindowsAutomatically(true);
                child.setAllowFileAccess(false);
                child.setAllowContentAccess(false);
                child.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

                newWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                        Uri uri = req.getUrl();
                        String scheme = uri.getScheme();
                        if ("http".equals(scheme) || "https".equals(scheme)) {
                            String url = uri.toString();
                            webView.evaluateJavascript("openNewTab(" + org.json.JSONObject.quote(url) + ")", null);
                        }
                        return true;
                    }
                    @Override
                    public void onPageStarted(WebView v, String url, Bitmap favicon) {
                        if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                            webView.evaluateJavascript("openNewTab(" + org.json.JSONObject.quote(url) + ")", null);
                        }
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(newWebView);
                resultMsg.sendToTarget();
                return true;
            }
        });

        // Load NovaSearch home
        webView.loadUrl(NOVA_HOME);
    }

    // ── Android Back Button: navigate WebView history first ─────────────────
    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            // If we're at the very start, go to NovaSearch home rather than exiting
            String currentUrl = webView.getUrl();
            if (currentUrl != null && !currentUrl.equals(NOVA_HOME) &&
                !currentUrl.startsWith("http://localhost:3000/")) {
                webView.loadUrl(NOVA_HOME);
            } else {
                super.onBackPressed();
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
    private class NovaAndroidBridge {
        @JavascriptInterface
        public void openExternal(String url) {
            if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (ActivityNotFoundException ignored) { }
        }
    }


}
