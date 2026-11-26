package com.vvas.access.ui.admin

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
import com.vvas.access.databinding.FragmentAdminDashboardBinding
import com.vvas.access.ui.resident.PassDetailDialog
import com.vvas.access.ui.resident.PassesAdapter
import com.vvas.access.utils.DatePreset
import com.vvas.access.utils.PassFilterController
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope

class AdminDashboardFragment : Fragment() {

    private var _binding: FragmentAdminDashboardBinding? = null
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
        _binding = FragmentAdminDashboardBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupRecyclerViews()
        setupFilterBar()
        setupTabs()
        setupStatCardClicks()
        binding.adminSwipeRefresh.setOnRefreshListener { loadDashboardData() }
        loadDashboardData()
    }

    private fun setupStatCardClicks() {
        binding.cardStatInside.setOnClickListener {
            switchTab(showLogs = false)
            filterController.applyPreset(DatePreset.ALL, "in_campus")
            Toast.makeText(requireContext(), "Showing vehicles inside campus", Toast.LENGTH_SHORT).show()
        }
        binding.cardStatNotInside.setOnClickListener {
            switchTab(showLogs = false)
            filterController.applyPreset(DatePreset.ALL, "not_inside")
            Toast.makeText(requireContext(), "Showing pre-created passes not inside yet", Toast.LENGTH_SHORT).show()
        }
        binding.cardStatVisits.setOnClickListener {
            switchTab(showLogs = true)
            filterController.applyLogPreset(DatePreset.TODAY, "entry")
            Toast.makeText(requireContext(), "Showing today's vehicle visits", Toast.LENGTH_SHORT).show()
        }
        binding.cardStatPasses.setOnClickListener {
            switchTab(showLogs = false)
            filterController.applyPreset(DatePreset.TODAY, "all")
            Toast.makeText(requireContext(), "Showing passes created today", Toast.LENGTH_SHORT).show()
        }
    }

    private fun switchTab(showLogs: Boolean) {
        val textSecondary = ContextCompat.getColor(requireContext(), R.color.text_secondary)
        showingLogsTab = showLogs
        filterController.setLogsMode(showLogs)
        if (showLogs) {
            binding.btnTabLogs.setBackgroundResource(R.drawable.bg_tab_active)
            binding.btnTabLogs.setTextColor(Color.WHITE)
            binding.btnTabPasses.setBackgroundColor(Color.TRANSPARENT)
            binding.btnTabPasses.setTextColor(textSecondary)

            binding.rvAdminLogs.visibility = View.VISIBLE
            binding.rvAdminPasses.visibility = View.GONE
        } else {
            binding.btnTabPasses.setBackgroundResource(R.drawable.bg_tab_active)
            binding.btnTabPasses.setTextColor(Color.WHITE)
            binding.btnTabLogs.setBackgroundColor(Color.TRANSPARENT)
            binding.btnTabLogs.setTextColor(textSecondary)

            binding.rvAdminPasses.visibility = View.VISIBLE
            binding.rvAdminLogs.visibility = View.GONE
        }
        applyFilters()
    }

    private fun setupRecyclerViews() {
        passesAdapter = PassesAdapter { pass ->
            PassDetailDialog(requireContext(), pass) {
                loadDashboardData()
            }.show()
        }
        binding.rvAdminPasses.layoutManager = LinearLayoutManager(requireContext())
        binding.rvAdminPasses.adapter = passesAdapter

        logsAdapter = AccessLogsAdapter()
        binding.rvAdminLogs.layoutManager = LinearLayoutManager(requireContext())
        binding.rvAdminLogs.adapter = logsAdapter
    }

    private fun setupFilterBar() {
        filterController = PassFilterController(binding.adminFilterBar) {
            applyFilters()
        }
    }

    private fun setupTabs() {
        binding.btnTabPasses.setOnClickListener { switchTab(false) }
        binding.btnTabLogs.setOnClickListener { switchTab(true) }
    }

    private fun applyFilters() {
        if (_binding == null) return

        val filteredPasses = filterController.filterPasses(allPasses)
        val filteredLogs = filterController.filterLogs(allLogs)

        passesAdapter.submitList(filteredPasses)
        logsAdapter.submitList(filteredLogs)

        binding.btnTabPasses.text = "Passes (${filteredPasses.size})"
        binding.btnTabLogs.text = "Access Logs (${filteredLogs.size})"

        val isEmpty = if (showingLogsTab) filteredLogs.isEmpty() else filteredPasses.isEmpty()
        binding.tvAdminEmpty.visibility = if (isEmpty) View.VISIBLE else View.GONE
    }

    private fun loadDashboardData() {
        binding.adminProgressBar.visibility =
            if (binding.adminSwipeRefresh.isRefreshing) View.GONE else View.VISIBLE

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val api = ApiClient.getService(requireContext())

                supervisorScope {
                    val statsResult = async { runCatching { api.getStats() } }
                    val passesResult = async {
                        runCatching { api.getTodayPasses(allTime = true) }
                    }
                    val logsResult = async { runCatching { api.getAdminLogs() } }

                    statsResult.await().onSuccess { stats ->
                        if (_binding != null) {
                            binding.tvStatInsideCount.text = stats.vehiclesInside.toString()
                            binding.tvStatNotInsideCount.text = stats.notInsidePasses.toString()
                            binding.tvStatVisitsCount.text = stats.totalVisited.toString()
                            binding.tvStatPassesCount.text = stats.totalPasses.toString()
                        }
                    }.onFailure { err ->
                        context?.let {
                            Toast.makeText(it, "Stats error: ${err.localizedMessage}", Toast.LENGTH_SHORT).show()
                        }
                    }

                    passesResult.await().onSuccess { passes ->
                        allPasses = passes
                    }.onFailure { err ->
                        context?.let {
                            Toast.makeText(it, "Passes error: ${err.localizedMessage}", Toast.LENGTH_SHORT).show()
                        }
                    }

                    logsResult.await().onSuccess { logs ->
                        allLogs = logs
                    }.onFailure { err ->
                        context?.let {
                            Toast.makeText(it, "Logs error: ${err.localizedMessage}", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
                applyFilters()
            } catch (e: Exception) {
                context?.let {
                    Toast.makeText(
                        it,
                        "Failed to refresh admin data: ${e.localizedMessage}",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            } finally {
                if (_binding != null) {
                    binding.adminProgressBar.visibility = View.GONE
                    binding.adminSwipeRefresh.isRefreshing = false
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
