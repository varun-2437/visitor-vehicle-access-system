package com.vvas.access.ui.admin

import android.app.AlertDialog
import android.graphics.Color
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.vvas.access.R
import com.vvas.access.data.api.ApiClient
import com.vvas.access.data.model.RegisterRequest
import com.vvas.access.data.model.RejectUserRequest
import com.vvas.access.data.model.User
import com.vvas.access.data.storage.SessionManager
import com.vvas.access.databinding.FragmentAdminUsersBinding
import com.vvas.access.databinding.ItemAdminUserBinding
import kotlinx.coroutines.launch

class AdminUsersFragment : Fragment() {

    private var _binding: FragmentAdminUsersBinding? = null
    private val binding get() = _binding!!

    private var allUsers: List<User> = emptyList()
    private var activeFilter = "pending" // "pending", "approved", "all"

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAdminUsersBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.rvAdminUsers.layoutManager = LinearLayoutManager(requireContext())
        binding.usersSwipeRefresh.setOnRefreshListener { loadUsers() }
        binding.btnCreateUser.setOnClickListener { showCreateUserDialog() }

        binding.tabUsersPending.setOnClickListener { switchTab("pending") }
        binding.tabUsersApproved.setOnClickListener { switchTab("approved") }
        binding.tabUsersAll.setOnClickListener { switchTab("all") }

