package com.vvas.access.ui.admin

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
import com.vvas.access.databinding.FragmentAdminDashboardBinding
import com.vvas.access.ui.resident.PassDetailDialog
import com.vvas.access.ui.resident.PassesAdapter
import kotlinx.coroutines.async
import kotlinx.coroutines.launch

class AdminDashboardFragment : Fragment() {

    private var _binding: FragmentAdminDashboardBinding? = null
    private val binding get() = _binding!!

    private lateinit var passesAdapter: PassesAdapter
    private lateinit var logsAdapter: AccessLogsAdapter
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
        setupTabs()
        binding.adminSwipeRefresh.setOnRefreshListener { loadDashboardData() }
        loadDashboardData()
    }

    private fun setupRecyclerViews() {
        passesAdapter = PassesAdapter { pass ->
            PassDetailDialog(requireContext(), pass).show()
        }
        binding.rvAdminPasses.layoutManager = LinearLayoutManager(requireContext())
        binding.rvAdminPasses.adapter = passesAdapter

        logsAdapter = AccessLogsAdapter()
        binding.rvAdminLogs.layoutManager = LinearLayoutManager(requireContext())
        binding.rvAdminLogs.adapter = logsAdapter
    }

    private fun setupTabs() {
        val crimson = ContextCompat.getColor(requireContext(), R.color.primary_crimson)
        val textSecondary = ContextCompat.getColor(requireContext(), R.color.text_secondary)
        val white = ContextCompat.getColor(requireContext(), R.color.white)

        fun updateTabs(showLogs: Boolean) {
            showingLogsTab = showLogs
            if (showLogs) {
                binding.btnTabLogs.setBackgroundColor(crimson)
                binding.btnTabLogs.setTextColor(white)
                binding.btnTabPasses.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                binding.btnTabPasses.setTextColor(textSecondary)

                binding.rvAdminLogs.visibility = View.VISIBLE
                binding.rvAdminPasses.visibility = View.GONE
            } else {
                binding.btnTabPasses.setBackgroundColor(crimson)
                binding.btnTabPasses.setTextColor(white)
                binding.btnTabLogs.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                binding.btnTabLogs.setTextColor(textSecondary)

                binding.rvAdminPasses.visibility = View.VISIBLE
                binding.rvAdminLogs.visibility = View.GONE
            }
        }

        binding.btnTabPasses.setOnClickListener { updateTabs(false) }
        binding.btnTabLogs.setOnClickListener { updateTabs(true) }
    }

    private fun loadDashboardData() {
        binding.adminProgressBar.visibility =
            if (binding.adminSwipeRefresh.isRefreshing) View.GONE else View.VISIBLE

        lifecycleScope.launch {
            try {
                val api = ApiClient.getService(requireContext())

                val statsDeferred = async { api.getStats() }
                val passesDeferred = async { api.getPasses() }
                val logsDeferred = async { api.getAccessLogs() }

                val stats = statsDeferred.await()
                val passes = passesDeferred.await()
                val logs = logsDeferred.await()

                // Update Stats
                binding.tvStatInsideCount.text = stats.totalInsideToday.toString()
                binding.tvStatVisitsCount.text = stats.totalVisitsToday.toString()
                binding.tvStatPassesCount.text = stats.passesCreatedToday.toString()

                // Update Lists
                passesAdapter.submitList(passes)
                logsAdapter.submitList(logs)
            } catch (e: Exception) {
                Toast.makeText(
                    requireContext(),
                    "Failed to refresh admin data: ${e.localizedMessage}",
                    Toast.LENGTH_SHORT
                ).show()
            } finally {
                binding.adminProgressBar.visibility = View.GONE
                binding.adminSwipeRefresh.isRefreshing = false
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
