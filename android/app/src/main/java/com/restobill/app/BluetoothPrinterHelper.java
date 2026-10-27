package com.restobill.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Direct ESC/POS Bluetooth Thermal Receipt Printer Service for RestoBill.
 * Eliminates the need for third-party apps (e.g. RawBT) and prints instantly
 * and silently without triggering the Android system print dialog.
 */
public class BluetoothPrinterHelper {
    private static final String TAG = "RestoBillPrinter";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    /**
     * Check if Bluetooth permissions are granted.
     */
    public static boolean hasBluetoothPermission(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ActivityCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    /**
     * Get JSON array of paired Bluetooth devices.
     */
    public static String getBondedPrintersJson(Context context) {
        JSONArray list = new JSONArray();
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isEnabled()) {
                return list.toString();
            }

            if (!hasBluetoothPermission(context)) {
                return list.toString();
            }

            Set<BluetoothDevice> paired = adapter.getBondedDevices();
            if (paired != null) {
                for (BluetoothDevice dev : paired) {
                    JSONObject obj = new JSONObject();
                    obj.put("name", dev.getName() != null ? dev.getName() : "Unknown Device");
                    obj.put("address", dev.getAddress());
                    obj.put("type", dev.getType());
                    list.put(obj);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error listing bluetooth devices", e);
        }
        return list.toString();
    }

    /**
     * Build ESC/POS formatted receipt bytes for thermal printers (58mm or 80mm).
     */
    public static byte[] buildReceiptEscPos(JSONObject order, JSONObject settings) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            // ESC @ -> Initialize printer
            out.write(new byte[]{0x1B, 0x40});

            // Paper width: 58mm = 32 columns, 80mm = 48 columns
            String widthSetting = settings != null ? settings.optString("printer_width", "58") : "58";
            int maxCols = "80".equals(widthSetting) ? 48 : 32;

            // Header - Restaurant Name (Double Height/Width, Bold, Centered)
            String restaurantName = settings != null ? settings.optString("restaurant_name", "RestoBill Restaurant") : "RestoBill Restaurant";
            if (isOptionEnabled(settings, "print_show_restaurant_name", true) && !restaurantName.isEmpty()) {
                out.write(new byte[]{0x1B, 0x61, 0x01}); // Center align
                out.write(new byte[]{0x1B, 0x45, 0x01}); // Bold on
                out.write(new byte[]{0x1D, 0x21, 0x11}); // Double width & height
                out.write((sanitizeText(restaurantName) + "\n").getBytes(StandardCharsets.US_ASCII));
                out.write(new byte[]{0x1D, 0x21, 0x00}); // Normal size
                out.write(new byte[]{0x1B, 0x45, 0x00}); // Bold off
            }

            // Restaurant Details
            if (settings != null) {
                String address = settings.optString("restaurant_address", "").trim();
                if (isOptionEnabled(settings, "print_show_address", true) && !address.isEmpty()) {
                    out.write((sanitizeText(address) + "\n").getBytes(StandardCharsets.US_ASCII));
                }
                String phone = settings.optString("restaurant_phone", "").trim();
                if (isOptionEnabled(settings, "print_show_phone", true) && !phone.isEmpty()) {
                    out.write(("Phone: " + sanitizeText(phone) + "\n").getBytes(StandardCharsets.US_ASCII));
                }
                String gstin = settings.optString("gstin", "").trim();
                if (isOptionEnabled(settings, "print_show_gstin", true) && !gstin.isEmpty()) {
                    out.write(("GSTIN: " + sanitizeText(gstin) + "\n").getBytes(StandardCharsets.US_ASCII));
                }
                String fssai = settings.optString("fssai_no", "").trim();
                if (isOptionEnabled(settings, "print_show_fssai", true) && !fssai.isEmpty()) {
                    out.write(("FSSAI: " + sanitizeText(fssai) + "\n").getBytes(StandardCharsets.US_ASCII));
                }

                // Receipt Header Title (e.g. TAX INVOICE)
                String headerTitle = settings.optString("receipt_header_title", "TAX INVOICE").trim();
                if (!headerTitle.isEmpty()) {
                    out.write(new byte[]{0x1B, 0x45, 0x01}); // Bold on
                    out.write((sanitizeText(headerTitle) + "\n").getBytes(StandardCharsets.US_ASCII));
                    out.write(new byte[]{0x1B, 0x45, 0x00}); // Bold off
                }
            }

            // Divider line
            out.write(new byte[]{0x1B, 0x61, 0x00}); // Left align
            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));

            // Bill Information
            String orderNo = order.optString("order_no", "").trim();
            if (isOptionEnabled(settings, "print_show_order_no", true) && !orderNo.isEmpty()) {
                out.write(("Bill No: " + orderNo + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            if (isOptionEnabled(settings, "print_show_date", true)) {
                String createdAt = order.optString("created_at", "");
                String dateFormatted = formatDateTime(createdAt);
                out.write(("Date: " + dateFormatted + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            String tableNo = order.optString("table_no", "").trim();
            if (isOptionEnabled(settings, "print_show_table", true) && !tableNo.isEmpty()) {
                out.write(("Table: " + tableNo + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            if (isOptionEnabled(settings, "print_show_order_type", true)) {
                String orderType = order.optString("order_type", "dine_in").replace("_", " ").toUpperCase();
                out.write(("Type: " + orderType + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            String cashier = order.optString("user_name", "").trim();
            if (isOptionEnabled(settings, "print_show_cashier", true) && !cashier.isEmpty()) {
                out.write(("Cashier: " + sanitizeText(cashier) + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            String custName = order.optString("customer_name", "").trim();
            String custPhone = order.optString("customer_phone", "").trim();
            String custGstin = order.optString("customer_gstin", "").trim();
            if (isOptionEnabled(settings, "print_show_customer", true) && (!custName.isEmpty() || !custPhone.isEmpty())) {
                String custLine = "Customer: " + custName;
                if (!custPhone.isEmpty()) custLine += " (" + custPhone + ")";
                out.write((sanitizeText(custLine) + "\n").getBytes(StandardCharsets.US_ASCII));
            }
            if (isOptionEnabled(settings, "print_show_customer_gstin", true) && !custGstin.isEmpty()) {
                out.write(("Cust GSTIN: " + sanitizeText(custGstin) + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            // Column Header
            boolean showRate = isOptionEnabled(settings, "print_show_rate", true);
            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1B, 0x45, 0x01}); // Bold on
            if (maxCols == 32) {
                if (showRate) {
                    out.write(String.format(Locale.US, "%-14s %3s %6s %7s\n", "Item", "Qty", "Rate", "Amt").getBytes(StandardCharsets.US_ASCII));
                } else {
                    out.write(String.format(Locale.US, "%-20s %4s %6s\n", "Item", "Qty", "Amt").getBytes(StandardCharsets.US_ASCII));
                }
            } else {
                if (showRate) {
                    out.write(String.format(Locale.US, "%-26s %4s %7s %9s\n", "Item", "Qty", "Rate", "Amt").getBytes(StandardCharsets.US_ASCII));
                } else {
                    out.write(String.format(Locale.US, "%-35s %4s %7s\n", "Item", "Qty", "Amt").getBytes(StandardCharsets.US_ASCII));
                }
            }
            out.write(new byte[]{0x1B, 0x45, 0x00}); // Bold off
            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));

            // Order Items
            JSONArray items = order.optJSONArray("items");
            if (items != null) {
                int nameWidth = (maxCols == 32) ? (showRate ? 14 : 20) : (showRate ? 26 : 35);
                for (int i = 0; i < items.length(); i++) {
                    JSONObject itm = items.getJSONObject(i);
                    String rawName = itm.optString("name", "Item");
                    String itemName = sanitizeText(rawName);

                    double qty = itm.optDouble("quantity", 1);
                    double price = itm.optDouble("price", 0);
                    double total = itm.has("total") ? itm.optDouble("total") : (qty * price);

                    String qtyStr = (qty == (long) qty) ? String.format(Locale.US, "%d", (long) qty) : String.format(Locale.US, "%.1f", qty);
                    String priceStr = String.format(Locale.US, "%.2f", price);
                    String totalStr = String.format(Locale.US, "%.2f", total);

                    if (itemName.length() <= nameWidth) {
                        if (maxCols == 32) {
                            if (showRate) {
                                out.write(String.format(Locale.US, "%-14s %3s %6s %7s\n", itemName, qtyStr, priceStr, totalStr).getBytes(StandardCharsets.US_ASCII));
                            } else {
                                out.write(String.format(Locale.US, "%-20s %4s %6s\n", itemName, qtyStr, totalStr).getBytes(StandardCharsets.US_ASCII));
                            }
                        } else {
                            if (showRate) {
                                out.write(String.format(Locale.US, "%-26s %4s %7s %9s\n", itemName, qtyStr, priceStr, totalStr).getBytes(StandardCharsets.US_ASCII));
                            } else {
                                out.write(String.format(Locale.US, "%-35s %4s %7s\n", itemName, qtyStr, totalStr).getBytes(StandardCharsets.US_ASCII));
                            }
                        }
                    } else {
                        String firstChunk = itemName.substring(0, nameWidth);
                        String rest = itemName.substring(nameWidth);
                        if (maxCols == 32) {
                            if (showRate) {
                                out.write(String.format(Locale.US, "%-14s %3s %6s %7s\n", firstChunk, qtyStr, priceStr, totalStr).getBytes(StandardCharsets.US_ASCII));
                            } else {
                                out.write(String.format(Locale.US, "%-20s %4s %6s\n", firstChunk, qtyStr, totalStr).getBytes(StandardCharsets.US_ASCII));
                            }
                        } else {
                            if (showRate) {
                                out.write(String.format(Locale.US, "%-26s %4s %7s %9s\n", firstChunk, qtyStr, priceStr, totalStr).getBytes(StandardCharsets.US_ASCII));
                            } else {
                                out.write(String.format(Locale.US, "%-35s %4s %7s\n", firstChunk, qtyStr, totalStr).getBytes(StandardCharsets.US_ASCII));
                            }
                        }
                        while (rest.length() > 0) {
                            int take = Math.min(rest.length(), nameWidth);
                            out.write((rest.substring(0, take) + "\n").getBytes(StandardCharsets.US_ASCII));
                            rest = rest.substring(take);
                        }
                    }
                }
            }

            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));

            // Subtotal / Taxable Value
            if (isOptionEnabled(settings, "print_show_subtotal", true)) {
                boolean isInclusive = "1".equals(settings != null ? settings.optString("gst_inclusive", "0") : "0");
                double subtotal = order.optDouble("subtotal", 0);
                double taxable = order.optDouble("taxable_amount", 0);
                double displaySubtotal = (isInclusive && taxable > 0) ? taxable : subtotal;
                String subtotalLabel = isInclusive ? "Taxable Amt:" : "Subtotal:";
                out.write(formatTwoColumn(subtotalLabel, String.format(Locale.US, "%.2f", displaySubtotal), maxCols).getBytes(StandardCharsets.US_ASCII));
            }

            // Discount
            double discount = order.optDouble("discount_amount", 0);
            if (discount > 0) {
                out.write(formatTwoColumn("Discount:", String.format(Locale.US, "-%.2f", discount), maxCols).getBytes(StandardCharsets.US_ASCII));
            }

            // CGST / SGST
            if (isOptionEnabled(settings, "print_show_tax_breakdown", true)) {
                double defaultGst = 5.0;
                if (settings != null) {
                    try {
                        defaultGst = Double.parseDouble(settings.optString("default_gst_rate", "5.0"));
                    } catch (Exception ignored) {
                        defaultGst = 5.0;
                    }
                }
                double halfRate = defaultGst / 2.0;
                String rateSuffix = (halfRate == (long) halfRate)
                    ? String.format(Locale.US, " (%.0f%%):", halfRate)
                    : String.format(Locale.US, " (%.1f%%):", halfRate);

                double cgst = order.optDouble("cgst", 0);
                if (cgst > 0) {
                    out.write(formatTwoColumn("CGST" + rateSuffix, String.format(Locale.US, "%.2f", cgst), maxCols).getBytes(StandardCharsets.US_ASCII));
                }

                double sgst = order.optDouble("sgst", 0);
                if (sgst > 0) {
                    out.write(formatTwoColumn("SGST" + rateSuffix, String.format(Locale.US, "%.2f", sgst), maxCols).getBytes(StandardCharsets.US_ASCII));
                }
            }

            // Round off
            double roundOff = order.optDouble("round_off", 0);
            if (Math.abs(roundOff) > 0.001) {
                out.write(formatTwoColumn("Round Off:", String.format(Locale.US, "%+.2f", roundOff), maxCols).getBytes(StandardCharsets.US_ASCII));
            }

            // Grand Total (Double Height, Bold)
            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1B, 0x45, 0x01}); // Bold on
            out.write(new byte[]{0x1D, 0x21, 0x01}); // Double height
            double grandTotal = order.optDouble("total", 0);
            String totalFormatted = "Rs." + String.format(Locale.US, "%.2f", grandTotal);
            out.write(formatTwoColumn("Grand Total:", totalFormatted, maxCols).getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1D, 0x21, 0x00}); // Normal size
            out.write(new byte[]{0x1B, 0x45, 0x00}); // Bold off

            // Payment Mode
            if (isOptionEnabled(settings, "print_show_payment_mode", true)) {
                String paymentMode = order.optString("payment_mode", "cash").toUpperCase();
                out.write(formatTwoColumn("Payment Mode:", paymentMode, maxCols).getBytes(StandardCharsets.US_ASCII));
            }

            // Notes / Special Instructions
            String notes = order.optString("notes", "").trim();
            if (isOptionEnabled(settings, "print_show_notes", true) && !notes.isEmpty()) {
                out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));
                out.write(("Note: " + sanitizeText(notes) + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));

            // Footer
            if (isOptionEnabled(settings, "print_show_footer", true)) {
                out.write(new byte[]{0x1B, 0x61, 0x01}); // Center align
                String footerText = settings != null ? settings.optString("footer_text", "Thank you! Visit again!") : "Thank you! Visit again!";
                out.write((sanitizeText(footerText) + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            if (settings != null && isOptionEnabled(settings, "print_show_terms", false)) {
                String terms = settings.optString("terms_text", "").trim();
                if (!terms.isEmpty()) {
                    out.write((sanitizeText(terms) + "\n").getBytes(StandardCharsets.US_ASCII));
                }
            }

            if (isOptionEnabled(settings, "print_show_branding", true)) {
                out.write("Made with love by RestoBill\n".getBytes(StandardCharsets.US_ASCII));
            }

            // Paper Feed & Cut
            out.write("\n\n\n\n".getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1D, 0x56, 0x42, 0x00}); // GS V 'B' 0 - Partial Cut

        } catch (Exception e) {
            Log.e(TAG, "Error building ESC/POS receipt bytes", e);
        }
        return out.toByteArray();
    }

    /**
     * Build ESC/POS test receipt bytes to verify Bluetooth connection.
     */
    public static byte[] buildTestReceiptEscPos(JSONObject settings) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            out.write(new byte[]{0x1B, 0x40}); // Init
            String widthSetting = settings != null ? settings.optString("printer_width", "58") : "58";
            int maxCols = "80".equals(widthSetting) ? 48 : 32;

            out.write(new byte[]{0x1B, 0x61, 0x01}); // Center
            out.write(new byte[]{0x1B, 0x45, 0x01}); // Bold on
            out.write(new byte[]{0x1D, 0x21, 0x11}); // Double size
            out.write("RestoBill POS\n".getBytes(StandardCharsets.US_ASCII));

            out.write(new byte[]{0x1D, 0x21, 0x00}); // Normal
            out.write(new byte[]{0x1B, 0x45, 0x00}); // Bold off
            out.write("Direct Bluetooth Test\n".getBytes(StandardCharsets.US_ASCII));
            out.write((repeatChar('=', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));

            out.write(new byte[]{0x1B, 0x61, 0x00}); // Left
            out.write(("Paper Width: " + ("80".equals(widthSetting) ? "80mm (48 Cols)" : "58mm (32 Cols)") + "\n").getBytes(StandardCharsets.US_ASCII));
            out.write(("Direct Bluetooth: CONNECTED\n").getBytes(StandardCharsets.US_ASCII));
            out.write(("Silent Print: ACTIVE (No Dialog)\n").getBytes(StandardCharsets.US_ASCII));
            out.write(("Third-party Apps: NONE (Direct ESC/POS)\n").getBytes(StandardCharsets.US_ASCII));
            out.write(("Time: " + new SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.US).format(new Date()) + "\n").getBytes(StandardCharsets.US_ASCII));

            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1B, 0x61, 0x01}); // Center
            out.write(new byte[]{0x1B, 0x45, 0x01}); // Bold on
            out.write("*** SUCCESSFUL TEST ***\n".getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1B, 0x45, 0x00}); // Bold off
            out.write("Printer is ready for instant bills!\n".getBytes(StandardCharsets.US_ASCII));

            out.write("\n\n\n\n".getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1D, 0x56, 0x42, 0x00}); // Cut
        } catch (Exception e) {
            Log.e(TAG, "Error building test receipt", e);
        }
        return out.toByteArray();
    }

    /**
     * Connect directly to the Bluetooth printer and send ESC/POS bytes.
     * Silent, fast, and completely bypasses the Android system print dialog.
     */
    public static String printBytesToDevice(Context context, String targetDeviceIdentifier, byte[] data) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            return createResult(false, "Bluetooth is not supported on this device.");
        }
        if (!adapter.isEnabled()) {
            return createResult(false, "Bluetooth is turned off. Please turn on Bluetooth in your phone settings.");
        }
        if (!hasBluetoothPermission(context)) {
            return createResult(false, "Bluetooth permission not granted. Please allow Bluetooth permission.");
        }

        Set<BluetoothDevice> pairedDevices = adapter.getBondedDevices();
        if (pairedDevices == null || pairedDevices.isEmpty()) {
            return createResult(false, "No paired Bluetooth printers found. Please pair your printer first in Phone Settings > Bluetooth.");
        }

        BluetoothDevice targetDevice = null;
        if (targetDeviceIdentifier != null && !targetDeviceIdentifier.trim().isEmpty()) {
            String cleanTarget = targetDeviceIdentifier.trim();
            for (BluetoothDevice dev : pairedDevices) {
                if (cleanTarget.equalsIgnoreCase(dev.getAddress()) || cleanTarget.equalsIgnoreCase(dev.getName())) {
                    targetDevice = dev;
                    break;
                }
            }
        }

        // If target printer is not explicitly found, auto-detect printer by keyword or take first bonded device
        if (targetDevice == null) {
            for (BluetoothDevice dev : pairedDevices) {
                String name = dev.getName();
                if (name != null) {
                    String lower = name.toLowerCase(Locale.ROOT);
                    if (lower.contains("printer") || lower.contains("ezo") || lower.contains("pos") ||
                        lower.contains("thermal") || lower.contains("rpp") || lower.contains("mpt") ||
                        lower.contains("bluetooth") || lower.contains("receipt")) {
                        targetDevice = dev;
                        break;
                    }
                }
            }
            if (targetDevice == null) {
                targetDevice = pairedDevices.iterator().next();
            }
        }

        // Cancel discovery to guarantee fast, smooth socket connection
        try {
            if (adapter.isDiscovering()) {
                adapter.cancelDiscovery();
            }
        } catch (Exception ignored) {}

        BluetoothSocket socket = null;
        OutputStream os = null;
        try {
            // Standard SPP UUID connection
            try {
                socket = targetDevice.createRfcommSocketToServiceRecord(SPP_UUID);
                socket.connect();
            } catch (IOException e1) {
                // Channel 1 reflection fallback (essential for some POS thermal printer chipsets)
                try {
                    Method m = targetDevice.getClass().getMethod("createRfcommSocket", new Class[]{int.class});
                    socket = (BluetoothSocket) m.invoke(targetDevice, 1);
                    socket.connect();
                } catch (Exception e2) {
                    throw new IOException("Cannot connect to " + targetDevice.getName() + ": " + e1.getMessage());
                }
            }

            os = socket.getOutputStream();
            os.write(data);
            os.flush();

            // Wait 200ms to allow hardware buffer transmission before closing socket
            try {
                Thread.sleep(200);
            } catch (InterruptedException ignored) {}

            String devName = targetDevice.getName() != null ? targetDevice.getName() : targetDevice.getAddress();
            return createResult(true, "Receipt printed silently on " + devName);

        } catch (Exception e) {
            Log.e(TAG, "Bluetooth print transmission error", e);
            return createResult(false, "Print failed: " + e.getMessage());
        } finally {
            if (os != null) {
                try { os.close(); } catch (Exception ignored) {}
            }
            if (socket != null) {
                try { socket.close(); } catch (Exception ignored) {}
            }
        }
    }

    public static String createResult(boolean success, String message) {
        try {
            JSONObject res = new JSONObject();
            res.put("success", success);
            if (success) {
                res.put("message", message);
            } else {
                res.put("error", message);
            }
            return res.toString();
        } catch (Exception e) {
            return "{\"success\":" + success + ",\"message\":\"" + message + "\"}";
        }
    }

    private static boolean isOptionEnabled(JSONObject settings, String key, boolean defaultVal) {
        if (settings == null || !settings.has(key)) return defaultVal;
        String val = settings.optString(key, defaultVal ? "1" : "0");
        return "1".equals(val) || "true".equalsIgnoreCase(val) || settings.optBoolean(key, defaultVal);
    }

    private static String sanitizeText(String text) {
        if (text == null) return "";
        // Replace Indian Rupee symbol and special unicode with ESC/POS safe ASCII
        return text.replace("₹", "Rs.").replaceAll("[^\\x00-\\x7F]", "");
    }

    private static String repeatChar(char c, int count) {
        StringBuilder sb = new StringBuilder(count);
        for (int i = 0; i < count; i++) {
            sb.append(c);
        }
        return sb.toString();
    }

    private static String formatTwoColumn(String left, String right, int totalWidth) {
        int leftLen = left.length();
        int rightLen = right.length();
        int spaceCount = totalWidth - leftLen - rightLen;
        if (spaceCount < 1) spaceCount = 1;

        StringBuilder sb = new StringBuilder(totalWidth + 1);
        sb.append(left);
        for (int i = 0; i < spaceCount; i++) {
            sb.append(' ');
        }
        sb.append(right);
        sb.append('\n');
        return sb.toString();
    }

    private static String formatDateTime(String isoOrMillis) {
        if (isoOrMillis == null || isoOrMillis.trim().isEmpty()) {
            return new SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.US).format(new Date());
        }
        try {
            // If numeric timestamp
            long ms = Long.parseLong(isoOrMillis);
            return new SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.US).format(new Date(ms));
        } catch (Exception ignored) {}

        try {
            // ISO 8601 parsing
            SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            Date d = iso.parse(isoOrMillis.substring(0, Math.min(isoOrMillis.length(), 19)));
            if (d != null) {
                return new SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.US).format(d);
            }
        } catch (Exception ignored) {}

        return isoOrMillis;
    }
}
