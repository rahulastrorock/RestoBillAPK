package com.restobill.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final int REQUEST_BT_PERMISSIONS = 101;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Auto-request Bluetooth permissions on Android 12+ (API 31+) if needed
        checkBluetoothPermissions();

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

            @JavascriptInterface
            public boolean openWhatsApp(final String rawPhone, final String text) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            String clean = rawPhone != null ? rawPhone.replaceAll("[^0-9]", "") : "";
                            if (clean.length() == 10) clean = "91" + clean;
                            String encoded = text != null ? java.net.URLEncoder.encode(text, "UTF-8") : "";
                            String url = "https://api.whatsapp.com/send?phone=" + clean + "&text=" + encoded;
                            android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW);
                            intent.setData(android.net.Uri.parse(url));
                            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                        } catch (Exception e) {
                            android.util.Log.e("MainActivity", "Direct openWhatsApp failed", e);
                        }
                    }
                });
                return true;
            }

            @JavascriptInterface
            public boolean openWhatsAppWithPdf(final String rawPhone, final String text, final String base64Pdf, final String filename) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            String clean = rawPhone != null ? rawPhone.replaceAll("[^0-9]", "") : "";
                            if (clean.length() == 10) clean = "91" + clean;

                            java.io.File cacheDir = new java.io.File(getCacheDir(), "shared_bills");
                            if (!cacheDir.exists()) cacheDir.mkdirs();
                            java.io.File pdfFile = new java.io.File(cacheDir, filename != null ? filename : "invoice.pdf");
                            byte[] pdfBytes = Base64.decode(base64Pdf, Base64.DEFAULT);
                            java.io.FileOutputStream fos = new java.io.FileOutputStream(pdfFile);
                            fos.write(pdfBytes);
                            fos.close();

                            android.net.Uri contentUri = androidx.core.content.FileProvider.getUriForFile(
                                MainActivity.this,
                                getPackageName() + ".fileprovider",
                                pdfFile
                            );

                            android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_SEND);
                            intent.setPackage("com.whatsapp");
                            intent.setType("application/pdf");
                            intent.putExtra(android.content.Intent.EXTRA_STREAM, contentUri);
                            if (text != null && !text.isEmpty()) {
                                intent.putExtra(android.content.Intent.EXTRA_TEXT, text);
                            }
                            if (!clean.isEmpty()) {
                                intent.putExtra("jid", clean + "@s.whatsapp.net");
                            }
                            intent.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION | android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                        } catch (Exception e) {
                            android.util.Log.e("MainActivity", "openWhatsAppWithPdf failed, falling back to direct chat view", e);
                            try {
                                String clean = rawPhone != null ? rawPhone.replaceAll("[^0-9]", "") : "";
                                if (clean.length() == 10) clean = "91" + clean;
                                String encoded = text != null ? java.net.URLEncoder.encode(text, "UTF-8") : "";
                                String url = "https://api.whatsapp.com/send?phone=" + clean + "&text=" + encoded;
                                android.content.Intent fallback = new android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url));
                                fallback.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                                startActivity(fallback);
                            } catch (Exception ex) {
                                android.util.Log.e("MainActivity", "openWhatsApp fallback failed", ex);
                            }
                        }
                    }
                });
                return true;
            }
        }, "AndroidAppBridge");

        // Native Direct Bluetooth Thermal Printer Bridge & Android PrintManager
        getBridge().getWebView().addJavascriptInterface(new Object() {

            @JavascriptInterface
            public String getBluetoothPrinters() {
                return BluetoothPrinterHelper.getBondedPrintersJson(MainActivity.this);
            }

            @JavascriptInterface
            public boolean isBluetoothEnabled() {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                return adapter != null && adapter.isEnabled();
            }

            @JavascriptInterface
            public void requestBluetoothPermission() {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        checkBluetoothPermissions();
                    }
                });
            }

            @JavascriptInterface
            public String printBluetooth(final String targetDevice, final String orderJson, final String settingsJson) {
                try {
                    JSONObject orderObj = new JSONObject(orderJson);
                    JSONObject settingsObj = new JSONObject(settingsJson);
                    byte[] escPosBytes = BluetoothPrinterHelper.buildReceiptEscPos(orderObj, settingsObj);
                    return BluetoothPrinterHelper.printBytesToDevice(MainActivity.this, targetDevice, escPosBytes);
                } catch (Exception e) {
                    return BluetoothPrinterHelper.createResult(false, "Bluetooth print error: " + e.getMessage());
                }
            }

            @JavascriptInterface
            public String printBluetoothRaw(final String targetDevice, final String base64Data) {
                try {
                    byte[] data = Base64.decode(base64Data, Base64.DEFAULT);
                    return BluetoothPrinterHelper.printBytesToDevice(MainActivity.this, targetDevice, data);
                } catch (Exception e) {
                    return BluetoothPrinterHelper.createResult(false, "Bluetooth raw print error: " + e.getMessage());
                }
            }

            @JavascriptInterface
            public String testPrintBluetooth(final String targetDevice, final String settingsJson) {
                try {
                    JSONObject settingsObj = new JSONObject(settingsJson);
                    byte[] escPosBytes = BluetoothPrinterHelper.buildTestReceiptEscPos(settingsObj);
                    return BluetoothPrinterHelper.printBytesToDevice(MainActivity.this, targetDevice, escPosBytes);
                } catch (Exception e) {
                    return BluetoothPrinterHelper.createResult(false, "Bluetooth test print error: " + e.getMessage());
                }
            }

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

    public void checkBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{
                    Manifest.permission.BLUETOOTH_CONNECT,
                    Manifest.permission.BLUETOOTH_SCAN
                }, REQUEST_BT_PERMISSIONS);
            }
        }
    }
}
