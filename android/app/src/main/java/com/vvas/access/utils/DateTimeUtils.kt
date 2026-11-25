package com.vvas.access.utils

import java.text.SimpleDateFormat
import java.util.*

enum class DatePreset {
    ALL,
    TODAY,
    YESTERDAY,
    LAST_7_DAYS
}

object DateTimeUtils {
    private fun createIsoParser(): SimpleDateFormat {
        return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
    }

    fun parseIsoToMillis(isoString: String?): Long {
        if (isoString.isNullOrBlank()) return 0L
        return try {
            val clean = isoString.split(".")[0].removeSuffix("Z")
            createIsoParser().parse(clean)?.time ?: 0L
        } catch (e: Exception) {
            0L
        }
    }

    fun matchesDatePreset(isoString: String?, preset: DatePreset): Boolean {
        if (preset == DatePreset.ALL) return true
        val timestamp = parseIsoToMillis(isoString)
        if (timestamp == 0L) return false

        val startCal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val endCal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 23)
            set(Calendar.MINUTE, 59)
            set(Calendar.SECOND, 59)
            set(Calendar.MILLISECOND, 999)
        }

        return when (preset) {
            DatePreset.ALL -> true
            DatePreset.TODAY -> {
                timestamp in startCal.timeInMillis..endCal.timeInMillis
            }
            DatePreset.YESTERDAY -> {
                startCal.add(Calendar.DAY_OF_YEAR, -1)
                endCal.add(Calendar.DAY_OF_YEAR, -1)
                timestamp in startCal.timeInMillis..endCal.timeInMillis
            }
            DatePreset.LAST_7_DAYS -> {
                startCal.add(Calendar.DAY_OF_YEAR, -7)
                timestamp in startCal.timeInMillis..endCal.timeInMillis
            }
        }
    }

    fun formatDateTime(isoString: String?): String {
        if (isoString.isNullOrBlank()) return "—"
        val millis = parseIsoToMillis(isoString)
        if (millis == 0L) return isoString
        val fmt = SimpleDateFormat("MMM dd, yyyy • hh:mm a", Locale.getDefault())
        return fmt.format(Date(millis))
    }

    fun formatTimeOnly(isoString: String?): String {
        if (isoString.isNullOrBlank()) return "—"
        val millis = parseIsoToMillis(isoString)
        if (millis == 0L) return isoString
        val fmt = SimpleDateFormat("MMM dd • hh:mm a", Locale.getDefault())
        return fmt.format(Date(millis))
    }

    fun formatPassId(id: Int): String {
        return "#VP-%05d".format(id)
    }
}
