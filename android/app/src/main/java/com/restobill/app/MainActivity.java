package com.restobill.app;

import android.content.Context;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Native Android App Bridge for graceful background minimize & exit
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void exitApp() {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        finish();
                    }
                });
            }

            @JavascriptInterface
            public void minimizeApp() {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        moveTaskToBack(true);
                    }
                });
            }
        }, "AndroidAppBridge");

        // Native Android PrintManager Bridge for Bluetooth & Thermal Printers
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void printHtml(final String html, final String jobName) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            final WebView printWebView = new WebView(MainActivity.this);
                            printWebView.setWebViewClient(new WebViewClient() {
                                @Override
                                public void onPageFinished(WebView view, String url) {
                                    try {
                                        PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                                        if (printManager != null) {
                                            PrintDocumentAdapter printAdapter = printWebView.createPrintDocumentAdapter(jobName);
                                            PrintAttributes.Builder builder = new PrintAttributes.Builder();
                                            builder.setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME);
                                            printManager.print(jobName, printAdapter, builder.build());
                                        }
                                    } catch (Exception e) {
                                        e.printStackTrace();
                                    }
                                }
                            });
                            printWebView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    }
                });
            }
        }, "AndroidPrinter");
    }
}
