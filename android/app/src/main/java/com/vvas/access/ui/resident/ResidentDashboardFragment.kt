package com.vvas.access.ui.resident

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.vvas.access.data.api.ApiClient
import com.vvas.access.data.model.VisitorPass
import com.vvas.access.data.storage.SessionManager
import com.vvas.access.databinding.FragmentResidentDashboardBinding
import com.vvas.access.utils.PassFilterController
import kotlinx.coroutines.launch

class ResidentDashboardFragment : Fragment() {

    private var _binding: FragmentResidentDashboardBinding? = null
    private val binding get() = _binding!!

    private lateinit var sessionManager: SessionManager
    private lateinit var adapter: PassesAdapter
    private lateinit var filterController: PassFilterController
    private var allPasses: List<VisitorPass> = emptyList()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentResidentDashboardBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        sessionManager = SessionManager(requireContext())

        setupHeader()
        setupRecyclerView()
        setupFilterBar()
        setupListeners()
        loadPasses()
    }

    private fun setupHeader() {
        val user = sessionManager.currentUser
        binding.tvWelcomeResident.text = "Resident: ${user?.fullName ?: "Resident"}"
        binding.tvResidentFlat.text = "Unit / Flat: ${user?.flatNumber ?: "N/A"}"
    }

    private fun setupRecyclerView() {
        adapter = PassesAdapter { pass ->
            PassDetailDialog(requireContext(), pass).show()
        }
        binding.rvPasses.layoutManager = LinearLayoutManager(requireContext())
        binding.rvPasses.adapter = adapter
    }

    private fun setupFilterBar() {
        filterController = PassFilterController(binding.residentFilterBar) {
            applyFilters()
        }
    }

    private fun setupListeners() {
        binding.swipeRefresh.setOnRefreshListener { loadPasses() }

        binding.btnPreRegisterPass.setOnClickListener {
            val bottomSheet = CreatePassBottomSheet { newPass ->
                loadPasses()
                PassDetailDialog(requireContext(), newPass).show()
            }
            bottomSheet.show(parentFragmentManager, "CreatePassBottomSheet")
        }
    }

    private fun applyFilters() {
        if (_binding == null) return

        val filtered = filterController.filterPasses(allPasses)
        adapter.submitList(filtered)
        binding.tvPassesCount.text = "${filtered.size} Passes"

        if (filtered.isEmpty()) {
            binding.layoutEmptyPasses.visibility = View.VISIBLE
            binding.rvPasses.visibility = View.GONE
        } else {
            binding.layoutEmptyPasses.visibility = View.GONE
            binding.rvPasses.visibility = View.VISIBLE
        }
    }

    private fun loadPasses() {
        binding.progressBar.visibility = if (binding.swipeRefresh.isRefreshing) View.GONE else View.VISIBLE

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val api = ApiClient.getService(requireContext())
                val passes = api.getMyPasses()
                if (_binding == null) return@launch

                allPasses = passes
                applyFilters()
            } catch (e: Exception) {
                context?.let {
                    Toast.makeText(it, "Failed to load passes: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
                }
            } finally {
                if (_binding != null) {
                    binding.progressBar.visibility = View.GONE
                    binding.swipeRefresh.isRefreshing = false
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
