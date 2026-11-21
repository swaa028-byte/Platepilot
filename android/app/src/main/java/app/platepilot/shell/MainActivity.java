package app.platepilot.shell;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;

/**
 * The whole app is one WebView pointed at a PlatePilot deployment. Supabase
 * auth needs cookies and local storage, so both are enabled, the server
 * address is chosen on first launch (or after a load failure) so one APK can
 * test any deployment, and file inputs work — a stock WebView silently ignores
 * &lt;input type="file"&gt; unless the host app forwards the chooser.
 */
public class MainActivity extends Activity {

    private static final String DEFAULT_URL = "https://platepilot-725.netlify.app";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private WebView web;
    private ValueCallback<Uri[]> pendingFileUpload;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("mailto:") || url.startsWith("tel:")) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    return true;
                }
                return false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) askForServer("Could not reach the server. Check the address:");
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFileUpload != null) pendingFileUpload.onReceiveValue(null);
                pendingFileUpload = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (android.content.ActivityNotFoundException e) {
                    pendingFileUpload = null;
                    Toast.makeText(MainActivity.this, "No file picker available", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });
        web.setBackgroundColor(Color.parseColor("#102f28"));
        setContentView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        String saved = getPreferences(MODE_PRIVATE).getString("baseUrl", null);
        if (saved == null) askForServer("Which PlatePilot server do you want to test?");
        else web.loadUrl(saved);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != FILE_CHOOSER_REQUEST || pendingFileUpload == null) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            results = new Uri[]{ data.getData() };
        }
        pendingFileUpload.onReceiveValue(results);
        pendingFileUpload = null;
    }

    private void askForServer(String message) {
        final EditText input = new EditText(this);
        input.setSingleLine(true);
        String current = getPreferences(MODE_PRIVATE).getString("baseUrl", DEFAULT_URL);
        input.setText(current);
        new AlertDialog.Builder(this)
                .setTitle("PlatePilot")
                .setMessage(message)
                .setView(input)
                .setCancelable(false)
                .setPositiveButton("Connect", (dialog, which) -> {
                    String url = input.getText().toString().trim();
                    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
                    getPreferences(MODE_PRIVATE).edit().putString("baseUrl", url).apply();
                    Toast.makeText(this, "Connecting to " + url, Toast.LENGTH_SHORT).show();
                    web.loadUrl(url);
                })
                .show();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
