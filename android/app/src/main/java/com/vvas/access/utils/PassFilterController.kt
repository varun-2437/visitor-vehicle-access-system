package com.vvas.access.utils

import android.app.AlertDialog
import android.graphics.Color
import android.text.Editable
import android.text.TextWatcher
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.vvas.access.R
import com.vvas.access.data.model.AccessLog
import com.vvas.access.data.model.VisitorPass
import com.vvas.access.databinding.LayoutFilterBarBinding

class PassFilterController(
    private val binding: LayoutFilterBarBinding,
    private val onFilterChanged: () -> Unit
) {
    var searchQuery: String = ""
        private set
    var datePreset: DatePreset = DatePreset.ALL
        private set
    var statusFilter: String = "all"
        private set
    var actionFilter: String = "all"
        private set
    var newestFirst: Boolean = true
        private set
    private var isLogsMode: Boolean = false

    init {
        setupSearch()
        setupUnifiedFilterButton()
        updateFilterButtonLabel()
    }

    fun setLogsMode(isLogs: Boolean) {
        isLogsMode = isLogs
        updateFilterButtonLabel()
    }

    fun applyPreset(preset: DatePreset, status: String) {
        datePreset = preset
        statusFilter = status
        updateFilterButtonLabel()
        onFilterChanged()
    }

    fun applyLogPreset(preset: DatePreset, action: String) {
        datePreset = preset
        actionFilter = action
        updateFilterButtonLabel()
        onFilterChanged()
    }

    private fun setupSearch() {
        binding.etFilterSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                searchQuery = s?.toString().orEmpty()
                onFilterChanged()
            }
            override fun afterTextChanged(s: Editable?) {}
        })
    }

    private fun setupUnifiedFilterButton() {
        binding.btnOpenFilters.setOnClickListener {
            showUnifiedFilterDialog()
        }
    }

    private fun showUnifiedFilterDialog() {
        val ctx = binding.root.context
        val pad = (16 * ctx.resources.displayMetrics.density).toInt()
        val smallPad = (8 * ctx.resources.displayMetrics.density).toInt()

        val container = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, smallPad, pad, smallPad)
        }

        fun addSectionTitle(title: String) {
            val tv = TextView(ctx).apply {
                text = title
                textSize = 12f
                setTypeface(null, android.graphics.Typeface.BOLD)
                setTextColor(ContextCompat.getColor(ctx, R.color.primary_crimson))
                setPadding(0, smallPad, 0, smallPad / 2)
            }
            container.addView(tv)
        }

        // 1. Date Range
        addSectionTitle("Date Range")
        val dateOptions = listOf(
            DatePreset.ALL to "All Time",
            DatePreset.TODAY to "Today",
            DatePreset.YESTERDAY to "Yesterday",
            DatePreset.LAST_7_DAYS to "Last 7 Days"
        )
        val dateGroup = RadioGroup(ctx)
        dateOptions.forEachIndexed { idx, (preset, label) ->
            val rb = RadioButton(ctx).apply {
                id = 1000 + idx
                text = label
                isChecked = (preset == datePreset)
                tag = preset
            }
            dateGroup.addView(rb)
        }
        container.addView(dateGroup)

        // 2. Status or Action
        addSectionTitle(if (isLogsMode) "Gate Action" else "Vehicle Status")
        val secondOptions = if (isLogsMode) {
            listOf("all" to "All Actions", "entry" to "Entry Only", "exit" to "Exit Only")
        } else {
            listOf(
                "all" to "All Status",
                "in_campus" to "In Campus",
                "not_inside" to "Not Inside",
                "exited" to "Exited",
                "expired" to "Expired"
            )
        }
        val currentSecond = if (isLogsMode) actionFilter else statusFilter
        val secondGroup = RadioGroup(ctx)
        secondOptions.forEachIndexed { idx, (value, label) ->
            val rb = RadioButton(ctx).apply {
                id = 2000 + idx
                text = label
                isChecked = (value == currentSecond)
                tag = value
            }
            secondGroup.addView(rb)
        }
        container.addView(secondGroup)

        // 3. Sort Order
        addSectionTitle("Sort Order")
        val sortGroup = RadioGroup(ctx)
        val rbNewest = RadioButton(ctx).apply {
            id = 3000
            text = "Newest First"
            isChecked = newestFirst
        }
        val rbOldest = RadioButton(ctx).apply {
            id = 3001
            text = "Oldest First"
            isChecked = !newestFirst
        }
        sortGroup.addView(rbNewest)
        sortGroup.addView(rbOldest)
        container.addView(sortGroup)

        val scroll = ScrollView(ctx).apply { addView(container) }

        AlertDialog.Builder(ctx)
            .setTitle("Filter & Sort")
            .setView(scroll)
            .setNeutralButton("Reset") { _, _ ->
                datePreset = DatePreset.ALL
                statusFilter = "all"
                actionFilter = "all"
                newestFirst = true
                updateFilterButtonLabel()
                onFilterChanged()
            }
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Apply") { _, _ ->
                val selectedDateRb = dateGroup.findViewById<RadioButton>(dateGroup.checkedRadioButtonId)
                datePreset = (selectedDateRb?.tag as? DatePreset) ?: DatePreset.ALL

                val selectedSecondRb = secondGroup.findViewById<RadioButton>(secondGroup.checkedRadioButtonId)
                val secondVal = (selectedSecondRb?.tag as? String) ?: "all"
                if (isLogsMode) {
                    actionFilter = secondVal
                } else {
                    statusFilter = secondVal
                }

                newestFirst = (sortGroup.checkedRadioButtonId == 3000)
                updateFilterButtonLabel()
                onFilterChanged()
            }
            .show()
    }

    private fun updateFilterButtonLabel() {
        var activeCount = 0
        if (datePreset != DatePreset.ALL) activeCount++
        if (isLogsMode && actionFilter != "all") activeCount++
        if (!isLogsMode && statusFilter != "all") activeCount++
        if (!newestFirst) activeCount++

        val ctx = binding.root.context
        if (activeCount > 0) {
            binding.btnOpenFilters.setBackgroundResource(R.drawable.bg_chip_active)
            binding.tvFilterSummary.setTextColor(Color.WHITE)
            binding.ivFilterIcon.setColorFilter(Color.WHITE)
            binding.tvFilterSummary.text = "Filters ($activeCount)"
        } else {
            binding.btnOpenFilters.setBackgroundResource(R.drawable.bg_chip_inactive)
            binding.tvFilterSummary.setTextColor(ContextCompat.getColor(ctx, R.color.text_primary))
            binding.ivFilterIcon.clearColorFilter()
            binding.tvFilterSummary.text = "Filters"
        }
    }

    fun filterPasses(passes: List<VisitorPass>): List<VisitorPass> {
        val clean = searchQuery.trim().lowercase()
        val filtered = passes.filter { pass ->
            if (!DateTimeUtils.matchesDatePreset(pass.createdAt, datePreset)) return@filter false

            val normalizedStatus = when (pass.status?.lowercase()) {
                "used" -> "in_campus"
                "approved", "pending" -> "not_inside"
                else -> pass.status?.lowercase() ?: "not_inside"
            }
            if (statusFilter != "all" && normalizedStatus != statusFilter) return@filter false

            if (clean.isEmpty()) return@filter true

            val passIdFormatted = DateTimeUtils.formatPassId(pass.id).lowercase()
            pass.visitorName.lowercase().contains(clean) ||
                (pass.vehicleNumber?.lowercase()?.contains(clean) == true) ||
                (pass.purpose?.lowercase()?.contains(clean) == true) ||
                (pass.resident?.fullName?.lowercase()?.contains(clean) == true) ||
                (pass.resident?.flatNumber?.lowercase()?.contains(clean) == true) ||
                passIdFormatted.contains(clean) ||
                pass.id.toString().contains(clean)
        }

        return if (newestFirst) {
            filtered.sortedByDescending { DateTimeUtils.parseIsoToMillis(it.createdAt) }
        } else {
            filtered.sortedBy { DateTimeUtils.parseIsoToMillis(it.createdAt) }
        }
    }

    fun filterLogs(logs: List<AccessLog>): List<AccessLog> {
        val clean = searchQuery.trim().lowercase()
        val filtered = logs.filter { log ->
            if (!DateTimeUtils.matchesDatePreset(log.timestamp, datePreset)) return@filter false

            if (actionFilter != "all" && !log.action.equals(actionFilter, ignoreCase = true)) {
                return@filter false
            }

            if (clean.isEmpty()) return@filter true

            val pass = log.visitorPass
            val passIdFormatted = pass?.let { DateTimeUtils.formatPassId(it.id).lowercase() } ?: ""
            (pass?.visitorName?.lowercase()?.contains(clean) == true) ||
                (pass?.vehicleNumber?.lowercase()?.contains(clean) == true) ||
                (pass?.purpose?.lowercase()?.contains(clean) == true) ||
                (pass?.resident?.fullName?.lowercase()?.contains(clean) == true) ||
                (pass?.resident?.flatNumber?.lowercase()?.contains(clean) == true) ||
                log.action.lowercase().contains(clean) ||
                passIdFormatted.contains(clean) ||
                (pass?.id?.toString()?.contains(clean) == true)
        }

        return if (newestFirst) {
            filtered.sortedByDescending { DateTimeUtils.parseIsoToMillis(it.timestamp) }
        } else {
            filtered.sortedBy { DateTimeUtils.parseIsoToMillis(it.timestamp) }
        }
    }
}
