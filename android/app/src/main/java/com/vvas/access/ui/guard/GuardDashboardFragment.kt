package com.vvas.access.ui.guard

import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.vvas.access.R
import com.vvas.access.data.api.ApiClient
import com.vvas.access.data.model.AccessLog
import com.vvas.access.data.model.VisitorPass
import com.vvas.access.databinding.FragmentGuardDashboardBinding
import com.vvas.access.ui.admin.AccessLogsAdapter
import com.vvas.access.ui.resident.PassDetailDialog
import com.vvas.access.ui.resident.PassesAdapter
import com.vvas.access.utils.DatePreset
import com.vvas.access.utils.PassFilterController
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope

class GuardDashboardFragment : Fragment() {

    private var _binding: FragmentGuardDashboardBinding? = null
    private val binding get() = _binding!!

    private lateinit var passesAdapter: PassesAdapter
    private lateinit var logsAdapter: AccessLogsAdapter
    private lateinit var filterController: PassFilterController

    private var allPasses: List<VisitorPass> = emptyList()
    private var allLogs: List<AccessLog> = emptyList()
    private var showingLogsTab = false

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentGuardDashboardBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupRecyclerViews()
        setupFilterBar()
        setupTabs()
        setupStatCardClicks()
        binding.guardSwipeRefresh.setOnRefreshListener { loadGuardData() }
        loadGuardData()
    }

    private fun setupRecyclerViews() {
        passesAdapter = PassesAdapter { pass ->
            PassDetailDialog(requireContext(), pass) {
                loadGuardData()
            }.show()
        }
        binding.rvGuardPasses.layoutManager = LinearLayoutManager(requireContext())
        binding.rvGuardPasses.adapter = passesAdapter

        logsAdapter = AccessLogsAdapter()
        binding.rvGuardLogs.layoutManager = LinearLayoutManager(requireContext())
        binding.rvGuardLogs.adapter = logsAdapter
    }

    private fun setupFilterBar() {
        filterController = PassFilterController(binding.guardFilterBar) {
            applyFilters()
        }
    }

    private fun switchTab(showLogs: Boolean) {
        if (_binding == null) return
        val textSecondary = ContextCompat.getColor(requireContext(), R.color.text_secondary)
        showingLogsTab = showLogs
        filterController.setLogsMode(showLogs)
        if (showLogs) {
            binding.btnGuardTabLogs.setBackgroundResource(R.drawable.bg_tab_active)
            binding.btnGuardTabLogs.setTextColor(Color.WHITE)
            binding.btnGuardTabPasses.setBackgroundColor(Color.TRANSPARENT)
            binding.btnGuardTabPasses.setTextColor(textSecondary)

            binding.rvGuardLogs.visibility = View.VISIBLE
            binding.rvGuardPasses.visibility = View.GONE
        } else {
            binding.btnGuardTabPasses.setBackgroundResource(R.drawable.bg_tab_active)
            binding.btnGuardTabPasses.setTextColor(Color.WHITE)
            binding.btnGuardTabLogs.setBackgroundColor(Color.TRANSPARENT)
            binding.btnGuardTabLogs.setTextColor(textSecondary)

            binding.rvGuardPasses.visibility = View.VISIBLE
            binding.rvGuardLogs.visibility = View.GONE
        }
        applyFilters()
    }

    private fun setupTabs() {
        binding.btnGuardTabPasses.setOnClickListener { switchTab(false) }
        binding.btnGuardTabLogs.setOnClickListener { switchTab(true) }
    }

    private fun setupStatCardClicks() {
        binding.cardGuardStatInside.setOnClickListener {
            switchTab(false)
            filterController.applyPreset(DatePreset.ALL, "in_campus")
            Toast.makeText(requireContext(), "Showing vehicles currently inside campus", Toast.LENGTH_SHORT).show()
        }
        binding.cardGuardStatNotInside.setOnClickListener {
            switchTab(false)
            filterController.applyPreset(DatePreset.ALL, "not_inside")
            Toast.makeText(requireContext(), "Showing pre-created passes not inside yet", Toast.LENGTH_SHORT).show()
        }
        binding.cardGuardStatVisits.setOnClickListener {
            switchTab(true)
            filterController.applyLogPreset(DatePreset.TODAY, "entry")
            Toast.makeText(requireContext(), "Showing today's vehicle visits", Toast.LENGTH_SHORT).show()
        }
        binding.cardGuardStatPasses.setOnClickListener {
            switchTab(false)
            filterController.applyPreset(DatePreset.TODAY, "all")
            Toast.makeText(requireContext(), "Showing passes created today", Toast.LENGTH_SHORT).show()
        }
    }

    private fun applyFilters() {
        if (_binding == null) return

        val filteredPasses = filterController.filterPasses(allPasses)
        val filteredLogs = filterController.filterLogs(allLogs)

        passesAdapter.submitList(filteredPasses)
        logsAdapter.submitList(filteredLogs)

        binding.btnGuardTabPasses.text = "Passes (${filteredPasses.size})"
        binding.btnGuardTabLogs.text = "Gate Logs (${filteredLogs.size})"

        val isEmpty = if (showingLogsTab) filteredLogs.isEmpty() else filteredPasses.isEmpty()
        binding.tvGuardEmpty.visibility = if (isEmpty) View.VISIBLE else View.GONE
    }

    private fun loadGuardData() {
        binding.guardProgressBar.visibility =
            if (binding.guardSwipeRefresh.isRefreshing) View.GONE else View.VISIBLE

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val api = ApiClient.getService(requireContext())

                supervisorScope {
                    val statsResult = async { runCatching { api.getStats() } }
                    val passesResult = async { runCatching { api.getTodayPasses(allTime = true) } }
                    val logsResult = async { runCatching { api.getTodayLogs(allTime = true) } }

                    statsResult.await().onSuccess { stats ->
                        if (_binding != null) {
                            binding.tvGuardStatInsideCount.text = stats.vehiclesInside.toString()
                            binding.tvGuardStatNotInsideCount.text = stats.notInsidePasses.toString()
                            binding.tvGuardStatVisitsCount.text = stats.totalVisited.toString()
                            binding.tvGuardStatPassesCount.text = stats.totalPasses.toString()
                        }
                    }

                    passesResult.await().onSuccess { passes ->
                        allPasses = passes
                    }.onFailure { err ->
                        context?.let {
                            Toast.makeText(it, "Failed to fetch passes: ${err.localizedMessage}", Toast.LENGTH_SHORT).show()
                        }
                    }

                    logsResult.await().onSuccess { logs ->
                        allLogs = logs
                    }.onFailure { err ->
                        context?.let {
                            Toast.makeText(it, "Failed to fetch logs: ${err.localizedMessage}", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
                applyFilters()
            } catch (e: Exception) {
                context?.let {
                    Toast.makeText(it, "Failed to fetch guard data: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
                }
            } finally {
                if (_binding != null) {
                    binding.guardProgressBar.visibility = View.GONE
                    binding.guardSwipeRefresh.isRefreshing = false
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
