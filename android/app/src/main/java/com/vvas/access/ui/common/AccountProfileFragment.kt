package com.vvas.access.ui.common

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.vvas.access.data.storage.SessionManager
import com.vvas.access.databinding.FragmentAccountProfileBinding
import com.vvas.access.ui.auth.LoginActivity
import com.vvas.access.utils.PasswordChangeDialog

class AccountProfileFragment : Fragment() {

    private var _binding: FragmentAccountProfileBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAccountProfileBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val session = SessionManager(requireContext())
        val user = session.currentUser

        binding.tvProfileFullName.text = user?.fullName ?: user?.username ?: "User"
        binding.tvProfileUsername.text = "@${user?.username ?: "—"} • ${user?.role?.uppercase() ?: "USER"}"
        binding.tvProfileEmail.text = "Email: ${user?.email ?: "—"}"
        binding.tvProfileFlat.text = "Unit / Flat: ${user?.flatNumber?.takeIf { it.isNotBlank() } ?: "Campus Gate / Staff"}"
        val url = session.serverUrl
        val halfLen = (url.length / 2).coerceAtLeast(8)
        binding.tvProfileEndpoint.text = "Connected Server: ${url.take(halfLen)}••••"

        binding.btnProfileChangePassword.setOnClickListener {
            PasswordChangeDialog.show(requireContext(), viewLifecycleOwner.lifecycleScope)
        }

        binding.btnProfileLogout.setOnClickListener {
            session.clearSession()
            val intent = Intent(requireContext(), LoginActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
            activity?.finish()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