        loadUsers()
    }

    private fun switchTab(tab: String) {
        activeFilter = tab
        val secondary = ContextCompat.getColor(requireContext(), R.color.text_secondary)
        listOf(
            binding.tabUsersPending to "pending",
            binding.tabUsersApproved to "approved",
            binding.tabUsersAll to "all"
        ).forEach { (tv, key) ->
            if (key == tab) {
                tv.setBackgroundResource(R.drawable.bg_tab_active)
                tv.setTextColor(Color.WHITE)
            } else {
                tv.setBackgroundColor(Color.TRANSPARENT)
                tv.setTextColor(secondary)
            }
        }
        renderList()
    }

    private fun loadUsers() {
        binding.usersProgressBar.visibility = if (binding.usersSwipeRefresh.isRefreshing) View.GONE else View.VISIBLE
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                allUsers = ApiClient.getService(requireContext()).getAdminUsers()
                val pendingCount = allUsers.count { it.approvalStatus == "pending" || (it.isApproved == false && it.approvalStatus != "rejected") }
                val approvedCount = allUsers.count { it.isApproved == true }
                if (_binding != null) {
                    binding.tabUsersPending.text = "Pending ($pendingCount)"
                    binding.tabUsersApproved.text = "Approved ($approvedCount)"
                    binding.tabUsersAll.text = "All (${allUsers.size})"
                    if (pendingCount == 0 && activeFilter == "pending") {
                        switchTab("approved")
                    } else {
                        renderList()
                    }
                }
            } catch (e: Exception) {
                context?.let { Toast.makeText(it, "Failed to load users: ${e.localizedMessage}", Toast.LENGTH_SHORT).show() }
            } finally {
                if (_binding != null) {
                    binding.usersProgressBar.visibility = View.GONE
                    binding.usersSwipeRefresh.isRefreshing = false
                }
            }
        }
    }

    private fun renderList() {
        if (_binding == null) return
        val filtered = when (activeFilter) {
            "pending" -> allUsers.filter { it.approvalStatus == "pending" || (it.isApproved == false && it.approvalStatus != "rejected") }
            "approved" -> allUsers.filter { it.isApproved == true }
            else -> allUsers
        }
        binding.tvUsersEmpty.visibility = if (filtered.isEmpty()) View.VISIBLE else View.GONE
        binding.rvAdminUsers.adapter = UsersAdapter(filtered)
    }

    private fun showCreateUserDialog() {
        val ctx = requireContext()
        val pad = (16 * resources.displayMetrics.density).toInt()
        val layout = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad / 2, pad, pad / 2)
        }
        val etFull = EditText(ctx).apply { hint = "Full Name *" }
        val etUser = EditText(ctx).apply { hint = "Username *" }
        val etEmail = EditText(ctx).apply { hint = "Email *" }
        val etPass = EditText(ctx).apply { hint = "Password *" }
        val etFlat = EditText(ctx).apply { hint = "Flat / Unit (e.g. A-101)" }
        val spRole = Spinner(ctx).apply {
            adapter = ArrayAdapter(ctx, android.R.layout.simple_spinner_dropdown_item, listOf("resident", "guard", "admin", "camera"))
        }
        listOf(etFull, etUser, etEmail, etPass, etFlat, spRole).forEach { layout.addView(it) }

        AlertDialog.Builder(ctx)
            .setTitle("Create New User")
            .setView(layout)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Create") { _, _ ->
                val full = etFull.text.toString().trim()
                val uname = etUser.text.toString().trim()
                val email = etEmail.text.toString().trim()
                val pass = etPass.text.toString().trim()
                val flat = etFlat.text.toString().trim().ifBlank { null }
                val role = spRole.selectedItem.toString()
                if (full.isEmpty() || uname.isEmpty() || email.isEmpty() || pass.isEmpty()) {
                    Toast.makeText(ctx, "Fill all required fields", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                viewLifecycleOwner.lifecycleScope.launch {
                    try {
                        ApiClient.getService(ctx).createAdminUser(RegisterRequest(uname, email, pass, full, role, flat))
                        Toast.makeText(ctx, "User '$uname' created!", Toast.LENGTH_SHORT).show()
                        loadUsers()
                    } catch (e: Exception) {
                        Toast.makeText(ctx, "Create failed: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
                    }
                }
            }
            .show()
    }

    inner class UsersAdapter(private val items: List<User>) : RecyclerView.Adapter<UsersAdapter.VH>() {
        inner class VH(val b: ItemAdminUserBinding) : RecyclerView.ViewHolder(b.root)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val b = ItemAdminUserBinding.inflate(LayoutInflater.from(parent.context), parent, false)
            return VH(b)
        }

        override fun getItemCount(): Int = items.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val user = items[position]
            val b = holder.b
            b.tvUserFullName.text = user.fullName
            b.tvUserMeta.text = "@${user.username} • ${user.email ?: "—"}"
            b.tvUserRoleBadge.text = user.role.uppercase()

            val statusLabel = when {
                user.isApproved == true -> "Approved"
                user.approvalStatus == "rejected" -> "Rejected"
                else -> "Pending Approval"
            }
            val unitLabel = user.flatNumber?.takeIf { it.isNotBlank() }?.let { "Unit: $it • " } ?: ""
            b.tvUserUnitStatus.text = "$unitLabel$statusLabel"

            val isPending = user.isApproved != true && user.approvalStatus != "rejected"
            b.btnApproveUser.visibility = if (isPending) View.VISIBLE else View.GONE
            b.btnRejectUser.visibility = if (isPending) View.VISIBLE else View.GONE

            val currentId = SessionManager(requireContext()).currentUser?.id
            b.btnDeleteUser.visibility = if (user.id != currentId) View.VISIBLE else View.GONE

            b.btnApproveUser.setOnClickListener {
                viewLifecycleOwner.lifecycleScope.launch {
                    runCatching { ApiClient.getService(requireContext()).approveUser(user.id) }
                        .onSuccess {
                            Toast.makeText(requireContext(), "Approved ${user.username}", Toast.LENGTH_SHORT).show()
                            loadUsers()
                        }
                        .onFailure { Toast.makeText(requireContext(), "Error: ${it.localizedMessage}", Toast.LENGTH_SHORT).show() }
                }
            }

            b.btnRejectUser.setOnClickListener {
                val input = EditText(requireContext()).apply { hint = "Rejection reason" }
                AlertDialog.Builder(requireContext())
                    .setTitle("Reject ${user.username}")
                    .setView(input)
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("Reject") { _, _ ->
                        val reason = input.text.toString().trim().ifBlank { "Rejected by Admin" }
                        viewLifecycleOwner.lifecycleScope.launch {
                            runCatching { ApiClient.getService(requireContext()).rejectUser(user.id, RejectUserRequest(reason)) }
                                .onSuccess {
                                    Toast.makeText(requireContext(), "Rejected ${user.username}", Toast.LENGTH_SHORT).show()
                                    loadUsers()
                                }
                                .onFailure { Toast.makeText(requireContext(), "Error: ${it.localizedMessage}", Toast.LENGTH_SHORT).show() }
                        }
                    }
                    .show()
            }

            b.btnDeleteUser.setOnClickListener {
                AlertDialog.Builder(requireContext())
                    .setTitle("Delete User")
                    .setMessage("Delete '${user.username}' permanently?")
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("Delete") { _, _ ->
                        viewLifecycleOwner.lifecycleScope.launch {
                            runCatching { ApiClient.getService(requireContext()).deleteUser(user.id) }
                                .onSuccess {
                                    Toast.makeText(requireContext(), "Deleted ${user.username}", Toast.LENGTH_SHORT).show()
                                    loadUsers()
                                }
                                .onFailure { Toast.makeText(requireContext(), "Error: ${it.localizedMessage}", Toast.LENGTH_SHORT).show() }
                        }
                    }
                    .show()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
