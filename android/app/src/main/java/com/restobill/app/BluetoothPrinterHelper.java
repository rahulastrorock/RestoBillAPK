package com.restobill.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
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
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Direct ESC/POS Bluetooth Thermal Receipt Printer Service for RestoBill.
 * Supports pixel-perfect compact raster bitmap receipts (matching modern POS standards
 * with crisp fonts, solid lines, perfect alignment, regional script support, and zero wasted paper)
 * as well as a compact text ESC/POS fallback.
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
     * By default generates a compact, high-contrast monochrome raster bitmap receipt (GS v 0)
     * which accurately reproduces modern POS bills (proportional typography, solid lines,
     * Hindi/English support, zero extra whitespace, and no footer branding).
     * Falls back to clean text mode ESC/POS if graphics generation fails.
     */
    public static byte[] buildReceiptEscPos(JSONObject order, JSONObject settings) {
        try {
            byte[] rasterBytes = buildReceiptBitmapEscPos(order, settings);
            if (rasterBytes != null && rasterBytes.length > 0) {
                return rasterBytes;
            }
        } catch (Throwable t) {
            Log.w(TAG, "Raster receipt generation encountered error, falling back to text ESC/POS", t);
        }
        return buildReceiptEscPosText(order, settings);
    }

    /**
     * Render receipt to Android Bitmap and convert to ESC/POS raster bit image (GS v 0).
     */
    public static byte[] buildReceiptBitmapEscPos(JSONObject order, JSONObject settings) {
        Bitmap bitmap = renderReceiptBitmap(order, settings);
        if (bitmap == null) return new byte[0];
        return bitmapToEscPosRaster(bitmap);
    }

    /**
     * Creates a high-contrast monochrome Android Bitmap of the receipt matching the
     * clean, compact layout in Image 2.
     */
    public static Bitmap renderReceiptBitmap(JSONObject order, JSONObject settings) {
        String widthSetting = settings != null ? settings.optString("printer_width", "58") : "58";
        int paperWidth = "80".equals(widthSetting) ? 576 : 384;

        // Pass 1: Measure exact height required
        float measuredHeight = drawReceipt(null, order, settings, paperWidth, 8f);
        // Add 36px bottom margin so tear bar clears footer cleanly without wasting paper
        int totalHeight = (int) Math.ceil(measuredHeight + 36f);

        Bitmap bitmap = Bitmap.createBitmap(paperWidth, totalHeight, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.WHITE);

        // Pass 2: Draw pixels
        drawReceipt(canvas, order, settings, paperWidth, 8f);
        return bitmap;
    }

    /**
     * Draws the receipt onto the canvas. If canvas is null, only measures and returns the total Y height.
     */
    private static float drawReceipt(Canvas canvas, JSONObject order, JSONObject settings, int paperWidth, float startY) {
        boolean is80mm = paperWidth > 400;
        float margin = is80mm ? 14f : 8f;
        float contentWidth = paperWidth - (margin * 2);

        float titleSize = is80mm ? 28f : 21.5f;
        float headerMetaSize = is80mm ? 19f : 16f;
        float normalSize = is80mm ? 20f : 16.5f;
        float smallSize = is80mm ? 17f : 14f;
        float grandTotalSize = is80mm ? 28f : 22.5f;
        float lineHeight = is80mm ? 29f : 23.5f;

        Paint titlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        titlePaint.setColor(Color.BLACK);
        titlePaint.setTextSize(titleSize);
        titlePaint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));

        Paint boldPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        boldPaint.setColor(Color.BLACK);
        boldPaint.setTextSize(normalSize);
        boldPaint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));

        Paint normalPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        normalPaint.setColor(Color.BLACK);
        normalPaint.setTextSize(normalSize);
        normalPaint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL));

        Paint metaPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        metaPaint.setColor(Color.BLACK);
        metaPaint.setTextSize(headerMetaSize);
        metaPaint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL));

        Paint smallPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        smallPaint.setColor(Color.BLACK);
        smallPaint.setTextSize(smallSize);
        smallPaint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL));

        Paint totalPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        totalPaint.setColor(Color.BLACK);
        totalPaint.setTextSize(grandTotalSize);
        totalPaint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));

        Paint linePaint = new Paint();
        linePaint.setColor(Color.BLACK);
        linePaint.setStrokeWidth(1.2f);

        float y = startY;

        // 1. Header - Restaurant Name (Centered, Bold, compact size, fits on 1 line if possible)
        String restaurantName = settings != null ? settings.optString("restaurant_name", "RestoBill Restaurant") : "RestoBill Restaurant";
        if (isOptionEnabled(settings, "print_show_restaurant_name", true) && !restaurantName.isEmpty()) {
            List<String> nameLines = wrapText(restaurantName, titlePaint, contentWidth);
            for (String line : nameLines) {
                float x = margin + ((contentWidth - titlePaint.measureText(line)) / 2f);
                if (canvas != null) canvas.drawText(line, Math.max(margin, x), y + titleSize, titlePaint);
                y += (titleSize + 4f);
            }
            y += 2f;
        }

        // Restaurant Address & Details (Centered, compact)
        if (settings != null) {
            String address = settings.optString("restaurant_address", "").trim();
            if (isOptionEnabled(settings, "print_show_address", true) && !address.isEmpty()) {
                List<String> addrLines = wrapText(address, metaPaint, contentWidth);
                for (String line : addrLines) {
                    float x = margin + ((contentWidth - metaPaint.measureText(line)) / 2f);
                    if (canvas != null) canvas.drawText(line, Math.max(margin, x), y + headerMetaSize, metaPaint);
                    y += (headerMetaSize + 3.5f);
                }
            }
            String gstin = settings.optString("gstin", "").trim();
            if (isOptionEnabled(settings, "print_show_gstin", true) && !gstin.isEmpty()) {
                String line = "GST Number: " + gstin;
                float x = margin + ((contentWidth - metaPaint.measureText(line)) / 2f);
                if (canvas != null) canvas.drawText(line, Math.max(margin, x), y + headerMetaSize, metaPaint);
                y += (headerMetaSize + 3.5f);
            }
            String phone = settings.optString("restaurant_phone", "").trim();
            if (isOptionEnabled(settings, "print_show_phone", true) && !phone.isEmpty()) {
                String line = "Phone Number: " + phone;
                float x = margin + ((contentWidth - metaPaint.measureText(line)) / 2f);
                if (canvas != null) canvas.drawText(line, Math.max(margin, x), y + headerMetaSize, metaPaint);
                y += (headerMetaSize + 3.5f);
            }
            String fssai = settings.optString("fssai_no", "").trim();
            if (isOptionEnabled(settings, "print_show_fssai", true) && !fssai.isEmpty()) {
                String line = "FSSAI: " + fssai;
                float x = margin + ((contentWidth - metaPaint.measureText(line)) / 2f);
                if (canvas != null) canvas.drawText(line, Math.max(margin, x), y + headerMetaSize, metaPaint);
                y += (headerMetaSize + 3.5f);
            }
        }

        // Receipt Header Title (e.g. TAX INVOICE) if customized
        String headerTitle = settings != null ? settings.optString("receipt_header_title", "").trim() : "";
        if (!headerTitle.isEmpty() && !"TAX INVOICE".equalsIgnoreCase(headerTitle)) {
            float x = margin + ((contentWidth - boldPaint.measureText(headerTitle)) / 2f);
            if (canvas != null) canvas.drawText(headerTitle, Math.max(margin, x), y + normalSize, boldPaint);
            y += (normalSize + 3.5f);
        }

        // Solid Divider Line
        y += 4f;
        if (canvas != null) canvas.drawLine(margin, y, paperWidth - margin, y, linePaint);
        y += 5f;

        // 2. Bill Meta (Left-aligned, clean, compact)
        String orderNo = order.optString("order_no", "").trim();
        if (isOptionEnabled(settings, "print_show_order_no", true) && !orderNo.isEmpty()) {
            if (canvas != null) {
                canvas.drawText("Bill No: " + orderNo, margin, y + normalSize, boldPaint);
            }
            y += lineHeight;
        }

        if (isOptionEnabled(settings, "print_show_date", true)) {
            String createdAt = order.optString("created_at", "");
            String dateFormatted = formatDateTime(createdAt);
            if (canvas != null) {
                canvas.drawText("Created On: " + dateFormatted, margin, y + normalSize, normalPaint);
            }
            y += lineHeight;
        }

        // Bill To: Customer Name or Cash Sale
        String custName = order.optString("customer_name", "").trim();
        String custPhone = order.optString("customer_phone", "").trim();
        String custGstin = order.optString("customer_gstin", "").trim();
        String billToText = !custName.isEmpty() ? custName : "Cash Sale";
        if (!custPhone.isEmpty()) billToText += " (" + custPhone + ")";
        if (isOptionEnabled(settings, "print_show_customer", true)) {
            if (canvas != null) {
                canvas.drawText("Bill To: " + billToText, margin, y + normalSize, normalPaint);
            }
            y += lineHeight;
        }
        if (isOptionEnabled(settings, "print_show_customer_gstin", true) && !custGstin.isEmpty()) {
            if (canvas != null) {
                canvas.drawText("Cust GSTIN: " + custGstin, margin, y + normalSize, normalPaint);
            }
            y += lineHeight;
        }

        String tableNo = order.optString("table_no", "").trim();
        if (isOptionEnabled(settings, "print_show_table", true) && !tableNo.isEmpty()) {
            if (canvas != null) {
                canvas.drawText("Table: " + tableNo, margin, y + normalSize, normalPaint);
            }
            y += lineHeight;
        }

        String cashier = order.optString("user_name", "").trim();
        if (isOptionEnabled(settings, "print_show_cashier", true) && !cashier.isEmpty()) {
            if (canvas != null) {
                canvas.drawText("Cashier: " + cashier, margin, y + normalSize, normalPaint);
            }
            y += lineHeight;
        }

        // Solid Divider Line
        y += 4f;
        if (canvas != null) canvas.drawLine(margin, y, paperWidth - margin, y, linePaint);
        y += 5f;

        // 3. Table Column Positions
        float colItemX = margin;
        float colQtyRight = is80mm ? margin + 300f : margin + 195f;
        float colRateRight = is80mm ? margin + 430f : margin + 275f;
        float colTotalRight = paperWidth - margin;
        float maxNameWidth = colQtyRight - colItemX - 10f;

        // Table Header
        if (canvas != null) {
            canvas.drawText("Item Name", colItemX, y + normalSize, boldPaint);
            drawRightAlignedText(canvas, "Qty", colQtyRight, y + normalSize, boldPaint);
            drawRightAlignedText(canvas, "Rate", colRateRight, y + normalSize, boldPaint);
            drawRightAlignedText(canvas, "Total", colTotalRight, y + normalSize, boldPaint);
        }
        y += lineHeight;

        // Solid Divider Line
        y += 4f;
        if (canvas != null) canvas.drawLine(margin, y, paperWidth - margin, y, linePaint);
        y += 5f;

        // Items
        JSONArray items = order.optJSONArray("items");
        int totalItemsCount = 0;
        double totalQuantitySum = 0;

        if (items != null) {
            totalItemsCount = items.length();
            for (int i = 0; i < items.length(); i++) {
                JSONObject itm = items.optJSONObject(i);
                if (itm == null) continue;

                String rawName = itm.optString("name", "");
                if (rawName.isEmpty()) rawName = itm.optString("item_name", "");
                if (rawName.isEmpty()) rawName = itm.optString("title", "Item");

                double qty = itm.optDouble("quantity", 1);
                totalQuantitySum += qty;
                double price = itm.optDouble("price", 0);
                double total = itm.has("total") ? itm.optDouble("total") : (qty * price);

                String qtyStr = formatMoney(qty);
                String priceStr = formatMoney(price);
                String totalStr = formatMoney(total);

                List<String> nameLines = wrapText(rawName, normalPaint, maxNameWidth);
                if (nameLines.isEmpty()) nameLines.add(rawName);

                // First line with item name + Qty + Rate + Total
                if (canvas != null) {
                    canvas.drawText(nameLines.get(0), colItemX, y + normalSize, normalPaint);
                    drawRightAlignedText(canvas, qtyStr, colQtyRight, y + normalSize, normalPaint);
                    drawRightAlignedText(canvas, priceStr, colRateRight, y + normalSize, normalPaint);
                    drawRightAlignedText(canvas, totalStr, colTotalRight, y + normalSize, normalPaint);
                }
                y += lineHeight;

                // Subsequent wrapped lines of item name (if any)
                for (int n = 1; n < nameLines.size(); n++) {
                    if (canvas != null) {
                        canvas.drawText(nameLines.get(n), colItemX, y + normalSize, normalPaint);
                    }
                    y += lineHeight;
                }
            }
        }

        // Solid Divider Line
        y += 4f;
        if (canvas != null) canvas.drawLine(margin, y, paperWidth - margin, y, linePaint);
        y += 5f;

        // 4. Totals / Summary Section
        // Total Items
        if (canvas != null) {
            canvas.drawText("Total Items: " + totalItemsCount, margin, y + normalSize, normalPaint);
        }
        y += lineHeight;

        // Total Quantity
        if (canvas != null) {
            canvas.drawText("Total Quantity: " + formatMoney(totalQuantitySum), margin, y + normalSize, normalPaint);
        }
        y += lineHeight;

        // Sub Total
        if (isOptionEnabled(settings, "print_show_subtotal", true)) {
            boolean isInclusive = "1".equals(settings != null ? settings.optString("gst_inclusive", "0") : "0");
            double subtotal = order.optDouble("subtotal", 0);
            double taxable = order.optDouble("taxable_amount", 0);
            double displaySubtotal = (isInclusive && taxable > 0) ? taxable : subtotal;
            String label = isInclusive ? "Taxable Amt" : "Sub Total";
            if (canvas != null) {
                canvas.drawText(label, margin + (contentWidth * 0.35f), y + normalSize, normalPaint);
                drawRightAlignedText(canvas, formatMoney(displaySubtotal), colTotalRight, y + normalSize, normalPaint);
            }
            y += lineHeight;
        }

        // Discount
        double discount = order.optDouble("discount_amount", 0);
        if (discount > 0) {
            if (canvas != null) {
                canvas.drawText("Discount", margin + (contentWidth * 0.35f), y + normalSize, normalPaint);
                drawRightAlignedText(canvas, "-" + formatMoney(discount), colTotalRight, y + normalSize, normalPaint);
            }
            y += lineHeight;
        }

        // CGST / SGST
        if (isOptionEnabled(settings, "print_show_tax_breakdown", true)) {
            double cgst = order.optDouble("cgst", 0);
            if (cgst > 0) {
                if (canvas != null) {
                    canvas.drawText("CGST", margin + (contentWidth * 0.35f), y + normalSize, normalPaint);
                    drawRightAlignedText(canvas, formatMoney(cgst), colTotalRight, y + normalSize, normalPaint);
                }
                y += lineHeight;
            }
            double sgst = order.optDouble("sgst", 0);
            if (sgst > 0) {
                if (canvas != null) {
                    canvas.drawText("SGST", margin + (contentWidth * 0.35f), y + normalSize, normalPaint);
                    drawRightAlignedText(canvas, formatMoney(sgst), colTotalRight, y + normalSize, normalPaint);
                }
                y += lineHeight;
            }
        }

        // Round Off
        double roundOff = order.optDouble("round_off", 0);
        if (Math.abs(roundOff) > 0.001) {
            if (canvas != null) {
                canvas.drawText("Round Off", margin + (contentWidth * 0.35f), y + normalSize, normalPaint);
                drawRightAlignedText(canvas, String.format(Locale.US, "%+.2f", roundOff), colTotalRight, y + normalSize, normalPaint);
            }
            y += lineHeight;
        }

        // Solid Divider Line
        y += 4f;
        if (canvas != null) canvas.drawLine(margin, y, paperWidth - margin, y, linePaint);
        y += 5f;

        // 5. Grand Total (Centered, Bold, crisp, prominent)
        double grandTotal = order.optDouble("total", 0);
        String grandTotalStr = "Total " + formatMoney(grandTotal);
        float totalWidth = totalPaint.measureText(grandTotalStr);
        float totalX = margin + ((contentWidth - totalWidth) / 2f);
        if (canvas != null) {
            canvas.drawText(grandTotalStr, Math.max(margin, totalX), y + grandTotalSize, totalPaint);
        }
        y += (grandTotalSize + 6f);

        // Solid Divider Line
        y += 4f;
        if (canvas != null) canvas.drawLine(margin, y, paperWidth - margin, y, linePaint);
        y += 5f;

        // 6. Payment Mode
        if (isOptionEnabled(settings, "print_show_payment_mode", true)) {
            String paymentMode = order.optString("payment_mode", "cash").toLowerCase();
            if (canvas != null) {
                canvas.drawText("Mode of Payment", margin, y + normalSize, normalPaint);
                drawRightAlignedText(canvas, paymentMode, colTotalRight, y + normalSize, normalPaint);
            }
            y += lineHeight;

            if (canvas != null) {
                canvas.drawText("Received", margin, y + normalSize, normalPaint);
                drawRightAlignedText(canvas, formatMoney(grandTotal), colTotalRight, y + normalSize, normalPaint);
            }
            y += lineHeight;

            // Solid Divider Line
            y += 4f;
            if (canvas != null) canvas.drawLine(margin, y, paperWidth - margin, y, linePaint);
            y += 5f;
        }

        // Notes (if any)
        String notes = order.optString("notes", "").trim();
        if (isOptionEnabled(settings, "print_show_notes", true) && !notes.isEmpty()) {
            if (canvas != null) {
                canvas.drawText("Note: " + notes, margin, y + normalSize, normalPaint);
            }
            y += lineHeight;
            y += 4f;
            if (canvas != null) canvas.drawLine(margin, y, paperWidth - margin, y, linePaint);
            y += 5f;
        }

        // 7. Footer
        if (isOptionEnabled(settings, "print_show_footer", true)) {
            String footerText = settings != null ? settings.optString("footer_text", "Thank You! Visit Again!") : "Thank You! Visit Again!";
            if (!footerText.isEmpty()) {
                float fx = margin + ((contentWidth - boldPaint.measureText(footerText)) / 2f);
                if (canvas != null) canvas.drawText(footerText, Math.max(margin, fx), y + normalSize, boldPaint);
                y += lineHeight;
            }
        }

        // Terms (if any)
        if (settings != null && isOptionEnabled(settings, "print_show_terms", false)) {
            String terms = settings.optString("terms_text", "").trim();
            if (!terms.isEmpty()) {
                List<String> termsLines = wrapText(terms, smallPaint, contentWidth);
                for (String tLine : termsLines) {
                    float tx = margin + ((contentWidth - smallPaint.measureText(tLine)) / 2f);
                    if (canvas != null) canvas.drawText(tLine, Math.max(margin, tx), y + smallSize, smallPaint);
                    y += (smallSize + 3f);
                }
            }
        }

        // NOTE: "Made with love by RestoBill" is intentionally removed as requested

        return y;
    }

    /**
     * Converts a monochrome Android Bitmap to ESC/POS standard raster bit image bytes (GS v 0).
     * Slices into chunks of 64 lines to avoid buffer overruns on portable Bluetooth printer microcontrollers.
     */
    public static byte[] bitmapToEscPosRaster(Bitmap bitmap) {
        if (bitmap == null) return new byte[0];

        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int widthBytes = (width + 7) / 8;

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            // ESC @ -> Initialize printer
            out.write(new byte[]{0x1B, 0x40});

            // ESC 3 0 -> Line spacing 0 for seamless continuous raster feed
            out.write(new byte[]{0x1B, 0x33, 0x00});

            // Slices of 64 lines for maximum buffer safety on cheap Bluetooth chips
            int sliceHeight = 64;
            for (int y = 0; y < height; y += sliceHeight) {
                int currentSliceHeight = Math.min(sliceHeight, height - y);

                // GS v 0 0 xL xH yL yH
                out.write(0x1D);
                out.write(0x76);
                out.write(0x30);
                out.write(0x00);
                out.write(widthBytes & 0xFF);
                out.write((widthBytes >> 8) & 0xFF);
                out.write(currentSliceHeight & 0xFF);
                out.write((currentSliceHeight >> 8) & 0xFF);

                for (int row = y; row < y + currentSliceHeight; row++) {
                    for (int colByte = 0; colByte < widthBytes; colByte++) {
                        int byteVal = 0;
                        for (int bit = 0; bit < 8; bit++) {
                            int pixelX = (colByte * 8) + bit;
                            if (pixelX < width) {
                                int pixel = bitmap.getPixel(pixelX, row);
                                int r = (pixel >> 16) & 0xFF;
                                int g = (pixel >> 8) & 0xFF;
                                int b = pixel & 0xFF;
                                int lum = (r * 299 + g * 587 + b * 114) / 1000;
                                if (lum < 185) {
                                    byteVal |= (1 << (7 - bit));
                                }
                            }
                        }
                        out.write(byteVal);
                    }
                }
            }

            // Minimal feed to tear bar (2 lines)
            out.write(new byte[]{0x1B, 0x64, 0x02});

            // Partial Cut command (for auto-cutter equipped thermal printers)
            out.write(new byte[]{0x1D, 0x56, 0x42, 0x00});

            // Reset back to defaults
            out.write(new byte[]{0x1B, 0x40});

        } catch (Exception e) {
            Log.e(TAG, "Error encoding ESC/POS raster bitmap", e);
        }
        return out.toByteArray();
    }

    /**
     * Compact text-mode ESC/POS receipt builder (fallback).
     * Strictly limits columns to 32 characters for 58mm paper, avoids double-height fonts,
     * formats numbers cleanly, and removes branding footer.
     */
    public static byte[] buildReceiptEscPosText(JSONObject order, JSONObject settings) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            // ESC @ -> Initialize printer
            out.write(new byte[]{0x1B, 0x40});
            // ESC ! 0 -> Standard font (normal width, normal height, no underline)
            out.write(new byte[]{0x1B, 0x21, 0x00});

            String widthSetting = settings != null ? settings.optString("printer_width", "58") : "58";
            int maxCols = "80".equals(widthSetting) ? 48 : 32;

            // Header - Restaurant Name (Centered, Bold, normal size)
            String restaurantName = settings != null ? settings.optString("restaurant_name", "RestoBill Restaurant") : "RestoBill Restaurant";
            if (isOptionEnabled(settings, "print_show_restaurant_name", true) && !restaurantName.isEmpty()) {
                out.write(new byte[]{0x1B, 0x61, 0x01}); // Center align
                out.write(new byte[]{0x1B, 0x45, 0x01}); // Bold on
                out.write((sanitizeText(restaurantName) + "\n").getBytes(StandardCharsets.US_ASCII));
                out.write(new byte[]{0x1B, 0x45, 0x00}); // Bold off
            }

            // Restaurant Details
            if (settings != null) {
                out.write(new byte[]{0x1B, 0x61, 0x01}); // Center align
                String address = settings.optString("restaurant_address", "").trim();
                if (isOptionEnabled(settings, "print_show_address", true) && !address.isEmpty()) {
                    out.write((sanitizeText(address) + "\n").getBytes(StandardCharsets.US_ASCII));
                }
                String gstin = settings.optString("gstin", "").trim();
                if (isOptionEnabled(settings, "print_show_gstin", true) && !gstin.isEmpty()) {
                    out.write(("GST Number: " + sanitizeText(gstin) + "\n").getBytes(StandardCharsets.US_ASCII));
                }
                String phone = settings.optString("restaurant_phone", "").trim();
                if (isOptionEnabled(settings, "print_show_phone", true) && !phone.isEmpty()) {
                    out.write(("Phone Number: " + sanitizeText(phone) + "\n").getBytes(StandardCharsets.US_ASCII));
                }
                String fssai = settings.optString("fssai_no", "").trim();
                if (isOptionEnabled(settings, "print_show_fssai", true) && !fssai.isEmpty()) {
                    out.write(("FSSAI: " + sanitizeText(fssai) + "\n").getBytes(StandardCharsets.US_ASCII));
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
                out.write(("Created On: " + dateFormatted + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            String custName = order.optString("customer_name", "").trim();
            String custPhone = order.optString("customer_phone", "").trim();
            String billTo = !custName.isEmpty() ? custName : "Cash Sale";
            if (!custPhone.isEmpty()) billTo += " (" + custPhone + ")";
            if (isOptionEnabled(settings, "print_show_customer", true)) {
                out.write(("Bill To: " + sanitizeText(billTo) + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            String tableNo = order.optString("table_no", "").trim();
            if (isOptionEnabled(settings, "print_show_table", true) && !tableNo.isEmpty()) {
                out.write(("Table: " + tableNo + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            String cashier = order.optString("user_name", "").trim();
            if (isOptionEnabled(settings, "print_show_cashier", true) && !cashier.isEmpty()) {
                out.write(("Cashier: " + sanitizeText(cashier) + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            // Table Column Header (Strictly 32 chars: 15 + 1 + 3 + 1 + 5 + 1 + 6 = 32)
            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1B, 0x45, 0x01}); // Bold on
            if (maxCols == 32) {
                out.write(String.format(Locale.US, "%-15s %3s %5s %6s\n", "Item Name", "Qty", "Rate", "Total").getBytes(StandardCharsets.US_ASCII));
            } else {
                out.write(String.format(Locale.US, "%-26s %4s %7s %8s\n", "Item Name", "Qty", "Rate", "Total").getBytes(StandardCharsets.US_ASCII));
            }
            out.write(new byte[]{0x1B, 0x45, 0x00}); // Bold off
            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));

            // Order Items
            JSONArray items = order.optJSONArray("items");
            int totalItemsCount = 0;
            double totalQuantitySum = 0;

            if (items != null) {
                totalItemsCount = items.length();
                int nameWidth = (maxCols == 32) ? 15 : 26;
                for (int i = 0; i < items.length(); i++) {
                    JSONObject itm = items.getJSONObject(i);
                    String rawName = itm.optString("name", "");
                    if (rawName.isEmpty()) rawName = itm.optString("item_name", "");
                    if (rawName.isEmpty()) rawName = itm.optString("title", "Item");
                    String itemName = sanitizeText(rawName);
                    if (itemName.trim().isEmpty()) itemName = "Item #" + (i + 1);

                    double qty = itm.optDouble("quantity", 1);
                    totalQuantitySum += qty;
                    double price = itm.optDouble("price", 0);
                    double total = itm.has("total") ? itm.optDouble("total") : (qty * price);

                    String qtyStr = formatMoney(qty);
                    String priceStr = formatMoney(price);
                    String totalStr = formatMoney(total);

                    if (itemName.length() <= nameWidth) {
                        if (maxCols == 32) {
                            out.write(String.format(Locale.US, "%-15s %3s %5s %6s\n", itemName, qtyStr, priceStr, totalStr).getBytes(StandardCharsets.US_ASCII));
                        } else {
                            out.write(String.format(Locale.US, "%-26s %4s %7s %8s\n", itemName, qtyStr, priceStr, totalStr).getBytes(StandardCharsets.US_ASCII));
                        }
                    } else {
                        List<String> wrapped = wrapTextSimple(itemName, nameWidth);
                        String firstChunk = wrapped.get(0);
                        if (maxCols == 32) {
                            out.write(String.format(Locale.US, "%-15s %3s %5s %6s\n", firstChunk, qtyStr, priceStr, totalStr).getBytes(StandardCharsets.US_ASCII));
                        } else {
                            out.write(String.format(Locale.US, "%-26s %4s %7s %8s\n", firstChunk, qtyStr, priceStr, totalStr).getBytes(StandardCharsets.US_ASCII));
                        }
                        for (int n = 1; n < wrapped.size(); n++) {
                            out.write((wrapped.get(n) + "\n").getBytes(StandardCharsets.US_ASCII));
                        }
                    }
                }
            }

            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));

            // Totals Section
            out.write(("Total Items: " + totalItemsCount + "\n").getBytes(StandardCharsets.US_ASCII));
            out.write(("Total Quantity: " + formatMoney(totalQuantitySum) + "\n").getBytes(StandardCharsets.US_ASCII));

            if (isOptionEnabled(settings, "print_show_subtotal", true)) {
                boolean isInclusive = "1".equals(settings != null ? settings.optString("gst_inclusive", "0") : "0");
                double subtotal = order.optDouble("subtotal", 0);
                double taxable = order.optDouble("taxable_amount", 0);
                double displaySubtotal = (isInclusive && taxable > 0) ? taxable : subtotal;
                String subtotalLabel = isInclusive ? "Taxable Amt" : "Sub Total";
                out.write(formatTwoColumn(subtotalLabel, formatMoney(displaySubtotal), maxCols).getBytes(StandardCharsets.US_ASCII));
            }

            double discount = order.optDouble("discount_amount", 0);
            if (discount > 0) {
                out.write(formatTwoColumn("Discount", "-" + formatMoney(discount), maxCols).getBytes(StandardCharsets.US_ASCII));
            }

            if (isOptionEnabled(settings, "print_show_tax_breakdown", true)) {
                double cgst = order.optDouble("cgst", 0);
                if (cgst > 0) {
                    out.write(formatTwoColumn("CGST", formatMoney(cgst), maxCols).getBytes(StandardCharsets.US_ASCII));
                }
                double sgst = order.optDouble("sgst", 0);
                if (sgst > 0) {
                    out.write(formatTwoColumn("SGST", formatMoney(sgst), maxCols).getBytes(StandardCharsets.US_ASCII));
                }
            }

            double roundOff = order.optDouble("round_off", 0);
            if (Math.abs(roundOff) > 0.001) {
                out.write(formatTwoColumn("Round Off", String.format(Locale.US, "%+.2f", roundOff), maxCols).getBytes(StandardCharsets.US_ASCII));
            }

            // Grand Total (Centered or Left-Right, Bold, Standard Size)
            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1B, 0x45, 0x01}); // Bold on
            double grandTotal = order.optDouble("total", 0);
            String totalFormatted = "Total " + formatMoney(grandTotal);
            out.write(new byte[]{0x1B, 0x61, 0x01}); // Center align
            out.write((totalFormatted + "\n").getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1B, 0x61, 0x00}); // Left align
            out.write(new byte[]{0x1B, 0x45, 0x00}); // Bold off
            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));

            // Payment Mode
            if (isOptionEnabled(settings, "print_show_payment_mode", true)) {
                String paymentMode = order.optString("payment_mode", "cash").toLowerCase();
                out.write(formatTwoColumn("Mode of Payment", paymentMode, maxCols).getBytes(StandardCharsets.US_ASCII));
                out.write(formatTwoColumn("Received", formatMoney(grandTotal), maxCols).getBytes(StandardCharsets.US_ASCII));
                out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            // Notes
            String notes = order.optString("notes", "").trim();
            if (isOptionEnabled(settings, "print_show_notes", true) && !notes.isEmpty()) {
                out.write(("Note: " + sanitizeText(notes) + "\n").getBytes(StandardCharsets.US_ASCII));
                out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            // Footer
            if (isOptionEnabled(settings, "print_show_footer", true)) {
                out.write(new byte[]{0x1B, 0x61, 0x01}); // Center align
                String footerText = settings != null ? settings.optString("footer_text", "Thank You! Visit Again!") : "Thank You! Visit Again!";
                out.write((sanitizeText(footerText) + "\n").getBytes(StandardCharsets.US_ASCII));
            }

            if (settings != null && isOptionEnabled(settings, "print_show_terms", false)) {
                String terms = settings.optString("terms_text", "").trim();
                if (!terms.isEmpty()) {
                    out.write((sanitizeText(terms) + "\n").getBytes(StandardCharsets.US_ASCII));
                }
            }

            // Paper Feed & Cut (Only 2 lines feed, not 4)
            out.write("\n\n".getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1D, 0x56, 0x42, 0x00}); // Partial Cut

        } catch (Exception e) {
            Log.e(TAG, "Error building ESC/POS text receipt bytes", e);
        }
        return out.toByteArray();
    }

    /**
     * Build ESC/POS test receipt bytes to verify Bluetooth connection.
     * Uses compact styling with minimal paper feed.
     */
    public static byte[] buildTestReceiptEscPos(JSONObject settings) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            out.write(new byte[]{0x1B, 0x40}); // Init
            out.write(new byte[]{0x1B, 0x21, 0x00}); // Normal font

            String widthSetting = settings != null ? settings.optString("printer_width", "58") : "58";
            int maxCols = "80".equals(widthSetting) ? 48 : 32;

            out.write(new byte[]{0x1B, 0x61, 0x01}); // Center
            out.write(new byte[]{0x1B, 0x45, 0x01}); // Bold on
            out.write("RestoBill POS\n".getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1B, 0x45, 0x00}); // Bold off
            out.write("Direct Bluetooth Test\n".getBytes(StandardCharsets.US_ASCII));
            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));

            out.write(new byte[]{0x1B, 0x61, 0x00}); // Left
            out.write(("Paper Width: " + ("80".equals(widthSetting) ? "80mm (48 Cols)" : "58mm (32 Cols)") + "\n").getBytes(StandardCharsets.US_ASCII));
            out.write(("Direct Bluetooth: CONNECTED\n").getBytes(StandardCharsets.US_ASCII));
            out.write(("Silent Print: ACTIVE (No Dialog)\n").getBytes(StandardCharsets.US_ASCII));
            out.write(("Time: " + new SimpleDateFormat("dd/MM/yy hh:mm a", Locale.US).format(new Date()) + "\n").getBytes(StandardCharsets.US_ASCII));

            out.write((repeatChar('-', maxCols) + "\n").getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1B, 0x61, 0x01}); // Center
            out.write(new byte[]{0x1B, 0x45, 0x01}); // Bold on
            out.write("*** SUCCESSFUL TEST ***\n".getBytes(StandardCharsets.US_ASCII));
            out.write(new byte[]{0x1B, 0x45, 0x00}); // Bold off
            out.write("Printer is ready for instant bills!\n".getBytes(StandardCharsets.US_ASCII));

            // Minimal feed to tear bar
            out.write("\n\n".getBytes(StandardCharsets.US_ASCII));
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

        // Auto-detect printer by common keyword or take first bonded device
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

    private static String formatMoney(double val) {
        if (val == (long) val) {
            return String.format(Locale.US, "%d", (long) val);
        } else {
            return String.format(Locale.US, "%.2f", val);
        }
    }

    private static void drawRightAlignedText(Canvas canvas, String text, float rightX, float y, Paint paint) {
        if (canvas == null || text == null) return;
        float textWidth = paint.measureText(text);
        canvas.drawText(text, rightX - textWidth, y, paint);
    }

    private static List<String> wrapText(String text, Paint paint, float maxWidth) {
        List<String> lines = new ArrayList<>();
        if (text == null || text.trim().isEmpty()) return lines;

        String[] paragraphs = text.split("\n");
        for (String para : paragraphs) {
            para = para.trim();
            if (para.isEmpty()) continue;

            if (paint.measureText(para) <= maxWidth) {
                lines.add(para);
                continue;
            }

            String[] words = para.split("\\s+");
            StringBuilder currentLine = new StringBuilder();
            for (String word : words) {
                String testLine = currentLine.length() == 0 ? word : currentLine + " " + word;
                if (paint.measureText(testLine) <= maxWidth) {
                    currentLine = new StringBuilder(testLine);
                } else {
                    if (currentLine.length() > 0) {
                        lines.add(currentLine.toString());
                        currentLine = new StringBuilder(word);
                    } else {
                        // Word itself exceeds maxWidth, chop characters
                        for (int c = 0; c < word.length(); c++) {
                            String charTest = currentLine.toString() + word.charAt(c);
                            if (paint.measureText(charTest) <= maxWidth) {
                                currentLine.append(word.charAt(c));
                            } else {
                                if (currentLine.length() > 0) {
                                    lines.add(currentLine.toString());
                                }
                                currentLine = new StringBuilder(String.valueOf(word.charAt(c)));
                            }
                        }
                    }
                }
            }
            if (currentLine.length() > 0) {
                lines.add(currentLine.toString());
            }
        }
        return lines;
    }

    private static List<String> wrapTextSimple(String text, int maxChars) {
        List<String> lines = new ArrayList<>();
        if (text == null || text.trim().isEmpty()) {
            lines.add("");
            return lines;
        }
        String[] words = text.split("\\s+");
        StringBuilder current = new StringBuilder();
        for (String w : words) {
            if (current.length() == 0) {
                if (w.length() <= maxChars) {
                    current.append(w);
                } else {
                    lines.add(w.substring(0, maxChars));
                    current.append(w.substring(maxChars));
                }
            } else if (current.length() + 1 + w.length() <= maxChars) {
                current.append(" ").append(w);
            } else {
                lines.add(current.toString());
                current = new StringBuilder();
                if (w.length() <= maxChars) {
                    current.append(w);
                } else {
                    lines.add(w.substring(0, maxChars));
                    current.append(w.substring(maxChars));
                }
            }
        }
        if (current.length() > 0) {
            lines.add(current.toString());
        }
        return lines;
    }

    private static String sanitizeText(String text) {
        if (text == null) return "";
        // Replace Indian Rupee symbol with Rs. and strip unprintable control characters
        return text.replace("₹", "Rs.").replaceAll("[^\\x20-\\x7E]", " ").trim();
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
            return new SimpleDateFormat("dd/MM/yy hh:mm a", Locale.US).format(new Date());
        }
        try {
            long ms = Long.parseLong(isoOrMillis);
            return new SimpleDateFormat("dd/MM/yy hh:mm a", Locale.US).format(new Date(ms));
        } catch (Exception ignored) {}

        try {
            SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            Date d = iso.parse(isoOrMillis.substring(0, Math.min(isoOrMillis.length(), 19)));
            if (d != null) {
                return new SimpleDateFormat("dd/MM/yy hh:mm a", Locale.US).format(d);
            }
        } catch (Exception ignored) {}

        return isoOrMillis;
    }
}
