package com.vvas.access.ui.admin

import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.vvas.access.data.api.ApiClient
import com.vvas.access.data.model.CreateApiKeyRequest
import com.vvas.access.data.model.HardwareApiKey
import com.vvas.access.databinding.FragmentAdminKeysBinding
import com.vvas.access.databinding.ItemApiKeyBinding
import com.vvas.access.utils.DateTimeUtils
import kotlinx.coroutines.launch

class AdminApiKeysFragment : Fragment() {

    private var _binding: FragmentAdminKeysBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAdminKeysBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.rvApiKeys.layoutManager = LinearLayoutManager(requireContext())
        binding.keysSwipeRefresh.setOnRefreshListener { loadKeys() }
        binding.btnGenerateApiKey.setOnClickListener { promptCreateKey() }
        loadKeys()
    }

    private fun loadKeys() {
        binding.keysProgressBar.visibility = if (binding.keysSwipeRefresh.isRefreshing) View.GONE else View.VISIBLE
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val keys = ApiClient.getService(requireContext()).getApiKeys()
                if (_binding != null) {
                    binding.tvKeysEmpty.visibility = if (keys.isEmpty()) View.VISIBLE else View.GONE
                    binding.rvApiKeys.adapter = KeysAdapter(keys)
                }
            } catch (e: Exception) {
                context?.let { Toast.makeText(it, "Failed to load API keys: ${e.localizedMessage}", Toast.LENGTH_SHORT).show() }
            } finally {
                if (_binding != null) {
                    binding.keysProgressBar.visibility = View.GONE
                    binding.keysSwipeRefresh.isRefreshing = false
                }
            }
        }
    }

    private fun promptCreateKey() {
        val ctx = requireContext()
        val input = EditText(ctx).apply { hint = "Device description (e.g. Gate Raspberry Pi)" }
        AlertDialog.Builder(ctx)
            .setTitle("Generate Hardware API Key")
            .setView(input)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Generate") { _, _ ->
                val desc = input.text.toString().trim()
                if (desc.isEmpty()) return@setPositiveButton
                viewLifecycleOwner.lifecycleScope.launch {
                    try {
                        val res = ApiClient.getService(ctx).createApiKey(CreateApiKeyRequest(desc))
                        AlertDialog.Builder(ctx)
                            .setTitle("API Key Generated")
                            .setMessage("Copy this key now (shown once):\n\n${res.apiKey}")
                            .setPositiveButton("Copy & Close") { _, _ ->
                                val cb = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                cb.setPrimaryClip(ClipData.newPlainText("VVAS API Key", res.apiKey))
                                Toast.makeText(ctx, "Copied to clipboard", Toast.LENGTH_SHORT).show()
                            }
                            .show()
                        loadKeys()
                    } catch (e: Exception) {
                        Toast.makeText(ctx, "Failed: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
                    }
                }
            }
            .show()
    }

    inner class KeysAdapter(private val items: List<HardwareApiKey>) : RecyclerView.Adapter<KeysAdapter.VH>() {
        inner class VH(val b: ItemApiKeyBinding) : RecyclerView.ViewHolder(b.root)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val b = ItemApiKeyBinding.inflate(LayoutInflater.from(parent.context), parent, false)
            return VH(b)
        }

        override fun getItemCount(): Int = items.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val key = items[position]
            holder.b.tvKeyDesc.text = key.description
            val created = key.createdAt?.let { DateTimeUtils.formatDateTime(it) } ?: ""
            holder.b.tvKeyMeta.text = "Prefix: ${key.keyPrefix ?: "vvas_hw"} • $created"
            holder.b.btnRevokeKey.setOnClickListener {
                AlertDialog.Builder(requireContext())
                    .setTitle("Revoke Key")
                    .setMessage("Revoke '${key.description}'?")
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("Revoke") { _, _ ->
                        viewLifecycleOwner.lifecycleScope.launch {
                            runCatching { ApiClient.getService(requireContext()).revokeApiKey(key.id) }
                                .onSuccess {
                                    Toast.makeText(requireContext(), "Key revoked", Toast.LENGTH_SHORT).show()
                                    loadKeys()
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
