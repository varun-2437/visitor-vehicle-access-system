package com.vvas.access.utils

import java.text.SimpleDateFormat
import java.util.*

object DateTimeUtils {
    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    private val readableFormat = SimpleDateFormat("MMM dd, yyyy • hh:mm a", Locale.getDefault())
    private val timeOnlyFormat = SimpleDateFormat("hh:mm a", Locale.getDefault())

    fun formatDateTime(isoString: String?): String {
        if (isoString.isNullOrBlank()) return "—"
        return try {
            val clean = isoString.split(".")[0] // Strip microseconds if present
            val date = isoFormat.parse(clean)
            if (date != null) readableFormat.format(date) else isoString
        } catch (e: Exception) {
            isoString
        }
    }

    fun formatTimeOnly(isoString: String?): String {
        if (isoString.isNullOrBlank()) return "—"
        return try {
            val clean = isoString.split(".")[0]
            val date = isoFormat.parse(clean)
            if (date != null) timeOnlyFormat.format(date) else isoString
        } catch (e: Exception) {
            isoString
        }
    }

    fun formatPassId(id: Int): String {
        return "#VP-%05d".format(id)
    }
}
