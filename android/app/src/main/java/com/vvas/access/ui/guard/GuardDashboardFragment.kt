package com.vvas.access.ui.guard

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.vvas.access.data.api.ApiClient
import com.vvas.access.data.model.VisitorPass
import com.vvas.access.databinding.FragmentGuardDashboardBinding
import com.vvas.access.ui.resident.PassDetailDialog
import com.vvas.access.ui.resident.PassesAdapter
import kotlinx.coroutines.launch

class GuardDashboardFragment : Fragment() {

    private var _binding: FragmentGuardDashboardBinding? = null
    private val binding get() = _binding!!

    private lateinit var adapter: PassesAdapter
    private var allPasses: List<VisitorPass> = emptyList()

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

        setupRecyclerView()
        setupSearch()
        binding.guardSwipeRefresh.setOnRefreshListener { loadApprovedPasses() }
        loadApprovedPasses()
    }

    private fun setupRecyclerView() {
        adapter = PassesAdapter { pass ->
            PassDetailDialog(requireContext(), pass).show()
        }
        binding.rvGuardPasses.layoutManager = LinearLayoutManager(requireContext())
        binding.rvGuardPasses.adapter = adapter
    }

    private fun setupSearch() {
        binding.etGuardSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                filterPasses(s?.toString().orEmpty())
            }
            override fun afterTextChanged(s: Editable?) {}
        })
    }

    private fun filterPasses(query: String) {
        if (query.isBlank()) {
            adapter.submitList(allPasses)
            return
        }
        val clean = query.trim().lowercase()
        val filtered = allPasses.filter {
            it.visitorName.lowercase().contains(clean) ||
                    (it.vehicleNumber?.lowercase()?.contains(clean) == true) ||
                    it.id.toString().contains(clean)
        }
        adapter.submitList(filtered)
    }

    private fun loadApprovedPasses() {
        binding.guardProgressBar.visibility =
            if (binding.guardSwipeRefresh.isRefreshing) View.GONE else View.VISIBLE

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val api = ApiClient.getService(requireContext())
                val passes = api.getTodayPasses()
                if (_binding == null) return@launch
                allPasses = passes
                filterPasses(binding.etGuardSearch.text.toString())
            } catch (e: Exception) {
                context?.let {
                    Toast.makeText(
                        it,
                        "Failed to fetch approved passes: ${e.localizedMessage}",
                        Toast.LENGTH_SHORT
                    ).show()
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
