package com.vvas.access.utils

import android.graphics.Color
import android.text.Editable
import android.text.TextWatcher
import android.view.View
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

    init {
        setupSearch()
        setupSortToggle()
        setupDateChips()
        setupStatusChips()
        setupActionChips()
    }

    fun setLogsMode(isLogs: Boolean) {
        binding.scrollStatusChips.visibility = if (isLogs) View.GONE else View.VISIBLE
        binding.scrollActionChips.visibility = if (isLogs) View.VISIBLE else View.GONE
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

    private fun setupSortToggle() {
        binding.btnSortOrder.setOnClickListener {
            newestFirst = !newestFirst
            binding.btnSortOrder.text = if (newestFirst) "↓ Newest" else "↑ Oldest"
            onFilterChanged()
        }
    }

    private fun updateChipGroup(selected: TextView, group: List<TextView>) {
        val ctx = binding.root.context
        val inactiveColor = ContextCompat.getColor(ctx, R.color.text_secondary)
        group.forEach { chip ->
            if (chip == selected) {
                chip.setBackgroundResource(R.drawable.bg_chip_active)
                chip.setTextColor(Color.WHITE)
            } else {
                chip.setBackgroundResource(R.drawable.bg_chip_inactive)
                chip.setTextColor(inactiveColor)
            }
        }
    }

    private fun setupDateChips() {
        val chips = listOf(
            binding.chipDateAll to DatePreset.ALL,
            binding.chipDateToday to DatePreset.TODAY,
            binding.chipDateYesterday to DatePreset.YESTERDAY,
            binding.chipDateLast7 to DatePreset.LAST_7_DAYS
        )
        val views = chips.map { it.first }
        chips.forEach { (view, preset) ->
            view.setOnClickListener {
                datePreset = preset
                updateChipGroup(view, views)
                onFilterChanged()
            }
        }
    }

    private fun setupStatusChips() {
        val chips = listOf(
            binding.chipStatusAll to "all",
            binding.chipStatusInCampus to "in_campus",
            binding.chipStatusNotInside to "not_inside",
            binding.chipStatusExited to "exited",
            binding.chipStatusExpired to "expired"
        )
        val views = chips.map { it.first }
        chips.forEach { (view, status) ->
            view.setOnClickListener {
                statusFilter = status
                updateChipGroup(view, views)
                onFilterChanged()
            }
        }
    }

    private fun setupActionChips() {
        val chips = listOf(
            binding.chipActionAll to "all",
            binding.chipActionEntry to "entry",
            binding.chipActionExit to "exit"
        )
        val views = chips.map { it.first }
        chips.forEach { (view, action) ->
            view.setOnClickListener {
                actionFilter = action
                updateChipGroup(view, views)
                onFilterChanged()
            }
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
